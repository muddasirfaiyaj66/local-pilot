import { create } from 'zustand'
import type { AgentPlan, PermissionRequest } from '@shared/agent'
import type {
  AppSettings,
  ChatImage,
  ChatMessage,
  PermissionMode,
  ProviderConfig,
  TestConnectionResult
} from '@shared/types'

function newId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export type InteractionMode = 'chat' | 'agent' | 'plan'

export interface TaskSummary {
  id: string
  title: string
  updatedAt: number
}

export interface TimelineEntry {
  id: string
  kind: 'thought' | 'tool' | 'result' | 'status'
  text: string
  at: number
  ok?: boolean
}

export interface PendingAttachment {
  id: string
  name: string
  kind: 'image' | 'file'
  mimeType: string
  data?: string
  textContent?: string
  size: number
}

export interface PendingFileChange {
  id: string
  path: string
  relativePath: string
  before: string
  after: string
  kind: 'write' | 'edit'
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  contextLimit: number
  estimated: boolean
}

export interface TaskRun {
  requestId: string | null
  kind: 'chat' | 'agent' | 'plan' | null
  isStreaming: boolean
  streamingText: string
  pendingPermission: (PermissionRequest & { agentRequestId: string }) | null
  error: string | null
}

interface TaskSession {
  messages: ChatMessage[]
  plan: AgentPlan | null
  timeline: TimelineEntry[]
  pendingChanges: PendingFileChange[]
  usage: TokenUsage | null
  run: TaskRun
}

interface AppState {
  ready: boolean
  version: string
  settings: AppSettings | null
  providers: ProviderConfig[]
  tasks: TaskSummary[]
  activeTaskId: string | null
  sessions: Record<string, TaskSession>
  /** Maps IPC requestId → taskId for concurrent runs */
  requestToTask: Record<string, string>
  messages: ChatMessage[]
  streamingText: string
  isStreaming: boolean
  activeRequestId: string | null
  error: string | null
  view: 'chat' | 'settings'
  testResult: TestConnectionResult | null
  interactionMode: InteractionMode
  plan: AgentPlan | null
  timeline: TimelineEntry[]
  pendingPermission: (PermissionRequest & { agentRequestId: string; taskId?: string }) | null
  askDraft: string
  attachments: PendingAttachment[]
  pendingChanges: PendingFileChange[]
  usage: TokenUsage | null
  init: () => Promise<void>
  setView: (view: 'chat' | 'settings') => void
  setInteractionMode: (mode: InteractionMode) => void
  setPermissionMode: (mode: PermissionMode) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
  openWorkspace: () => Promise<void>
  setWorkspacePath: (path: string) => Promise<void>
  clearWorkspace: () => Promise<void>
  refreshProviders: () => Promise<void>
  upsertProvider: (
    config: Omit<ProviderConfig, 'hasApiKey'> & { hasApiKey?: boolean },
    apiKey?: string
  ) => Promise<void>
  testProvider: (id: string) => Promise<void>
  newTask: () => void
  selectTask: (id: string) => void
  deleteTask: (id: string) => void
  addAttachment: (att: Omit<PendingAttachment, 'id'>) => void
  removeAttachment: (id: string) => void
  clearAttachments: () => void
  acceptChange: (id: string) => void
  rejectChange: (id: string) => Promise<void>
  acceptAllChanges: () => void
  rejectAllChanges: () => Promise<void>
  sendMessage: (text: string) => Promise<void>
  stopStreaming: () => Promise<void>
  stopTask: (taskId: string) => Promise<void>
  stopAllAgents: () => Promise<void>
  runningTaskIds: () => string[]
  respondPermission: (allow: boolean) => Promise<void>
  respondAsk: (answer: string) => Promise<void>
  setAskDraft: (v: string) => void
}

const emptyRun = (): TaskRun => ({
  requestId: null,
  kind: null,
  isStreaming: false,
  streamingText: '',
  pendingPermission: null,
  error: null
})

const emptySession = (): TaskSession => ({
  messages: [],
  plan: null,
  timeline: [],
  pendingChanges: [],
  usage: null,
  run: emptyRun()
})

function contextLimitForModel(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('gemma') || m.includes('kimi') || m.includes('gpt-4o') || m.includes('claude')) {
    return 128_000
  }
  return 128_000
}

type Set = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void
type Get = () => AppState

function snapshotActive(s: AppState): TaskSession | null {
  if (!s.activeTaskId) return null
  return {
    messages: s.messages,
    plan: s.plan,
    timeline: s.timeline,
    pendingChanges: s.pendingChanges,
    usage: s.usage,
    run: {
      requestId: s.activeRequestId,
      kind:
        s.isStreaming
          ? s.interactionMode === 'chat'
            ? 'chat'
            : s.interactionMode
          : (s.sessions[s.activeTaskId]?.run.kind ?? null),
      isStreaming: s.isStreaming,
      streamingText: s.streamingText,
      pendingPermission: s.pendingPermission,
      error: s.error
    }
  }
}

function persistActive(get: Get, set: Set): void {
  const s = get()
  const snap = snapshotActive(s)
  if (!s.activeTaskId || !snap) return
  set({
    sessions: { ...s.sessions, [s.activeTaskId]: snap }
  })
}

function hydrateFromSession(session: TaskSession): Partial<AppState> {
  return {
    messages: session.messages,
    plan: session.plan,
    timeline: session.timeline,
    pendingChanges: session.pendingChanges,
    usage: session.usage,
    streamingText: session.run.streamingText,
    isStreaming: session.run.isStreaming,
    activeRequestId: session.run.requestId,
    pendingPermission: session.run.pendingPermission,
    error: session.run.error
  }
}

/** Update a task session; mirror onto UI fields when that task is active. */
function patchTask(set: Set, taskId: string, fn: (prev: TaskSession) => TaskSession): void {
  set((state) => {
    const prev = state.sessions[taskId] ?? emptySession()
    const base =
      state.activeTaskId === taskId ? (snapshotActive(state) ?? prev) : prev
    const next = fn(base)
    const sessions = { ...state.sessions, [taskId]: next }
    if (state.activeTaskId === taskId) {
      return { sessions, ...hydrateFromSession(next) }
    }
    return { sessions }
  })
}

function applyUsageToTask(
  set: Set,
  taskId: string,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  estimated: boolean,
  get: Get
): void {
  const provider = get().providers.find((p) => p.id === get().settings?.activeProviderId)
  const limit = contextLimitForModel(provider?.model ?? '')
  patchTask(set, taskId, (prev) => {
    const prompt = usage.promptTokens ?? prev.usage?.promptTokens ?? 0
    const completion = usage.completionTokens ?? prev.usage?.completionTokens ?? 0
    const total = usage.totalTokens ?? prompt + completion
    return {
      ...prev,
      usage: { promptTokens: prompt, completionTokens: completion, totalTokens: total, contextLimit: limit, estimated }
    }
  })
}

let listenersBound = false

function bindGlobalListeners(get: Get, set: Set): void {
  if (listenersBound) return
  listenersBound = true

  window.localpilot.onChatChunk((event) => {
    const taskId = get().requestToTask[event.requestId]
    if (!taskId) return
    const { chunk } = event
    if (chunk.type === 'text') {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: { ...prev.run, streamingText: prev.run.streamingText + chunk.text }
      }))
    } else if (chunk.type === 'usage') {
      applyUsageToTask(set, taskId, chunk, false, get)
    } else if (chunk.type === 'error') {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: {
          ...prev.run,
          error: chunk.message,
          isStreaming: false,
          requestId: null,
          kind: null
        }
      }))
      clearRequest(get, set, event.requestId)
    } else if (chunk.type === 'done') {
      patchTask(set, taskId, (prev) => {
        const completion = Math.ceil(prev.run.streamingText.length / 4)
        const prompt = prev.usage?.promptTokens ?? 0
        const messages =
          prev.run.streamingText.length > 0
            ? [
                ...prev.messages,
                {
                  id: newId(),
                  role: 'assistant' as const,
                  content: prev.run.streamingText,
                  createdAt: Date.now()
                }
              ]
            : prev.messages
        return {
          ...prev,
          messages,
          usage: prev.usage
            ? {
                ...prev.usage,
                completionTokens: prev.usage.estimated
                  ? completion
                  : prev.usage.completionTokens || completion,
                totalTokens: prev.usage.estimated
                  ? prompt + completion
                  : prev.usage.totalTokens || prompt + completion
              }
            : prev.usage,
          run: { ...emptyRun() }
        }
      })
      clearRequest(get, set, event.requestId)
    }
  })

  window.localpilot.onAgentEvent((payload) => {
    const taskId = get().requestToTask[payload.requestId]
    if (!taskId) return
    const { event } = payload
    const requestId = payload.requestId

    if (event.type === 'plan') {
      patchTask(set, taskId, (prev) => ({ ...prev, plan: event.plan }))
    } else if (event.type === 'thought') {
      const entry: TimelineEntry = {
        id: newId(),
        kind: 'thought',
        text: event.text,
        at: Date.now()
      }
      patchTask(set, taskId, (prev) => ({
        ...prev,
        timeline: [...prev.timeline, entry].slice(-80),
        run: { ...prev.run, streamingText: prev.run.streamingText + event.text }
      }))
    } else if (event.type === 'tool_start') {
      const entry: TimelineEntry = {
        id: newId(),
        kind: 'tool',
        text: `${event.toolCall.name} (${event.risk})`,
        at: Date.now()
      }
      patchTask(set, taskId, (prev) => ({
        ...prev,
        timeline: [...prev.timeline, entry].slice(-80)
      }))
    } else if (event.type === 'tool_result') {
      const entry: TimelineEntry = {
        id: newId(),
        kind: 'result',
        text: event.result.ok
          ? event.result.output.slice(0, 120)
          : event.result.error ?? 'failed',
        at: Date.now(),
        ok: event.result.ok
      }
      patchTask(set, taskId, (prev) => {
        let pendingChanges = prev.pendingChanges
        const meta = event.result.meta
        if (
          event.result.ok &&
          meta &&
          typeof meta.path === 'string' &&
          typeof meta.before === 'string' &&
          typeof meta.after === 'string'
        ) {
          const change: PendingFileChange = {
            id: newId(),
            path: meta.path,
            relativePath: String(meta.relativePath ?? meta.path),
            before: meta.before,
            after: meta.after,
            kind: meta.kind === 'edit' ? 'edit' : 'write'
          }
          pendingChanges = [...prev.pendingChanges.filter((c) => c.path !== change.path), change]
        }
        return {
          ...prev,
          timeline: [...prev.timeline, entry].slice(-80),
          pendingChanges
        }
      })
    } else if (event.type === 'usage') {
      applyUsageToTask(set, taskId, event, event.promptTokens == null, get)
    } else if (event.type === 'permission_required') {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: {
          ...prev.run,
          pendingPermission: { ...event.permission, agentRequestId: requestId }
        }
      }))
      // Focus the task that needs approval if none is showing
      if (!get().pendingPermission || get().activeTaskId === taskId) {
        if (get().activeTaskId !== taskId) {
          persistActive(get, set)
          const session = get().sessions[taskId] ?? emptySession()
          set({
            activeTaskId: taskId,
            ...hydrateFromSession(session),
            view: 'chat'
          })
        }
      }
    } else if (event.type === 'error') {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: { ...prev.run, error: event.message }
      }))
    } else if (event.type === 'done') {
      patchTask(set, taskId, (prev) => {
        const streamed = prev.run.streamingText.trim()
        const summary = event.summary?.trim() ?? ''
        // The summary often repeats the streamed answer verbatim; only append new text.
        const summaryIsNew = summary.length > 0 && !streamed.includes(summary)
        const content = streamed
          ? summaryIsNew
            ? `${streamed}\n\n—\n${summary}`
            : streamed
          : summary || 'Agent finished.'
        return {
          ...prev,
          messages: [
            ...prev.messages,
            { id: newId(), role: 'assistant', content, createdAt: Date.now() }
          ],
          run: { ...emptyRun() }
        }
      })
      clearRequest(get, set, requestId)
    } else if (event.type === 'status' && event.status === 'stopped') {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: { ...emptyRun() }
      }))
      clearRequest(get, set, requestId)
    }
  })
}

function clearRequest(get: Get, set: Set, requestId: string): void {
  const { [requestId]: _, ...rest } = get().requestToTask
  void _
  set({ requestToTask: rest })
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  version: '',
  settings: null,
  providers: [],
  tasks: [{ id: 'welcome', title: 'Welcome', updatedAt: Date.now() }],
  activeTaskId: 'welcome',
  sessions: { welcome: emptySession() },
  requestToTask: {},
  messages: [],
  streamingText: '',
  isStreaming: false,
  activeRequestId: null,
  error: null,
  view: 'chat',
  testResult: null,
  interactionMode: 'agent',
  plan: null,
  timeline: [],
  pendingPermission: null,
  askDraft: '',
  attachments: [],
  pendingChanges: [],
  usage: null,

  init: async () => {
    const [version, settings, providers] = await Promise.all([
      window.localpilot.getVersion(),
      window.localpilot.getSettings(),
      window.localpilot.listProviders()
    ])
    set({ version, settings, providers, ready: true })
    bindGlobalListeners(get, set)

    window.localpilot.onAgentKill(() => {
      void get().stopAllAgents()
      set({ error: 'Kill switch: all agents stopped (Ctrl/Cmd+Shift+.)' })
    })
  },

  setView: (view) => set({ view, testResult: null }),
  setInteractionMode: (interactionMode) => set({ interactionMode }),
  setAskDraft: (askDraft) => set({ askDraft }),

  setPermissionMode: async (mode) => {
    const settings = await window.localpilot.setSettings({ permissionMode: mode })
    set({ settings })
  },

  setActiveProvider: async (id) => {
    const settings = await window.localpilot.setSettings({ activeProviderId: id })
    set({ settings })
  },

  openWorkspace: async () => {
    try {
      if (typeof window.localpilot?.openFolder !== 'function') {
        set({ error: 'Open Folder is unavailable — restart LocalPilot.' })
        return
      }
      const folder = await window.localpilot.openFolder()
      if (!folder) return
      // Prefer returned path; re-fetch so chip/banner/settings stay in sync with disk.
      const settings = await window.localpilot.getSettings()
      set({
        settings: { ...settings, workspacePath: folder },
        error: null
      })
    } catch (err) {
      set({
        error: `Could not open folder: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },

  setWorkspacePath: async (path) => {
    const settings = await window.localpilot.setSettings({ workspacePath: path.trim() })
    set({ settings, error: null })
  },

  clearWorkspace: async () => {
    const settings = await window.localpilot.setSettings({ workspacePath: '' })
    set({ settings })
  },

  refreshProviders: async () => {
    set({ providers: await window.localpilot.listProviders() })
  },

  upsertProvider: async (config, apiKey) => {
    await window.localpilot.upsertProvider({ config, apiKey })
    const [providers, settings] = await Promise.all([
      window.localpilot.listProviders(),
      window.localpilot.getSettings()
    ])
    set({ providers, settings })
  },

  testProvider: async (id) => {
    set({ testResult: await window.localpilot.testProvider(id) })
  },

  runningTaskIds: () =>
    Object.entries(get().sessions)
      .filter(([, s]) => s.run.isStreaming)
      .map(([id]) => id),

  newTask: () => {
    persistActive(get, set)
    const id = newId()
    set((s) => ({
      tasks: [{ id, title: 'New chat', updatedAt: Date.now() }, ...s.tasks],
      activeTaskId: id,
      sessions: { ...s.sessions, [id]: emptySession() },
      ...hydrateFromSession(emptySession()),
      attachments: [],
      view: 'chat'
    }))
  },

  selectTask: (id) => {
    persistActive(get, set)
    const session = get().sessions[id] ?? emptySession()
    set({
      activeTaskId: id,
      ...hydrateFromSession(session),
      view: 'chat'
    })
  },

  deleteTask: (id) => {
    const session = get().sessions[id]
    if (session?.run.requestId) {
      void get().stopTask(id)
    }
    const s = get()
    const remaining = s.tasks.filter((t) => t.id !== id)
    const { [id]: _removed, ...sessions } = s.sessions
    void _removed
    if (remaining.length === 0) {
      const nid = newId()
      set({
        tasks: [{ id: nid, title: 'New chat', updatedAt: Date.now() }],
        activeTaskId: nid,
        sessions: { [nid]: emptySession() },
        ...hydrateFromSession(emptySession())
      })
      return
    }
    const nextId = s.activeTaskId === id ? remaining[0]!.id : s.activeTaskId
    const nextSession = sessions[nextId!] ?? emptySession()
    set({
      tasks: remaining,
      sessions,
      activeTaskId: nextId,
      ...hydrateFromSession(nextSession)
    })
  },

  addAttachment: (att) =>
    set((s) => ({
      attachments: [...s.attachments, { ...att, id: newId() }].slice(0, 8)
    })),
  removeAttachment: (id) =>
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),

  acceptChange: (id) => {
    set((s) => ({ pendingChanges: s.pendingChanges.filter((c) => c.id !== id) }))
    persistActive(get, set)
  },

  rejectChange: async (id) => {
    const change = get().pendingChanges.find((c) => c.id === id)
    if (!change) return
    const result = await window.localpilot.restoreFile(change.path, change.before)
    if (!result.ok) {
      set({ error: result.error ?? 'Failed to restore file' })
      return
    }
    set((s) => ({ pendingChanges: s.pendingChanges.filter((c) => c.id !== id) }))
    persistActive(get, set)
  },

  acceptAllChanges: () => {
    set({ pendingChanges: [] })
    persistActive(get, set)
  },

  rejectAllChanges: async () => {
    const changes = [...get().pendingChanges].reverse()
    for (const c of changes) {
      await window.localpilot.restoreFile(c.path, c.before)
    }
    set({ pendingChanges: [] })
    persistActive(get, set)
  },

  stopTask: async (taskId) => {
    const session = get().sessions[taskId] ?? emptySession()
    const requestId = session.run.requestId
    const kind = session.run.kind
    if (requestId) {
      if (kind === 'chat') await window.localpilot.abortChat(requestId)
      else await window.localpilot.abortAgent(requestId)
      clearRequest(get, set, requestId)
    }
    patchTask(set, taskId, (prev) => {
      const text = prev.run.streamingText
      return {
        ...prev,
        messages:
          text.length > 0
            ? [
                ...prev.messages,
                {
                  id: newId(),
                  role: 'assistant',
                  content: text + '\n\n_(stopped)_',
                  createdAt: Date.now()
                }
              ]
            : prev.messages,
        run: { ...emptyRun() }
      }
    })
  },

  stopStreaming: async () => {
    const id = get().activeTaskId
    if (id) await get().stopTask(id)
  },

  stopAllAgents: async () => {
    const ids = get().runningTaskIds()
    await Promise.all(ids.map((id) => get().stopTask(id)))
  },

  respondPermission: async (allow) => {
    const pending = get().pendingPermission
    if (!pending) return
    await window.localpilot.respondPermission({
      requestId: pending.agentRequestId,
      permissionId: pending.requestId,
      allow
    })
    const taskId = pending.taskId ?? get().requestToTask[pending.agentRequestId]
    if (taskId) {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: { ...prev.run, pendingPermission: null }
      }))
    } else {
      set({ pendingPermission: null })
    }
  },

  respondAsk: async (answer) => {
    const pending = get().pendingPermission
    const requestId = pending?.agentRequestId ?? get().activeRequestId
    if (!requestId || !answer.trim()) return
    await window.localpilot.respondAsk({ requestId, answer: answer.trim() })
    const taskId = pending?.taskId ?? get().requestToTask[requestId]
    if (taskId) {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: { ...prev.run, pendingPermission: null }
      }))
    }
    set({ askDraft: '' })
  },

  sendMessage: async (text) => {
    const trimmed = text.trim()
    const attachments = get().attachments
    const taskId = get().activeTaskId
    if (!taskId) return
    if ((!trimmed && attachments.length === 0) || get().isStreaming) return

    const { settings, providers, interactionMode } = get()
    const providerId = settings?.activeProviderId ?? providers[0]?.id
    if (!providerId) {
      set({ error: 'No provider configured. Open Settings to add one.' })
      return
    }

    const provider = providers.find((p) => p.id === providerId)
    const limit = contextLimitForModel(provider?.model ?? '')

    if (interactionMode !== 'chat' && !settings?.workspacePath?.trim()) {
      set({
        error: 'Open a project folder before running Agent / Plan (file tools need a workspace).'
      })
      return
    }

    const images: ChatImage[] = attachments
      .filter((a) => a.kind === 'image' && a.data)
      .map((a) => ({ mimeType: a.mimeType, data: a.data! }))

    const fileNotes = attachments
      .filter((a) => a.kind === 'file')
      .map((a) =>
        a.textContent
          ? `[Attached file: ${a.name}]\n\`\`\`\n${a.textContent.slice(0, 40_000)}\n\`\`\``
          : `[Attached file: ${a.name}]`
      )
      .join('\n\n')

    const content = [trimmed, fileNotes].filter(Boolean).join('\n\n')

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: content || '(attachment)',
      images: images.length ? images : undefined,
      createdAt: Date.now()
    }

    const estPrompt = Math.ceil(
      (get().messages.reduce((n, m) => n + m.content.length, 0) + content.length) / 4
    )

    const runKind: TaskRun['kind'] =
      interactionMode === 'chat' ? 'chat' : interactionMode === 'plan' ? 'plan' : 'agent'

    set((s) => ({
      messages: [...s.messages, userMsg],
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              title: (trimmed || attachments[0]?.name || t.title).slice(0, 48),
              updatedAt: Date.now()
            }
          : t
      ),
      isStreaming: true,
      streamingText: '',
      error: null,
      plan: null,
      timeline: [],
      pendingPermission: null,
      attachments: [],
      usage: {
        promptTokens: estPrompt,
        completionTokens: 0,
        totalTokens: estPrompt,
        contextLimit: limit,
        estimated: true
      }
    }))
    persistActive(get, set)

    try {
      if (interactionMode === 'chat') {
        const history = get().messages.map((m) => ({
          role: m.role,
          content: m.content,
          images: m.images
        }))
        const { requestId } = await window.localpilot.startChat({
          providerId,
          messages: history,
          stream: true
        })
        set((s) => ({
          activeRequestId: requestId,
          requestToTask: { ...s.requestToTask, [requestId]: taskId }
        }))
        patchTask(set, taskId, (prev) => ({
          ...prev,
          run: {
            requestId,
            kind: 'chat',
            isStreaming: true,
            streamingText: '',
            pendingPermission: null,
            error: null
          }
        }))
      } else {
        const { requestId } = await window.localpilot.startAgent({
          providerId,
          goal: content || trimmed,
          mode: interactionMode === 'plan' ? 'plan' : 'agent',
          maxSteps: interactionMode === 'plan' ? 4 : 20
        })
        set((s) => ({
          activeRequestId: requestId,
          requestToTask: { ...s.requestToTask, [requestId]: taskId }
        }))
        patchTask(set, taskId, (prev) => ({
          ...prev,
          run: {
            requestId,
            kind: runKind,
            isStreaming: true,
            streamingText: '',
            pendingPermission: null,
            error: null
          }
        }))
      }
    } catch (err) {
      patchTask(set, taskId, (prev) => ({
        ...prev,
        run: {
          ...emptyRun(),
          error: err instanceof Error ? err.message : String(err)
        }
      }))
    }
  }
}))

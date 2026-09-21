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
  /** base64 for images; text preview/path for files */
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

interface TaskSession {
  messages: ChatMessage[]
  plan: AgentPlan | null
  timeline: TimelineEntry[]
  pendingChanges: PendingFileChange[]
  usage: TokenUsage | null
}

interface AppState {
  ready: boolean
  version: string
  settings: AppSettings | null
  providers: ProviderConfig[]
  tasks: TaskSummary[]
  activeTaskId: string | null
  sessions: Record<string, TaskSession>
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
  pendingPermission: (PermissionRequest & { agentRequestId: string }) | null
  askDraft: string
  attachments: PendingAttachment[]
  pendingChanges: PendingFileChange[]
  usage: TokenUsage | null
  init: () => Promise<void>
  setView: (view: 'chat' | 'settings') => void
  setInteractionMode: (mode: InteractionMode) => void
  setPermissionMode: (mode: PermissionMode) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
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
  respondPermission: (allow: boolean) => Promise<void>
  respondAsk: (answer: string) => Promise<void>
  setAskDraft: (v: string) => void
}

const emptySession = (): TaskSession => ({
  messages: [],
  plan: null,
  timeline: [],
  pendingChanges: [],
  usage: null
})

function contextLimitForModel(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('gemma')) return 128_000
  if (m.includes('gpt-4o') || m.includes('claude')) return 128_000
  if (m.includes('32k')) return 32_000
  return 128_000
}

function persistActive(get: () => AppState, set: Set): void {
  const s = get()
  if (!s.activeTaskId) return
  set({
    sessions: {
      ...s.sessions,
      [s.activeTaskId]: {
        messages: s.messages,
        plan: s.plan,
        timeline: s.timeline,
        pendingChanges: s.pendingChanges,
        usage: s.usage
      }
    }
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  version: '',
  settings: null,
  providers: [],
  tasks: [{ id: 'welcome', title: 'Welcome', updatedAt: Date.now() }],
  activeTaskId: 'welcome',
  sessions: { welcome: emptySession() },
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

    window.localpilot.onAgentKill(() => {
      void get().stopStreaming()
      set({ error: 'Kill switch: agent stopped (Ctrl/Cmd+Shift+Esc)' })
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

  newTask: () => {
    persistActive(get, set)
    const id = newId()
    set((s) => ({
      tasks: [{ id, title: 'New chat', updatedAt: Date.now() }, ...s.tasks],
      activeTaskId: id,
      sessions: { ...s.sessions, [id]: emptySession() },
      messages: [],
      streamingText: '',
      error: null,
      plan: null,
      timeline: [],
      pendingPermission: null,
      pendingChanges: [],
      usage: null,
      attachments: [],
      view: 'chat'
    }))
  },

  selectTask: (id) => {
    persistActive(get, set)
    const session = get().sessions[id] ?? emptySession()
    set({
      activeTaskId: id,
      messages: session.messages,
      plan: session.plan,
      timeline: session.timeline,
      pendingChanges: session.pendingChanges,
      usage: session.usage,
      streamingText: '',
      error: null,
      view: 'chat'
    })
  },

  deleteTask: (id) => {
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
        messages: [],
        plan: null,
        timeline: [],
        pendingChanges: [],
        usage: null,
        streamingText: '',
        error: null
      })
      return
    }
    const nextId = s.activeTaskId === id ? remaining[0].id : s.activeTaskId
    const session = sessions[nextId!] ?? emptySession()
    set({
      tasks: remaining,
      sessions,
      activeTaskId: nextId,
      messages: session.messages,
      plan: session.plan,
      timeline: session.timeline,
      pendingChanges: session.pendingChanges,
      usage: session.usage
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

  stopStreaming: async () => {
    const { activeRequestId, interactionMode } = get()
    if (activeRequestId) {
      if (interactionMode === 'chat') {
        await window.localpilot.abortChat(activeRequestId)
      } else {
        await window.localpilot.abortAgent(activeRequestId)
      }
    }
    set((s) => {
      const text = s.streamingText
      return {
        isStreaming: false,
        activeRequestId: null,
        streamingText: '',
        pendingPermission: null,
        messages:
          text.length > 0
            ? [
                ...s.messages,
                {
                  id: newId(),
                  role: 'assistant' as const,
                  content: text + '\n\n_(stopped)_',
                  createdAt: Date.now()
                }
              ]
            : s.messages
      }
    })
    persistActive(get, set)
  },

  respondPermission: async (allow) => {
    const pending = get().pendingPermission
    if (!pending) return
    await window.localpilot.respondPermission({
      requestId: pending.agentRequestId,
      permissionId: pending.requestId,
      allow
    })
    set({ pendingPermission: null })
  },

  respondAsk: async (answer) => {
    const requestId = get().activeRequestId
    if (!requestId || !answer.trim()) return
    await window.localpilot.respondAsk({ requestId, answer: answer.trim() })
    set({ pendingPermission: null, askDraft: '' })
  },

  sendMessage: async (text) => {
    const trimmed = text.trim()
    const attachments = get().attachments
    if ((!trimmed && attachments.length === 0) || get().isStreaming) return

    const { settings, providers, interactionMode } = get()
    const providerId = settings?.activeProviderId ?? providers[0]?.id
    if (!providerId) {
      set({ error: 'No provider configured. Open Settings to add one.' })
      return
    }

    const provider = providers.find((p) => p.id === providerId)
    const limit = contextLimitForModel(provider?.model ?? '')

    if (interactionMode !== 'chat' && !settings?.workspacePath) {
      set({
        error: 'Set a workspace path in Settings before running the agent (file/shell sandbox).'
      })
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

    set((s) => ({
      messages: [...s.messages, userMsg],
      tasks: s.tasks.map((t) =>
        t.id === s.activeTaskId
          ? { ...t, title: (trimmed || attachments[0]?.name || t.title).slice(0, 48), updatedAt: Date.now() }
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

    if (interactionMode === 'chat') {
      await runChat(providerId, set, get)
    } else {
      await runAgentGoal(content || trimmed, providerId, interactionMode, set, get)
    }
    persistActive(get, set)
  }
}))

type Set = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void
type Get = () => AppState

function applyUsage(
  set: Set,
  get: Get,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  estimated = false
): void {
  const provider = get().providers.find((p) => p.id === get().settings?.activeProviderId)
  const limit = contextLimitForModel(provider?.model ?? '')
  const prompt = usage.promptTokens ?? get().usage?.promptTokens ?? 0
  const completion = usage.completionTokens ?? get().usage?.completionTokens ?? 0
  const total = usage.totalTokens ?? prompt + completion
  set({
    usage: {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      contextLimit: limit,
      estimated
    }
  })
}

async function runChat(providerId: string, set: Set, get: Get): Promise<void> {
  const history = get().messages.map((m) => ({
    role: m.role,
    content: m.content,
    images: m.images
  }))
  let unsubscribe: (() => void) | undefined
  try {
    const { requestId } = await window.localpilot.startChat({
      providerId,
      messages: history,
      stream: true
    })
    set({ activeRequestId: requestId })
    await new Promise<void>((resolve) => {
      unsubscribe = window.localpilot.onChatChunk((event) => {
        if (event.requestId !== requestId) return
        const { chunk } = event
        if (chunk.type === 'text') {
          set((s) => ({ streamingText: s.streamingText + chunk.text }))
        } else if (chunk.type === 'usage') {
          applyUsage(set, get, chunk, false)
        } else if (chunk.type === 'error') {
          set({ error: chunk.message, isStreaming: false, activeRequestId: null })
          resolve()
        } else if (chunk.type === 'done') {
          set((s) => {
            const completion = Math.ceil(s.streamingText.length / 4)
            const prompt = s.usage?.promptTokens ?? 0
            return {
              messages:
                s.streamingText.length > 0
                  ? [
                      ...s.messages,
                      {
                        id: newId(),
                        role: 'assistant',
                        content: s.streamingText,
                        createdAt: Date.now()
                      }
                    ]
                  : s.messages,
              streamingText: '',
              isStreaming: false,
              activeRequestId: null,
              usage: s.usage
                ? {
                    ...s.usage,
                    completionTokens: s.usage.estimated
                      ? completion
                      : s.usage.completionTokens || completion,
                    totalTokens: s.usage.estimated
                      ? prompt + completion
                      : s.usage.totalTokens || prompt + completion
                  }
                : s.usage
            }
          })
          resolve()
        }
      })
    })
  } catch (err) {
    set({
      error: err instanceof Error ? err.message : String(err),
      isStreaming: false,
      activeRequestId: null
    })
  } finally {
    unsubscribe?.()
  }
}

async function runAgentGoal(
  goal: string,
  providerId: string,
  mode: InteractionMode,
  set: Set,
  get: Get
): Promise<void> {
  let unsubscribe: (() => void) | undefined
  try {
    const { requestId } = await window.localpilot.startAgent({
      providerId,
      goal,
      mode: mode === 'plan' ? 'plan' : 'agent',
      maxSteps: mode === 'plan' ? 8 : 20
    })
    set({ activeRequestId: requestId })

    await new Promise<void>((resolve) => {
      unsubscribe = window.localpilot.onAgentEvent((payload) => {
        if (payload.requestId !== requestId) return
        const { event } = payload

        if (event.type === 'plan') {
          set({ plan: event.plan })
        } else if (event.type === 'thought') {
          const entry: TimelineEntry = {
            id: newId(),
            kind: 'thought',
            text: event.text,
            at: Date.now()
          }
          set((s) => ({
            streamingText: s.streamingText + event.text,
            timeline: [...s.timeline, entry].slice(-80)
          }))
        } else if (event.type === 'tool_start') {
          const entry: TimelineEntry = {
            id: newId(),
            kind: 'tool',
            text: `${event.toolCall.name} (${event.risk})`,
            at: Date.now()
          }
          set((s) => ({
            timeline: [...s.timeline, entry].slice(-80)
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
          set((s) => ({
            timeline: [...s.timeline, entry].slice(-80)
          }))
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
            set((s) => ({
              pendingChanges: [...s.pendingChanges.filter((c) => c.path !== change.path), change]
            }))
          }
        } else if (event.type === 'usage') {
          applyUsage(set, get, event, event.promptTokens == null)
        } else if (event.type === 'permission_required') {
          set({
            pendingPermission: { ...event.permission, agentRequestId: requestId }
          })
        } else if (event.type === 'error') {
          set({ error: event.message })
        } else if (event.type === 'done') {
          set((s) => ({
            messages: [
              ...s.messages,
              {
                id: newId(),
                role: 'assistant',
                content:
                  (s.streamingText.trim() || event.summary || 'Agent finished.') +
                  (event.summary && s.streamingText.trim()
                    ? `\n\n—\n${event.summary}`
                    : ''),
                createdAt: Date.now()
              }
            ],
            streamingText: '',
            isStreaming: false,
            activeRequestId: null,
            pendingPermission: null
          }))
          resolve()
        } else if (event.type === 'status' && event.status === 'stopped') {
          set({ isStreaming: false, activeRequestId: null, pendingPermission: null })
          resolve()
        }
      })
    })
  } catch (err) {
    set({
      error: err instanceof Error ? err.message : String(err),
      isStreaming: false,
      activeRequestId: null
    })
  } finally {
    unsubscribe?.()
  }
}

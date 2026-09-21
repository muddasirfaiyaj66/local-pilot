import { create } from 'zustand'
import type { AgentPlan, PermissionRequest } from '@shared/agent'
import type {
  AppSettings,
  ChatMessage,
  PermissionMode,
  ProviderConfig,
  TestConnectionResult
} from '@shared/types'

function newId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

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

interface AppState {
  ready: boolean
  version: string
  settings: AppSettings | null
  providers: ProviderConfig[]
  tasks: TaskSummary[]
  activeTaskId: string | null
  messages: ChatMessage[]
  streamingText: string
  isStreaming: boolean
  activeRequestId: string | null
  error: string | null
  view: 'chat' | 'settings'
  testResult: TestConnectionResult | null
  interactionMode: 'chat' | 'agent'
  plan: AgentPlan | null
  timeline: TimelineEntry[]
  pendingPermission: (PermissionRequest & { agentRequestId: string }) | null
  askDraft: string
  init: () => Promise<void>
  setView: (view: 'chat' | 'settings') => void
  setInteractionMode: (mode: 'chat' | 'agent') => void
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
  sendMessage: (text: string) => Promise<void>
  stopStreaming: () => Promise<void>
  respondPermission: (allow: boolean) => Promise<void>
  respondAsk: (answer: string) => Promise<void>
  setAskDraft: (v: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  version: '',
  settings: null,
  providers: [],
  tasks: [{ id: 'welcome', title: 'Welcome', updatedAt: Date.now() }],
  activeTaskId: 'welcome',
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
    const id = newId()
    set((s) => ({
      tasks: [{ id, title: 'New task', updatedAt: Date.now() }, ...s.tasks],
      activeTaskId: id,
      messages: [],
      streamingText: '',
      error: null,
      plan: null,
      timeline: [],
      pendingPermission: null,
      view: 'chat'
    }))
  },

  selectTask: (id) => set({ activeTaskId: id, view: 'chat' }),

  stopStreaming: async () => {
    const { activeRequestId, interactionMode } = get()
    if (activeRequestId) {
      if (interactionMode === 'agent') {
        await window.localpilot.abortAgent(activeRequestId)
      } else {
        await window.localpilot.abortChat(activeRequestId)
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
    const pending = get().pendingPermission
    const requestId = get().activeRequestId
    if (!requestId || !answer.trim()) return
    await window.localpilot.respondAsk({ requestId, answer: answer.trim() })
    set({ pendingPermission: null, askDraft: '' })
    void pending
  },

  sendMessage: async (text) => {
    const trimmed = text.trim()
    if (!trimmed || get().isStreaming) return

    const { settings, providers, interactionMode } = get()
    const providerId = settings?.activeProviderId ?? providers[0]?.id
    if (!providerId) {
      set({ error: 'No provider configured. Open Settings to add one.' })
      return
    }

    if (interactionMode === 'agent' && !settings?.workspacePath) {
      set({
        error: 'Set a workspace path in Settings before running the agent (file/shell sandbox).'
      })
    }

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now()
    }

    set((s) => ({
      messages: [...s.messages, userMsg],
      tasks: s.tasks.map((t) =>
        t.id === s.activeTaskId
          ? { ...t, title: trimmed.slice(0, 48) || t.title, updatedAt: Date.now() }
          : t
      ),
      isStreaming: true,
      streamingText: '',
      error: null,
      plan: null,
      timeline: [],
      pendingPermission: null
    }))

    if (interactionMode === 'agent') {
      await runAgentGoal(trimmed, providerId, set, get)
    } else {
      await runChat(trimmed, providerId, set, get)
    }
  }
}))

type Set = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void
type Get = () => AppState

async function runChat(
  _text: string,
  providerId: string,
  set: Set,
  get: Get
): Promise<void> {
  const history = get().messages.map((m) => ({ role: m.role, content: m.content }))
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
        } else if (chunk.type === 'error') {
          set({ error: chunk.message, isStreaming: false, activeRequestId: null })
          resolve()
        } else if (chunk.type === 'done') {
          set((s) => ({
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
            activeRequestId: null
          }))
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

async function runAgentGoal(goal: string, providerId: string, set: Set, _get: Get): Promise<void> {
  let unsubscribe: (() => void) | undefined
  try {
    const { requestId } = await window.localpilot.startAgent({
      providerId,
      goal,
      maxSteps: 20
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

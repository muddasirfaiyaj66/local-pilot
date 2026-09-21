import { create } from 'zustand'
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
  init: () => Promise<void>
  setView: (view: 'chat' | 'settings') => void
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
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  version: '',
  settings: null,
  providers: [],
  tasks: [
    {
      id: 'welcome',
      title: 'Welcome',
      updatedAt: Date.now()
    }
  ],
  activeTaskId: 'welcome',
  messages: [],
  streamingText: '',
  isStreaming: false,
  activeRequestId: null,
  error: null,
  view: 'chat',
  testResult: null,

  init: async () => {
    const [version, settings, providers] = await Promise.all([
      window.localpilot.getVersion(),
      window.localpilot.getSettings(),
      window.localpilot.listProviders()
    ])
    set({ version, settings, providers, ready: true })
  },

  setView: (view) => set({ view, testResult: null }),

  setPermissionMode: async (mode) => {
    const settings = await window.localpilot.setSettings({ permissionMode: mode })
    set({ settings })
  },

  setActiveProvider: async (id) => {
    const settings = await window.localpilot.setSettings({ activeProviderId: id })
    set({ settings })
  },

  refreshProviders: async () => {
    const providers = await window.localpilot.listProviders()
    set({ providers })
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
    set({ testResult: null })
    const result = await window.localpilot.testProvider(id)
    set({ testResult: result })
  },

  newTask: () => {
    const id = newId()
    const task: TaskSummary = { id, title: 'New task', updatedAt: Date.now() }
    set((s) => ({
      tasks: [task, ...s.tasks],
      activeTaskId: id,
      messages: [],
      streamingText: '',
      error: null,
      view: 'chat'
    }))
  },

  selectTask: (id) => {
    set({ activeTaskId: id, view: 'chat' })
  },

  stopStreaming: async () => {
    const { activeRequestId } = get()
    if (activeRequestId) {
      await window.localpilot.abortChat(activeRequestId)
    }
    set((s) => {
      const text = s.streamingText
      const messages =
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
      return {
        isStreaming: false,
        activeRequestId: null,
        streamingText: '',
        messages
      }
    })
  },

  sendMessage: async (text) => {
    const trimmed = text.trim()
    if (!trimmed || get().isStreaming) return

    const { settings, providers } = get()
    const providerId = settings?.activeProviderId ?? providers[0]?.id
    if (!providerId) {
      set({ error: 'No provider configured. Open Settings to add one.' })
      return
    }

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now()
    }

    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === s.activeTaskId
          ? { ...t, title: trimmed.slice(0, 48) || t.title, updatedAt: Date.now() }
          : t
      )
      return {
        messages: [...s.messages, userMsg],
        tasks,
        isStreaming: true,
        streamingText: '',
        error: null
      }
    })

    const history = get().messages.map((m) => ({
      role: m.role,
      content: m.content
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
          } else if (chunk.type === 'error') {
            set({ error: chunk.message, isStreaming: false, activeRequestId: null })
            resolve()
          } else if (chunk.type === 'done') {
            set((s) => {
              const content = s.streamingText
              return {
                messages:
                  content.length > 0
                    ? [
                        ...s.messages,
                        {
                          id: newId(),
                          role: 'assistant',
                          content,
                          createdAt: Date.now()
                        }
                      ]
                    : s.messages,
                streamingText: '',
                isStreaming: false,
                activeRequestId: null
              }
            })
            resolve()
          } else if (chunk.type === 'tool_call') {
            // Phase 1: surface tool calls as visible notes (execution in Phase 2)
            set((s) => ({
              streamingText:
                s.streamingText +
                `\n\n[tool call: ${chunk.toolCall.name}(${JSON.stringify(chunk.toolCall.arguments)})]\n`
            }))
          }
        })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isStreaming: false, activeRequestId: null })
    } finally {
      unsubscribe?.()
    }
  }
}))

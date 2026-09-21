import type {
  AppSettings,
  ChatRequest,
  ChatStreamChunk,
  ProviderConfig,
  TestConnectionResult
} from './schemas'
import type {
  AgentEvent,
  AgentStartRequest,
  PermissionRequest
} from './agent'

/** IPC channel names — single source of truth for main/preload/renderer */
export const IpcChannels = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  providerList: 'provider:list',
  providerUpsert: 'provider:upsert',
  providerDelete: 'provider:delete',
  providerSetApiKey: 'provider:set-api-key',
  providerTest: 'provider:test',
  chatStart: 'chat:start',
  chatAbort: 'chat:abort',
  chatChunk: 'chat:chunk',
  agentStart: 'agent:start',
  agentAbort: 'agent:abort',
  agentEvent: 'agent:event',
  agentPermissionRespond: 'agent:permission-respond',
  agentAskRespond: 'agent:ask-respond',
  agentKill: 'agent:kill',
  screenPreview: 'screen:preview',
  appGetVersion: 'app:get-version',
  appGetPlatform: 'app:get-platform',
  appCheckUpdates: 'app:check-updates',
  fsRestore: 'fs:restore',
  dialogOpenFolder: 'dialog:open-folder',
  shellOpenExternal: 'shell:open-external',
  procList: 'proc:list',
  procStop: 'proc:stop'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export interface ProviderUpsertInput {
  config: Omit<ProviderConfig, 'hasApiKey'> & { hasApiKey?: boolean }
  apiKey?: string
}

export interface ChatStartResult {
  requestId: string
}

export interface ChatChunkEvent {
  requestId: string
  chunk: ChatStreamChunk
}

export interface AgentStartResult {
  requestId: string
}

export interface AgentEventPayload {
  requestId: string
  event: AgentEvent
}

export interface PermissionResponse {
  requestId: string
  permissionId: string
  allow: boolean
}

export interface AskResponse {
  requestId: string
  answer: string
}

export interface UpdateCheckResult {
  status: 'dev' | 'checking' | 'available' | 'not-available' | 'error'
  version?: string
  message?: string
}

export interface LocalPilotApi {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  checkForUpdates: () => Promise<UpdateCheckResult>
  getSettings: () => Promise<AppSettings>
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  listProviders: () => Promise<ProviderConfig[]>
  upsertProvider: (input: ProviderUpsertInput) => Promise<ProviderConfig>
  deleteProvider: (id: string) => Promise<void>
  setProviderApiKey: (id: string, apiKey: string) => Promise<void>
  testProvider: (id: string) => Promise<TestConnectionResult>
  startChat: (request: ChatRequest) => Promise<ChatStartResult>
  abortChat: (requestId: string) => Promise<void>
  onChatChunk: (handler: (event: ChatChunkEvent) => void) => () => void
  startAgent: (request: AgentStartRequest) => Promise<AgentStartResult>
  abortAgent: (requestId: string) => Promise<void>
  respondPermission: (response: PermissionResponse) => Promise<void>
  respondAsk: (response: AskResponse) => Promise<void>
  onAgentEvent: (handler: (payload: AgentEventPayload) => void) => () => void
  onAgentKill: (handler: () => void) => () => void
  getScreenPreview: () => Promise<{
    ok: boolean
    dataUrl?: string
    width?: number
    height?: number
    error?: string
  }>
  restoreFile: (path: string, content: string) => Promise<{ ok: boolean; error?: string }>
  openFolder: () => Promise<string | null>
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
  listProcesses: () => Promise<RunningProcess[]>
  stopProcess: (id: string) => Promise<{ ok: boolean }>
}

export interface RunningProcess {
  id: string
  command: string
  cwd: string
  url: string | null
  running: boolean
  startedAt: number
}

export type { AgentStartRequest, PermissionRequest }

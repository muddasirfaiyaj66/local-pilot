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
  appGetVersion: 'app:get-version',
  appGetPlatform: 'app:get-platform'
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

export interface LocalPilotApi {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
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
}

export type { AgentStartRequest, PermissionRequest }

import type {
  AppSettings,
  ChatRequest,
  ChatStreamChunk,
  ProviderConfig,
  TestConnectionResult
} from './schemas'

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
}

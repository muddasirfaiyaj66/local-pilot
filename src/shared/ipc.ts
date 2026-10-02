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
  sessionsLoad: 'sessions:load',
  sessionsSave: 'sessions:save',
  dialogOpenFolder: 'dialog:open-folder',
  shellOpenExternal: 'shell:open-external',
  procList: 'proc:list',
  procStop: 'proc:stop',
  workspaceTree: 'workspace:tree',
  workspaceSearchFiles: 'workspace:search-files',
  workspaceReadFile: 'workspace:read-file',
  providerModels: 'provider:models',
  mcpGet: 'mcp:get',
  mcpSave: 'mcp:save',
  auditRecent: 'audit:recent',
  memoryList: 'memory:list',
  memoryDelete: 'memory:delete'
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
  restoreFile: (
    path: string,
    content: string,
    created?: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  loadSessions: () => Promise<PersistedSessionsPayload | null>
  saveSessions: (state: PersistedSessionsPayload) => Promise<{ ok: boolean }>
  openFolder: () => Promise<string | null>
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
  listProcesses: () => Promise<RunningProcess[]>
  stopProcess: (id: string) => Promise<{ ok: boolean }>
  workspaceTree: () => Promise<WorkspaceTreeNode[]>
  searchWorkspaceFiles: (query: string) => Promise<string[]>
  readWorkspaceFile: (path: string) => Promise<{ ok: boolean; text?: string; error?: string }>
  listProviderModels: (providerId: string) => Promise<string[]>
  getMcpConfig: () => Promise<{ servers: McpServerConfig[] }>
  saveMcpConfig: (
    config: { servers: McpServerConfig[] }
  ) => Promise<{ ok: boolean; error?: string; tools?: number }>
  recentAudit: () => Promise<AuditRow[]>
  listMemoryNotes: () => Promise<MemoryNoteRow[]>
  deleteMemoryNote: (id: number) => Promise<{ ok: boolean }>
}

export interface WorkspaceTreeNode {
  name: string
  path: string
  dir: boolean
  children?: WorkspaceTreeNode[]
}

export interface MemoryNoteRow {
  id: number
  kind: string
  content: string
  createdAt: number
}

export interface McpServerConfig {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface AuditRow {
  timestamp: number
  toolName: string
  risk: string
  preview: string
  ok: boolean
  detail?: string
}

export interface PersistedSessionsPayload {
  tasks: Array<{ id: string; title: string; updatedAt: number }>
  activeTaskId: string | null
  sessions: Record<string, unknown>
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

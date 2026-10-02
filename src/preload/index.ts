import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type AgentEventPayload,
  type AskResponse,
  type ChatChunkEvent,
  type AuditRow,
  type LocalPilotApi,
  type McpServerConfig,
  type PermissionResponse,
  type PersistedSessionsPayload,
  type ProviderUpsertInput,
  type RunningProcess,
  type UpdateCheckResult,
  type WorkspaceTreeNode
} from '../shared/ipc'
import type { AgentStartRequest } from '../shared/agent'
import type { AppSettings, ChatRequest, ProviderConfig, TestConnectionResult } from '../shared/types'

const api: LocalPilotApi = {
  getVersion: () => ipcRenderer.invoke(IpcChannels.appGetVersion) as Promise<string>,
  getPlatform: () => ipcRenderer.invoke(IpcChannels.appGetPlatform) as Promise<string>,
  checkForUpdates: () =>
    ipcRenderer.invoke(IpcChannels.appCheckUpdates) as Promise<UpdateCheckResult>,
  getSettings: () => ipcRenderer.invoke(IpcChannels.settingsGet) as Promise<AppSettings>,
  setSettings: (partial) =>
    ipcRenderer.invoke(IpcChannels.settingsSet, partial) as Promise<AppSettings>,
  listProviders: () => ipcRenderer.invoke(IpcChannels.providerList) as Promise<ProviderConfig[]>,
  upsertProvider: (input: ProviderUpsertInput) =>
    ipcRenderer.invoke(IpcChannels.providerUpsert, input) as Promise<ProviderConfig>,
  deleteProvider: (id) => ipcRenderer.invoke(IpcChannels.providerDelete, id) as Promise<void>,
  setProviderApiKey: (id, apiKey) =>
    ipcRenderer.invoke(IpcChannels.providerSetApiKey, id, apiKey) as Promise<void>,
  testProvider: (id) =>
    ipcRenderer.invoke(IpcChannels.providerTest, id) as Promise<TestConnectionResult>,
  startChat: (request: ChatRequest) =>
    ipcRenderer.invoke(IpcChannels.chatStart, request) as Promise<{ requestId: string }>,
  abortChat: (requestId) => ipcRenderer.invoke(IpcChannels.chatAbort, requestId) as Promise<void>,
  onChatChunk: (handler) => {
    const listener = (_event: IpcRendererEvent, data: ChatChunkEvent): void => {
      handler(data)
    }
    ipcRenderer.on(IpcChannels.chatChunk, listener)
    return () => {
      ipcRenderer.removeListener(IpcChannels.chatChunk, listener)
    }
  },
  startAgent: (request: AgentStartRequest) =>
    ipcRenderer.invoke(IpcChannels.agentStart, request) as Promise<{ requestId: string }>,
  abortAgent: (requestId) => ipcRenderer.invoke(IpcChannels.agentAbort, requestId) as Promise<void>,
  respondPermission: (response: PermissionResponse) =>
    ipcRenderer.invoke(IpcChannels.agentPermissionRespond, response) as Promise<void>,
  respondAsk: (response: AskResponse) =>
    ipcRenderer.invoke(IpcChannels.agentAskRespond, response) as Promise<void>,
  onAgentEvent: (handler) => {
    const listener = (_event: IpcRendererEvent, data: AgentEventPayload): void => {
      handler(data)
    }
    ipcRenderer.on(IpcChannels.agentEvent, listener)
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentEvent, listener)
    }
  },
  onAgentKill: (handler) => {
    const listener = (): void => {
      handler()
    }
    ipcRenderer.on(IpcChannels.agentKill, listener)
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentKill, listener)
    }
  },
  getScreenPreview: () =>
    ipcRenderer.invoke(IpcChannels.screenPreview) as Promise<{
      ok: boolean
      dataUrl?: string
      width?: number
      height?: number
      error?: string
    }>,
  restoreFile: (path, content, created) =>
    ipcRenderer.invoke(IpcChannels.fsRestore, path, content, created) as Promise<{
      ok: boolean
      error?: string
    }>,
  loadSessions: () =>
    ipcRenderer.invoke(IpcChannels.sessionsLoad) as Promise<PersistedSessionsPayload | null>,
  saveSessions: (state) =>
    ipcRenderer.invoke(IpcChannels.sessionsSave, state) as Promise<{ ok: boolean }>,
  openFolder: () => ipcRenderer.invoke(IpcChannels.dialogOpenFolder) as Promise<string | null>,
  openExternal: (url: string) =>
    ipcRenderer.invoke(IpcChannels.shellOpenExternal, url) as Promise<{
      ok: boolean
      error?: string
    }>,
  listProcesses: () => ipcRenderer.invoke(IpcChannels.procList) as Promise<RunningProcess[]>,
  stopProcess: (id: string) =>
    ipcRenderer.invoke(IpcChannels.procStop, id) as Promise<{ ok: boolean }>,
  workspaceTree: () => ipcRenderer.invoke(IpcChannels.workspaceTree) as Promise<WorkspaceTreeNode[]>,
  searchWorkspaceFiles: (query: string) =>
    ipcRenderer.invoke(IpcChannels.workspaceSearchFiles, query) as Promise<string[]>,
  readWorkspaceFile: (path: string) =>
    ipcRenderer.invoke(IpcChannels.workspaceReadFile, path) as Promise<{
      ok: boolean
      text?: string
      error?: string
    }>,
  listProviderModels: (providerId: string) =>
    ipcRenderer.invoke(IpcChannels.providerModels, providerId) as Promise<string[]>,
  getMcpConfig: () =>
    ipcRenderer.invoke(IpcChannels.mcpGet) as Promise<{ servers: McpServerConfig[] }>,
  saveMcpConfig: (config: { servers: McpServerConfig[] }) =>
    ipcRenderer.invoke(IpcChannels.mcpSave, config) as Promise<{ ok: boolean; error?: string }>,
  recentAudit: () => ipcRenderer.invoke(IpcChannels.auditRecent) as Promise<AuditRow[]>
}

contextBridge.exposeInMainWorld('localpilot', api)

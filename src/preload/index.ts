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
  type MemoryNoteRow,
  type UpdateCheckResult,
  type WorkspaceTreeNode,
  type TextSearchHit,
  type TerminalDataEvent,
  type TerminalExitEvent
} from '../shared/ipc'
import type { InstalledPlugin } from '../shared/plugins'
import type { AgentStartRequest } from '../shared/agent'
import type { AppSettings, ChatRequest, ProviderConfig, TestConnectionResult } from '../shared/types'
import type { WorkflowDefinition, WorkflowRun } from '../shared/workflow'
import type { WorkflowTriggerConfig } from '../shared/workflowTriggers'

const api: LocalPilotApi = {
  listWorkflows: () => ipcRenderer.invoke(IpcChannels.workflowList) as Promise<WorkflowDefinition[]>,
  saveWorkflowDefinition: (definition) => ipcRenderer.invoke(IpcChannels.workflowSave, definition) as Promise<WorkflowDefinition>,
  deleteWorkflowDefinition: (id) => ipcRenderer.invoke(IpcChannels.workflowDelete, id) as Promise<void>,
  validateWorkflow: (definition) => ipcRenderer.invoke(IpcChannels.workflowValidate, definition) as Promise<{ ok: boolean; errors: string[] }>,
  startWorkflow: (request) => ipcRenderer.invoke(IpcChannels.workflowStart, request) as Promise<{ runId: string }>,
  listWorkflowRuns: (workflowId) => ipcRenderer.invoke(IpcChannels.workflowRuns, workflowId) as Promise<WorkflowRun[]>,
  getWorkflowRun: (runId) => ipcRenderer.invoke(IpcChannels.workflowRun, runId) as Promise<WorkflowRun | null>,
  pauseWorkflow: (runId) => ipcRenderer.invoke(IpcChannels.workflowPause, runId) as Promise<void>,
  resumeWorkflow: (runId) => ipcRenderer.invoke(IpcChannels.workflowResume, runId) as Promise<void>,
  cancelWorkflow: (runId) => ipcRenderer.invoke(IpcChannels.workflowCancel, runId) as Promise<void>,
  respondWorkflowApproval: (runId, nodeId, allowed) => ipcRenderer.invoke(IpcChannels.workflowApprove, runId, nodeId, allowed) as Promise<void>,
  listWorkflowApprovals: (runId) => ipcRenderer.invoke(IpcChannels.workflowApprovals, runId) as Promise<Array<{ nodeId: string; prompt: string; kind: 'approval' | 'question' }>>,
  answerWorkflowQuestion: (runId, nodeId, answer) => ipcRenderer.invoke(IpcChannels.workflowAnswer, runId, nodeId, answer) as Promise<void>,
  listWorkflowRevisions: (workflowId) => ipcRenderer.invoke(IpcChannels.workflowRevisions, workflowId) as Promise<Array<{ revision: number; definition: WorkflowDefinition }>>,
  restoreWorkflowRevision: (workflowId, revision) => ipcRenderer.invoke(IpcChannels.workflowRestoreRevision, workflowId, revision) as Promise<WorkflowDefinition>,
  listWorkflowEvents: (runId) => ipcRenderer.invoke(IpcChannels.workflowEvents, runId) as Promise<Array<{ id: number; runId: string; type: string; payload: unknown; createdAt: number }>>,
  listWorkflowTriggers: (workflowId) => ipcRenderer.invoke(IpcChannels.workflowTriggerList, workflowId) as Promise<WorkflowTriggerConfig[]>,
  saveWorkflowTrigger: (trigger) => ipcRenderer.invoke(IpcChannels.workflowTriggerSave, trigger) as Promise<{ trigger: WorkflowTriggerConfig; token?: string }>,
  deleteWorkflowTrigger: (id) => ipcRenderer.invoke(IpcChannels.workflowTriggerDelete, id) as Promise<void>,
  dryRunWorkflow: (workflowId) => ipcRenderer.invoke(IpcChannels.workflowDryRun, workflowId) as Promise<Array<{ nodeId: string; kind: string; label: string; risk?: string }>>,
  replayUnknownWorkflowNode: (runId, nodeId, confirm) => ipcRenderer.invoke(IpcChannels.workflowReplay, runId, nodeId, confirm) as Promise<void>,
  onWorkflowEvent: (handler) => {
    const listener = (_event: IpcRendererEvent, run: WorkflowRun): void => handler(run)
    ipcRenderer.on(IpcChannels.workflowEvent, listener)
    return () => ipcRenderer.removeListener(IpcChannels.workflowEvent, listener)
  },
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
  workspaceChildren: (path: string) =>
    ipcRenderer.invoke(IpcChannels.workspaceChildren, path) as Promise<WorkspaceTreeNode[]>,
  searchWorkspaceFiles: (query: string) =>
    ipcRenderer.invoke(IpcChannels.workspaceSearchFiles, query) as Promise<string[]>,
  readWorkspaceFile: (path: string, maxChars?: number) =>
    ipcRenderer.invoke(IpcChannels.workspaceReadFile, path, maxChars) as Promise<{
      ok: boolean
      text?: string
      error?: string
    }>,
  writeWorkspaceFile: (path: string, content: string) =>
    ipcRenderer.invoke(IpcChannels.workspaceWriteFile, path, content) as Promise<{
      ok: boolean
      error?: string
    }>,
  searchWorkspaceText: (query, options) =>
    ipcRenderer.invoke(IpcChannels.workspaceSearchText, query, options) as Promise<TextSearchHit[]>,
  createWorkspaceEntry: (path, dir) =>
    ipcRenderer.invoke(IpcChannels.workspaceCreate, path, dir) as Promise<{ ok: boolean; error?: string }>,
  renameWorkspaceEntry: (from, to) =>
    ipcRenderer.invoke(IpcChannels.workspaceRename, from, to) as Promise<{ ok: boolean; error?: string }>,
  deleteWorkspaceEntry: (path) =>
    ipcRenderer.invoke(IpcChannels.workspaceDelete, path) as Promise<{ ok: boolean; error?: string }>,
  runTerminal: (command) =>
    ipcRenderer.invoke(IpcChannels.terminalRun, command) as Promise<{ ok: boolean; id?: string; error?: string }>,
  writeTerminal: (id, text) =>
    ipcRenderer.invoke(IpcChannels.terminalInput, id, text) as Promise<{ ok: boolean }>,
  killTerminal: (id) => ipcRenderer.invoke(IpcChannels.terminalKill, id) as Promise<{ ok: boolean }>,
  onTerminalData: (handler) => {
    const listener = (_event: IpcRendererEvent, data: TerminalDataEvent): void => handler(data)
    ipcRenderer.on(IpcChannels.terminalData, listener)
    return () => ipcRenderer.removeListener(IpcChannels.terminalData, listener)
  },
  onTerminalExit: (handler) => {
    const listener = (_event: IpcRendererEvent, data: TerminalExitEvent): void => handler(data)
    ipcRenderer.on(IpcChannels.terminalExit, listener)
    return () => ipcRenderer.removeListener(IpcChannels.terminalExit, listener)
  },
  listPlugins: () => ipcRenderer.invoke(IpcChannels.pluginList) as Promise<InstalledPlugin[]>,
  installPlugin: (manifest) =>
    ipcRenderer.invoke(IpcChannels.pluginInstall, manifest) as Promise<{ ok: boolean; error?: string }>,
  uninstallPlugin: (id) =>
    ipcRenderer.invoke(IpcChannels.pluginUninstall, id) as Promise<{ ok: boolean; error?: string }>,
  setPluginEnabled: (id, enabled) =>
    ipcRenderer.invoke(IpcChannels.pluginSetEnabled, id, enabled) as Promise<{ ok: boolean; error?: string }>,
  importPlugin: () =>
    ipcRenderer.invoke(IpcChannels.pluginImport) as Promise<{ ok: boolean; error?: string; canceled?: boolean }>,
  openPluginFolder: () => ipcRenderer.invoke(IpcChannels.pluginOpenFolder) as Promise<{ ok: boolean }>,
  listProviderModels: (providerId: string) =>
    ipcRenderer.invoke(IpcChannels.providerModels, providerId) as Promise<string[]>,
  getMcpConfig: () =>
    ipcRenderer.invoke(IpcChannels.mcpGet) as Promise<{ servers: McpServerConfig[] }>,
  saveMcpConfig: (config: { servers: McpServerConfig[] }) =>
    ipcRenderer.invoke(IpcChannels.mcpSave, config) as Promise<{
      ok: boolean
      error?: string
      tools?: number
    }>,
  recentAudit: () => ipcRenderer.invoke(IpcChannels.auditRecent) as Promise<AuditRow[]>,
  listMemoryNotes: () => ipcRenderer.invoke(IpcChannels.memoryList) as Promise<MemoryNoteRow[]>,
  deleteMemoryNote: (id: number) =>
    ipcRenderer.invoke(IpcChannels.memoryDelete, id) as Promise<{ ok: boolean }>
}

contextBridge.exposeInMainWorld('localpilot', api)

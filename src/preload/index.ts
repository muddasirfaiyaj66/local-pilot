import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type AgentEventPayload,
  type AskResponse,
  type ChatChunkEvent,
  type LocalPilotApi,
  type PermissionResponse,
  type ProviderUpsertInput
} from '../shared/ipc'
import type { AgentStartRequest } from '../shared/agent'
import type { AppSettings, ChatRequest, ProviderConfig, TestConnectionResult } from '../shared/types'

const api: LocalPilotApi = {
  getVersion: () => ipcRenderer.invoke(IpcChannels.appGetVersion) as Promise<string>,
  getPlatform: () => ipcRenderer.invoke(IpcChannels.appGetPlatform) as Promise<string>,
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
  }
}

contextBridge.exposeInMainWorld('localpilot', api)

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type ChatChunkEvent,
  type LocalPilotApi,
  type ProviderUpsertInput
} from '../shared/ipc'
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
  }
}

contextBridge.exposeInMainWorld('localpilot', api)

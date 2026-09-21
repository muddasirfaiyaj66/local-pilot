import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { ChatRequestSchema } from '@shared/schemas'
import { IpcChannels, type ChatChunkEvent, type ProviderUpsertInput } from '@shared/ipc'
import { createProvider } from '../providers/registry'
import type { SettingsStore } from '../settings'

const activeStreams = new Map<string, AbortController>()

export function registerIpcHandlers(store: SettingsStore): void {
  ipcMain.handle(IpcChannels.appGetVersion, () => app.getVersion())

  ipcMain.handle(IpcChannels.appGetPlatform, () => process.platform)

  ipcMain.handle(IpcChannels.settingsGet, () => store.getSettings())

  ipcMain.handle(IpcChannels.settingsSet, (_e, partial: Partial<ReturnType<SettingsStore['getSettings']>>) => {
    return store.setSettings(partial)
  })

  ipcMain.handle(IpcChannels.providerList, () => store.listProviders())

  ipcMain.handle(IpcChannels.providerUpsert, (_e, input: ProviderUpsertInput) => {
    return store.upsertProvider(input.config, input.apiKey)
  })

  ipcMain.handle(IpcChannels.providerDelete, (_e, id: string) => {
    store.deleteProvider(id)
  })

  ipcMain.handle(IpcChannels.providerSetApiKey, (_e, id: string, apiKey: string) => {
    store.setApiKey(id, apiKey)
  })

  ipcMain.handle(IpcChannels.providerTest, async (_e, id: string) => {
    const providerConfig = store.getProvider(id)
    if (!providerConfig) {
      return { ok: false, message: `Provider not found: ${id}` }
    }
    const provider = createProvider(providerConfig, store.getApiKey(id))
    return provider.testConnection()
  })

  ipcMain.handle(IpcChannels.chatAbort, (_e, requestId: string) => {
    const controller = activeStreams.get(requestId)
    if (controller) {
      controller.abort()
      activeStreams.delete(requestId)
    }
  })

  ipcMain.handle(IpcChannels.chatStart, async (event, rawRequest: unknown) => {
    const request = ChatRequestSchema.parse(rawRequest)
    const providerConfig = store.getProvider(request.providerId)
    if (!providerConfig) {
      throw new Error(`Provider not found: ${request.providerId}`)
    }
    if (!providerConfig.enabled) {
      throw new Error(`Provider disabled: ${providerConfig.name}`)
    }

    const requestId = randomUUID()
    const controller = new AbortController()
    activeStreams.set(requestId, controller)

    const win = BrowserWindow.fromWebContents(event.sender)
    const send = (chunkEvent: ChatChunkEvent): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send(IpcChannels.chatChunk, chunkEvent)
    }

    // Fire-and-forget streaming; client listens on chat:chunk
    void (async () => {
      const provider = createProvider(providerConfig, store.getApiKey(request.providerId))
      let finished = false
      try {
        for await (const chunk of provider.chat({
          messages: request.messages,
          tools: request.tools,
          stream: request.stream,
          signal: controller.signal
        })) {
          if (controller.signal.aborted) break
          send({ requestId, chunk })
          if (chunk.type === 'done' || chunk.type === 'error') {
            finished = true
            break
          }
        }
        if (!finished && !controller.signal.aborted) {
          send({ requestId, chunk: { type: 'done', finishReason: 'stop' } })
        } else if (!finished && controller.signal.aborted) {
          send({ requestId, chunk: { type: 'done', finishReason: 'aborted' } })
        }
      } catch (err) {
        if (controller.signal.aborted) {
          send({ requestId, chunk: { type: 'done', finishReason: 'aborted' } })
        } else {
          const message = err instanceof Error ? err.message : String(err)
          send({ requestId, chunk: { type: 'error', message } })
        }
      } finally {
        activeStreams.delete(requestId)
      }
    })()

    return { requestId }
  })
}

export function abortAllStreams(): void {
  for (const [id, controller] of activeStreams) {
    controller.abort()
    activeStreams.delete(id)
  }
}

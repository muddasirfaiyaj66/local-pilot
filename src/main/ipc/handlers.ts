import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ChatRequestSchema } from '@shared/schemas'
import { AgentStartRequestSchema, type PermissionRequest } from '@shared/agent'
import {
  IpcChannels,
  type AgentEventPayload,
  type AskResponse,
  type ChatChunkEvent,
  type PermissionResponse,
  type ProviderUpsertInput
} from '@shared/ipc'
import { runAgentLoop } from '../agent/loop'
import { createProvider } from '../providers/registry'
import type { SettingsStore } from '../settings'

const activeStreams = new Map<string, AbortController>()
const activeAgents = new Map<
  string,
  {
    controller: AbortController
    permissionWaiters: Map<string, (allow: boolean) => void>
    askWaiters: Array<(answer: string) => void>
  }
>()

export function registerIpcHandlers(store: SettingsStore): void {
  ipcMain.handle(IpcChannels.appGetVersion, () => app.getVersion())
  ipcMain.handle(IpcChannels.appGetPlatform, () => process.platform)
  ipcMain.handle(IpcChannels.appCheckUpdates, async () => {
    const { checkForUpdatesNow } = await import('../updater')
    return checkForUpdatesNow()
  })
  ipcMain.handle(
    IpcChannels.fsRestore,
    (_e, filePath: string, content: string): { ok: boolean; error?: string } => {
      try {
        mkdirSync(dirname(filePath), { recursive: true })
        writeFileSync(filePath, content, 'utf8')
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
  ipcMain.handle(
    IpcChannels.shellOpenExternal,
    async (_e, url: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
          return { ok: false, error: `Blocked protocol ${parsed.protocol}` }
        }
        await shell.openExternal(parsed.toString())
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
  ipcMain.removeHandler(IpcChannels.dialogOpenFolder)
  ipcMain.handle(IpcChannels.dialogOpenFolder, async (event): Promise<string | null> => {
    try {
      const win =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ??
        null

      const current = store.getSettings().workspacePath
      const properties: Array<'openDirectory' | 'createDirectory'> = ['openDirectory']
      // createDirectory is macOS-only; including it on Windows can break the picker.
      if (process.platform === 'darwin') properties.push('createDirectory')

      const opts: OpenDialogOptions = {
        title: 'Open Folder',
        buttonLabel: 'Select Folder',
        properties,
        ...(current ? { defaultPath: current } : {})
      }

      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }

      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)
      if (result.canceled || result.filePaths.length === 0) return null
      const folder = result.filePaths[0]!
      store.setSettings({ workspacePath: folder })
      return folder
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Open Folder failed: ${message}`)
    }
  })
  ipcMain.handle(IpcChannels.settingsGet, () => store.getSettings())
  ipcMain.handle(
    IpcChannels.settingsSet,
    (_e, partial: Partial<ReturnType<SettingsStore['getSettings']>>) => store.setSettings(partial)
  )
  ipcMain.handle(IpcChannels.providerList, () => store.listProviders())
  ipcMain.handle(IpcChannels.providerUpsert, (_e, input: ProviderUpsertInput) =>
    store.upsertProvider(input.config, input.apiKey)
  )
  ipcMain.handle(IpcChannels.providerDelete, (_e, id: string) => {
    store.deleteProvider(id)
  })
  ipcMain.handle(IpcChannels.providerSetApiKey, (_e, id: string, apiKey: string) => {
    store.setApiKey(id, apiKey)
  })
  ipcMain.handle(IpcChannels.providerTest, async (_e, id: string) => {
    const providerConfig = store.getProvider(id)
    if (!providerConfig) return { ok: false, message: `Provider not found: ${id}` }
    return createProvider(providerConfig, store.getApiKey(id)).testConnection()
  })

  ipcMain.handle(IpcChannels.chatAbort, (_e, requestId: string) => {
    activeStreams.get(requestId)?.abort()
    activeStreams.delete(requestId)
  })

  ipcMain.handle(IpcChannels.chatStart, async (event, rawRequest: unknown) => {
    const request = ChatRequestSchema.parse(rawRequest)
    const providerConfig = store.getProvider(request.providerId)
    if (!providerConfig) throw new Error(`Provider not found: ${request.providerId}`)
    if (!providerConfig.enabled) throw new Error(`Provider disabled: ${providerConfig.name}`)

    const requestId = randomUUID()
    const controller = new AbortController()
    activeStreams.set(requestId, controller)
    const win = BrowserWindow.fromWebContents(event.sender)
    const send = (chunkEvent: ChatChunkEvent): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send(IpcChannels.chatChunk, chunkEvent)
    }

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
          send({
            requestId,
            chunk: { type: 'error', message: err instanceof Error ? err.message : String(err) }
          })
        }
      } finally {
        activeStreams.delete(requestId)
      }
    })()

    return { requestId }
  })

  ipcMain.handle(IpcChannels.agentPermissionRespond, (_e, response: PermissionResponse) => {
    const session = activeAgents.get(response.requestId)
    const waiter = session?.permissionWaiters.get(response.permissionId)
    if (waiter) {
      waiter(response.allow)
      session?.permissionWaiters.delete(response.permissionId)
    }
  })

  ipcMain.handle(IpcChannels.agentAskRespond, (_e, response: AskResponse) => {
    const session = activeAgents.get(response.requestId)
    const waiter = session?.askWaiters.shift()
    waiter?.(response.answer)
  })

  ipcMain.handle(IpcChannels.agentAbort, (_e, requestId: string) => {
    activeAgents.get(requestId)?.controller.abort()
    activeAgents.delete(requestId)
  })

  ipcMain.handle(IpcChannels.screenPreview, async () => {
    try {
      const { captureScreenPng } = await import('../tools/screen')
      const shot = await captureScreenPng()
      return {
        ok: true,
        dataUrl: `data:image/png;base64,${shot.base64}`,
        width: shot.width,
        height: shot.height
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle(IpcChannels.agentStart, async (event, raw: unknown) => {
    const request = AgentStartRequestSchema.parse(raw)
    const providerConfig = store.getProvider(request.providerId)
    if (!providerConfig) throw new Error(`Provider not found: ${request.providerId}`)

    const settings = store.getSettings()
    const requestId = randomUUID()
    const controller = new AbortController()
    const session = {
      controller,
      permissionWaiters: new Map<string, (allow: boolean) => void>(),
      askWaiters: [] as Array<(answer: string) => void>
    }
    activeAgents.set(requestId, session)

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload: AgentEventPayload): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send(IpcChannels.agentEvent, payload)
    }

    void (async () => {
      const provider = createProvider(providerConfig, store.getApiKey(request.providerId))
      try {
        // Re-read settings so Open Folder / workspace edits apply even if start was queued.
        const latest = store.getSettings()
        await runAgentLoop({
          provider,
          goal: request.goal,
          workspacePath: (latest.workspacePath || settings.workspacePath || '').trim(),
          permissionMode: latest.permissionMode,
          maxSteps: request.maxSteps,
          mode: request.mode,
          signal: controller.signal,
          onEvent: (agentEvent) => emit({ requestId, event: agentEvent }),
          requestPermission: (permission: PermissionRequest) =>
            new Promise<boolean>((resolve) => {
              session.permissionWaiters.set(permission.requestId, resolve)
            }),
          askUser: (question) =>
            new Promise<string>((resolve) => {
              session.askWaiters.push(resolve)
              emit({
                requestId,
                event: {
                  type: 'permission_required',
                  permission: {
                    requestId: `ask_${randomUUID()}`,
                    toolName: 'ask_user',
                    risk: 'safe',
                    preview: question,
                    arguments: { question }
                  }
                }
              })
            })
        })
      } catch (err) {
        emit({
          requestId,
          event: {
            type: 'error',
            message: err instanceof Error ? err.message : String(err)
          }
        })
      } finally {
        activeAgents.delete(requestId)
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
  for (const [id, session] of activeAgents) {
    session.controller.abort()
    activeAgents.delete(id)
  }
}

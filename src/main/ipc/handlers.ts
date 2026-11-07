import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ChatRequestSchema } from '@shared/schemas'
import { contextLimitForModel } from '@shared/context'
import { AgentStartRequestSchema, type PermissionRequest } from '@shared/agent'
import {
  IpcChannels,
  type AgentEventPayload,
  type AskResponse,
  type ChatChunkEvent,
  type PermissionResponse,
  type ProviderUpsertInput
} from '@shared/ipc'
import {
  deleteNote,
  listRecentNotes,
  loadSessions,
  saveSessions,
  type PersistedSessions
} from '../agent/memory'
import { runAgentLoop } from '../agent/loop'
import { createProvider } from '../providers/registry'
import { readRecentAudit } from '../safety/audit'
import type { SettingsStore } from '../settings'
import {
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  listWorkspaceTree,
  listWorkspaceChildren,
  readWorkspaceFileForEdit,
  renameWorkspaceEntry,
  searchWorkspaceFiles,
  searchWorkspaceText,
  writeWorkspaceText
} from '../tools/browse'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModelProvider } from '../providers/base'
import { FallbackProvider, type FallbackEntry, type FallbackNotice } from '../providers/fallback'
import { PluginStore } from '../plugins/store'
import { killAllTerminals, killTerminal, runTerminalCommand, writeTerminalInput } from '../terminal'
import { loadMcpTools, readMcpConfig, writeMcpConfig } from '../tools/mcp'
import { refreshDynamicTools } from '../tools/registry'
import { restoreWorkspaceFile } from '../tools/restore'
import { WorkflowDefinitionSchema } from '@shared/workflow'
import { validateWorkflow } from '../workflow/validate'
import { saveDefinition, listDefinitions, deleteDefinition, listRuns, getRun, listWorkflowEvents, listDefinitionRevisions, getDefinitionRevision } from '../workflow/store'
import { startWorkflow, pauseWorkflow, resumeStoredWorkflow, cancelWorkflow, cancelAllWorkflows, respondWorkflowApproval, pendingWorkflowApprovals, dryRunWorkflow, replayUnknownWorkflowNode, answerWorkflowQuestion } from '../workflow/service'
import { listWorkflowTriggers, saveWorkflowTrigger, deleteWorkflowTrigger, reloadWorkflowTriggers } from '../workflow/automation'

const activeStreams = new Map<string, AbortController>()

interface AgentSession {
  controller: AbortController
  permissionWaiters: Map<string, (allow: boolean) => void>
  askWaiters: Array<(answer: string) => void>
}

const activeAgents = new Map<string, AgentSession>()

function releaseAgentWaiters(session: AgentSession): void {
  session.controller.abort()
  for (const resolve of session.permissionWaiters.values()) resolve(false)
  session.permissionWaiters.clear()
  const askers = session.askWaiters.splice(0)
  for (const resolve of askers) resolve('')
}

function abortAgentSession(requestId: string): void {
  const session = activeAgents.get(requestId)
  if (!session) return
  releaseAgentWaiters(session)
  activeAgents.delete(requestId)
}

export function registerIpcHandlers(store: SettingsStore): void {
  registerIdeHandlers(store)
  const idSchema = z.string().min(1).max(120)
  ipcMain.handle(IpcChannels.workflowList, () => listDefinitions())
  ipcMain.handle(IpcChannels.workflowSave, (_event, raw: unknown) => {
    const definition = WorkflowDefinitionSchema.parse(raw)
    const checked = validateWorkflow(definition)
    if (!checked.valid) throw new Error(checked.errors.join('; '))
    return saveDefinition(definition)
  })
  ipcMain.handle(IpcChannels.workflowDelete, async (_event, raw: unknown) => {
    const id = idSchema.parse(raw)
    for (const trigger of listWorkflowTriggers(id)) await deleteWorkflowTrigger(trigger.id)
    deleteDefinition(id)
  })
  ipcMain.handle(IpcChannels.workflowValidate, (_event, raw: unknown) => {
    const result = validateWorkflow(raw)
    return { ok: result.valid, errors: result.errors }
  })
  ipcMain.handle(IpcChannels.workflowStart, (event, raw: unknown) => {
    const request = z.object({ workflowId: idSchema, input: z.record(z.unknown()).optional() }).strict().parse(raw)
    const serialized = JSON.stringify(request.input ?? {})
    if (!serialized || serialized.length > 100_000) throw new Error('Workflow input exceeds 100 KB')
    const input = JSON.parse(serialized) as Record<string, unknown>
    const run = startWorkflow(request.workflowId, input, store, BrowserWindow.fromWebContents(event.sender))
    return { runId: run.id }
  })
  ipcMain.handle(IpcChannels.workflowRuns, (_event, raw: unknown) => {
    const id = raw === undefined ? undefined : idSchema.parse(raw)
    return listRuns().filter((run) => !id || run.workflowId === id)
  })
  ipcMain.handle(IpcChannels.workflowRun, (_event, raw: unknown) => getRun(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowPause, (_event, raw: unknown) => pauseWorkflow(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowResume, (event, raw: unknown) => resumeStoredWorkflow(idSchema.parse(raw), store, BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle(IpcChannels.workflowCancel, (_event, raw: unknown) => cancelWorkflow(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowApprovals, (_event, raw: unknown) => pendingWorkflowApprovals(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowEvents, (_event, raw: unknown) => listWorkflowEvents(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowTriggerList, (_event, raw: unknown) => listWorkflowTriggers(raw === undefined ? undefined : idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowTriggerSave, (_event, raw: unknown) => saveWorkflowTrigger(raw))
  ipcMain.handle(IpcChannels.workflowTriggerDelete, (_event, raw: unknown) => deleteWorkflowTrigger(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowDryRun, (_event, raw: unknown) => dryRunWorkflow(idSchema.parse(raw)))
  ipcMain.handle(IpcChannels.workflowRevisions, (_event, raw: unknown) => listDefinitionRevisions(idSchema.parse(raw)).map(({ revision, definition }) => ({ revision, definition })))
  ipcMain.handle(IpcChannels.workflowRestoreRevision, (_event, rawId: unknown, rawRevision: unknown) => {
    const id = idSchema.parse(rawId)
    const revision = z.number().int().positive().parse(rawRevision)
    const historic = getDefinitionRevision(id, revision)
    if (!historic) throw new Error('Workflow revision not found')
    const restored = { ...historic.definition, updatedAt: Date.now() }
    return saveDefinition(restored)
  })
  ipcMain.handle(IpcChannels.workflowReplay, (event, rawRun: unknown, rawNode: unknown, rawConfirm: unknown) => {
    z.literal(true).parse(rawConfirm)
    replayUnknownWorkflowNode(idSchema.parse(rawRun), idSchema.parse(rawNode), store, BrowserWindow.fromWebContents(event.sender))
  })
  ipcMain.handle(IpcChannels.workflowApprove, (_event, rawRunId: unknown, rawNodeId: unknown, rawAllowed: unknown) => {
    respondWorkflowApproval(idSchema.parse(rawRunId), idSchema.parse(rawNodeId), z.boolean().parse(rawAllowed))
  })
  ipcMain.handle(IpcChannels.workflowAnswer, (_event, rawRunId: unknown, rawNodeId: unknown, rawAnswer: unknown) => {
    answerWorkflowQuestion(idSchema.parse(rawRunId), idSchema.parse(rawNodeId), z.string().max(4000).parse(rawAnswer))
  })
  ipcMain.handle(IpcChannels.appGetVersion, () => app.getVersion())
  ipcMain.handle(IpcChannels.appGetPlatform, () => process.platform)
  ipcMain.handle(IpcChannels.appCheckUpdates, async () => {
    const { checkForUpdatesNow } = await import('../updater')
    return checkForUpdatesNow()
  })
  ipcMain.handle(
    IpcChannels.fsRestore,
    (_e, filePath: string, content: string, created?: boolean): { ok: boolean; error?: string } => {
      try {
        const workspace = store.getSettings().workspacePath
        restoreWorkspaceFile(workspace, filePath, content, created === true)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
  ipcMain.handle(IpcChannels.sessionsLoad, (): PersistedSessions | null => {
    try {
      return loadSessions()
    } catch {
      return null
    }
  })
  ipcMain.handle(IpcChannels.sessionsSave, (_e, raw: unknown): { ok: boolean } => {
    const state = raw as PersistedSessions
    if (!state || !Array.isArray(state.tasks) || !state.sessions || typeof state.sessions !== 'object') {
      return { ok: false }
    }
    saveSessions({
      tasks: state.tasks,
      activeTaskId: state.activeTaskId ?? null,
      sessions: state.sessions
    })
    return { ok: true }
  })
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
  ipcMain.handle(IpcChannels.procList, async () => {
    const { listProcesses } = await import('../tools/process')
    return listProcesses()
  })
  ipcMain.handle(IpcChannels.procStop, async (_e, id: string) => {
    const { stopProcess } = await import('../tools/process')
    return { ok: stopProcess(id) }
  })
  ipcMain.handle(IpcChannels.workspaceTree, () => {
    const workspace = store.getSettings().workspacePath
    if (!workspace.trim()) return []
    try {
      return listWorkspaceTree(workspace)
    } catch {
      return []
    }
  })
  ipcMain.handle(IpcChannels.workspaceSearchFiles, (_e, query: string) => {
    const workspace = store.getSettings().workspacePath
    if (!workspace.trim()) return []
    try {
      return searchWorkspaceFiles(workspace, String(query ?? ''))
    } catch {
      return []
    }
  })
  ipcMain.handle(IpcChannels.workspaceChildren, (_e, path: string) => {
    const workspace = store.getSettings().workspacePath
    if (!workspace.trim()) return []
    try {
      return listWorkspaceChildren(workspace, String(path ?? ''))
    } catch {
      return []
    }
  })
  ipcMain.handle(IpcChannels.workspaceReadFile, (_e, filePath: string, maxChars?: number) => {
    try {
      const workspace = store.getSettings().workspacePath
      const limit = typeof maxChars === 'number' && maxChars > 0 ? Math.min(maxChars, 2_000_000) : 8_000
      const file = readWorkspaceFileForEdit(workspace, filePath, limit)
      return { ok: true, ...file }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(IpcChannels.workspaceWriteFile, (_e, filePath: string, content: string) => {
    try {
      const workspace = store.getSettings().workspacePath
      if (!workspace.trim()) return { ok: false, error: 'No workspace open' }
      writeWorkspaceText(workspace, filePath, String(content ?? ''))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(IpcChannels.providerModels, async (_e, providerId: string) => {
    const providerConfig = store.getProvider(providerId)
    if (!providerConfig) return []
    try {
      const provider = createProvider(providerConfig, store.getApiKey(providerId))
      return await provider.listModels()
    } catch {
      return []
    }
  })
  ipcMain.handle(IpcChannels.mcpGet, () => readMcpConfig())
  ipcMain.handle(IpcChannels.mcpSave, async (_e, raw: unknown) => {
    try {
      writeMcpConfig(raw)
      const tools = await loadMcpTools()
      refreshDynamicTools(tools)
      return { ok: true, tools: tools.length }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(IpcChannels.memoryList, () => listRecentNotes(40))
  ipcMain.handle(IpcChannels.memoryDelete, (_e, id: number) => {
    return { ok: deleteNote(Number(id)) }
  })
  ipcMain.handle(IpcChannels.auditRecent, () =>
    readRecentAudit(40).map((entry) => ({
      timestamp: entry.timestamp,
      toolName: entry.toolName,
      risk: entry.risk,
      preview: entry.preview.slice(0, 180),
      ok: entry.ok,
      detail: entry.detail
    }))
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
    (_e, partial: Partial<ReturnType<SettingsStore['getSettings']>>) => {
      const updated = store.setSettings(partial)
      if (partial.workspacePath !== undefined) void reloadWorkflowTriggers()
      return updated
    }
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
      const provider = buildProviderChain(store, request.providerId, (notice) =>
        send({
          requestId,
          chunk: {
            type: 'notice',
            message: `${notice.from} failed (${notice.reason.slice(0, 160)}) — switched to ${notice.to}`
          }
        })
      )
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
    abortAgentSession(requestId)
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
    const session: AgentSession = {
      controller,
      permissionWaiters: new Map<string, (allow: boolean) => void>(),
      askWaiters: []
    }
    activeAgents.set(requestId, session)

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload: AgentEventPayload): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send(IpcChannels.agentEvent, payload)
    }

    void (async () => {
      const provider = buildProviderChain(store, request.providerId, (notice) =>
        emit({
          requestId,
          event: {
            type: 'notice',
            level: 'warn',
            message: `${notice.from} failed (${notice.reason.slice(0, 160)}) — switched to ${notice.to}`
          }
        })
      )
      try {
        // Re-read settings so Open Folder / workspace edits apply even if start was queued.
        const latest = store.getSettings()
        await runAgentLoop({
          provider,
          goal: request.goal,
          priorMessages: request.messages,
          contextLimit: contextLimitForModel(providerConfig.model),
          workspacePath: (latest.workspacePath || settings.workspacePath || '').trim(),
          permissionMode: latest.permissionMode,
          maxSteps: request.maxSteps ?? latest.maxAgentSteps,
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

/**
 * The active provider, wrapped with the configured fallback chain. Fallbacks
 * that are disabled, missing, or the same as the primary are skipped.
 */
function buildProviderChain(
  store: SettingsStore,
  primaryId: string,
  onFallback: (notice: FallbackNotice) => void
): ModelProvider {
  const primary = store.getProvider(primaryId)
  if (!primary) throw new Error(`Provider not found: ${primaryId}`)
  const entries: FallbackEntry[] = [
    {
      label: `${primary.name} · ${primary.model}`,
      provider: createProvider(primary, store.getApiKey(primary.id))
    }
  ]
  for (const id of store.getSettings().fallbackProviderIds) {
    if (id === primaryId) continue
    const config = store.getProvider(id)
    if (!config?.enabled) continue
    entries.push({
      label: `${config.name} · ${config.model}`,
      provider: createProvider(config, store.getApiKey(config.id))
    })
  }
  return entries.length === 1 ? entries[0]!.provider : new FallbackProvider(entries, onFallback)
}

function registerIdeHandlers(store: SettingsStore): void {
  const workspaceOrThrow = (): string => {
    const workspace = store.getSettings().workspacePath.trim()
    if (!workspace) throw new Error('No workspace open')
    return workspace
  }
  const wrap = async (fn: () => void | Promise<void>): Promise<{ ok: boolean; error?: string }> => {
    try {
      await fn()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  const pathSchema = z.string().min(1).max(1024)

  ipcMain.handle(IpcChannels.workspaceSearchText, (_e, query: unknown, options: unknown) => {
    const workspace = store.getSettings().workspacePath.trim()
    if (!workspace) return []
    const opts = z
      .object({
        caseSensitive: z.boolean().optional(),
        regex: z.boolean().optional(),
        wholeWord: z.boolean().optional(),
        maxResults: z.number().int().positive().max(2000).optional()
      })
      .catch({})
      .parse(options ?? {})
    try {
      return searchWorkspaceText(workspace, String(query ?? '').slice(0, 500), opts)
    } catch {
      return [] // invalid regex, unreadable root
    }
  })
  ipcMain.handle(IpcChannels.workspaceCreate, (_e, path: unknown, dir: unknown) =>
    wrap(() => createWorkspaceEntry(workspaceOrThrow(), pathSchema.parse(path), dir === true))
  )
  ipcMain.handle(IpcChannels.workspaceRename, (_e, from: unknown, to: unknown) =>
    wrap(() => renameWorkspaceEntry(workspaceOrThrow(), pathSchema.parse(from), pathSchema.parse(to)))
  )
  ipcMain.handle(IpcChannels.workspaceDelete, (_e, path: unknown) =>
    wrap(() => deleteWorkspaceEntry(workspaceOrThrow(), pathSchema.parse(path)))
  )

  ipcMain.handle(IpcChannels.terminalRun, (event, command: unknown) => {
    try {
      const line = z.string().min(1).max(8000).parse(command)
      const workspace = store.getSettings().workspacePath.trim() || app.getPath('home')
      const send = (channel: string, payload: unknown): void => {
        if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
      }
      const id = runTerminalCommand(line, workspace, {
        data: (termId, stream, text) => send(IpcChannels.terminalData, { id: termId, stream, text }),
        exit: (termId, code) => send(IpcChannels.terminalExit, { id: termId, code })
      })
      return { ok: true, id }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(IpcChannels.terminalInput, (_e, id: unknown, text: unknown) => ({
    ok: writeTerminalInput(String(id), String(text ?? ''))
  }))
  ipcMain.handle(IpcChannels.terminalKill, (_e, id: unknown) => ({ ok: killTerminal(String(id)) }))

  const pluginDir = join(app.getPath('userData'), 'plugins')
  const plugins = new PluginStore(pluginDir, {
    read: () => readMcpConfig(),
    write: async (config) => {
      writeMcpConfig(config)
      refreshDynamicTools(await loadMcpTools())
    },
    workspace: () => store.getSettings().workspacePath.trim()
  })
  ipcMain.handle(IpcChannels.pluginList, () => plugins.list())
  ipcMain.handle(IpcChannels.pluginInstall, (_e, manifest: unknown) =>
    wrap(async () => {
      await plugins.install(manifest)
    })
  )
  ipcMain.handle(IpcChannels.pluginUninstall, (_e, id: unknown) =>
    wrap(() => plugins.uninstall(String(id)))
  )
  ipcMain.handle(IpcChannels.pluginSetEnabled, (_e, id: unknown, enabled: unknown) =>
    wrap(() => plugins.setEnabled(String(id), enabled === true))
  )
  ipcMain.handle(IpcChannels.pluginImport, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: OpenDialogOptions = {
      title: 'Install plugin from file',
      buttonLabel: 'Install',
      properties: ['openFile'],
      filters: [{ name: 'LocalPilot plugin', extensions: ['json'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
    return wrap(async () => {
      const raw = JSON.parse(readFileSync(result.filePaths[0]!, 'utf8')) as unknown
      await plugins.install(raw)
    })
  })
  ipcMain.handle(IpcChannels.pluginOpenFolder, async () => {
    const error = await shell.openPath(pluginDir)
    return { ok: error === '' }
  })
}

export function abortAllStreams(): void {
  killAllTerminals()
  cancelAllWorkflows()
  for (const [id, controller] of activeStreams) {
    controller.abort()
    activeStreams.delete(id)
  }
  for (const id of [...activeAgents.keys()]) {
    abortAgentSession(id)
  }
}

import Editor, { type OnMount } from '@monaco-editor/react'
import {
  CaretRight,
  ChatCircleText,
  Circle,
  Files,
  GearSix,
  MagnifyingGlass,
  Play,
  PuzzlePiece,
  Sparkle,
  TerminalWindow,
  X
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderPluginPrompt } from '@shared/plugins'
import { useAppStore } from '../store/appStore'
import { usePersistentState } from '../hooks/usePersistentState'
import { useResizable } from '../hooks/useResizable'
import { Kbd } from '../components/ui/Kbd'
import { BUILTIN_THEMES, monaco, registerPluginContributions } from './monaco'
import { enabledCommands, enabledManifests, usePluginsStore } from './pluginsStore'
import { isDirty, useIdeStore, type SideView } from './ideStore'
import { Explorer } from './Explorer'
import { SearchView } from './SearchView'
import { ExtensionsView } from './ExtensionsView'
import { TerminalPanel, runInTerminal } from './TerminalPanel'
import { QuickOpen } from './QuickOpen'
import { InlineAi, type InlineTarget } from './InlineAi'
import { FileIcon } from './FileIcon'
import { ContextMenu, type MenuItem } from './ContextMenu'
import logoMark from '../assets/logo-mark.svg'

interface EditorPrefs {
  theme: string
  fontSize: number
  minimap: boolean
  wordWrap: boolean
  formatOnSave: boolean
  tabSize: number
}

const DEFAULT_PREFS: EditorPrefs = {
  theme: 'localpilot-dark',
  fontSize: 13,
  minimap: true,
  wordWrap: false,
  formatOnSave: false,
  tabSize: 2
}

const RUNNERS: Record<string, (path: string) => string> = {
  python: (p) => `python "${p}"`,
  javascript: (p) => `node "${p}"`,
  typescript: (p) => `npx --yes tsx "${p}"`,
  go: (p) => `go run "${p}"`,
  shell: (p) => `bash "${p}"`,
  powershell: (p) => `powershell -NoProfile -ExecutionPolicy Bypass -File "${p}"`,
  ruby: (p) => `ruby "${p}"`,
  php: (p) => `php "${p}"`,
  bat: (p) => `"${p}"`
}

type IStandaloneEditor = Parameters<OnMount>[0]

export function IdePage(): React.JSX.Element {
  const workspace = useAppStore((s) => s.settings?.workspacePath?.trim() ?? '')
  const editorOpenRequest = useAppStore((s) => s.editorOpenRequest)
  const clearEditorOpenRequest = useAppStore((s) => s.clearEditorOpenRequest)
  const queueComposerInsert = useAppStore((s) => s.queueComposerInsert)
  const setView = useAppStore((s) => s.setView)
  const isAgentRunning = useAppStore((s) => s.isStreaming)
  const activeModel = useAppStore((s) => s.providers.find((p) => p.id === s.settings?.activeProviderId)?.model)

  const {
    tabs,
    activePath,
    sideView,
    cursor,
    reveal,
    message,
    syncWorkspace,
    setSideView,
    setCursor,
    openFile,
    activate,
    closeTab,
    closeOthers,
    closeAll,
    setValue,
    save,
    saveAll,
    refreshClean
  } = useIdeStore()

  const plugins = usePluginsStore((s) => s.plugins)
  const pluginsLoaded = usePluginsStore((s) => s.loaded)
  const refreshPlugins = usePluginsStore((s) => s.refresh)

  const [prefs, setPrefs] = usePersistentState<EditorPrefs>('lp.ide.prefs', DEFAULT_PREFS)
  const [sideOpen, setSideOpen] = usePersistentState('lp.ide.sideOpen', true)
  const [panelOpen, setPanelOpen] = usePersistentState('lp.ide.panelOpen', false)
  const [panelHeight, setPanelHeight] = usePersistentState('lp.ide.panelHeight', 220)
  const [quickOpen, setQuickOpen] = useState(false)
  const [searchFocus, setSearchFocus] = useState(0)
  const [inline, setInline] = useState<InlineTarget | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [recent, setRecent] = usePersistentState<string[]>('lp.ide.recent', [])
  const side = useResizable({ key: 'lp.ide.sideWidth', initial: 260, min: 180, max: 520 })
  const editorRef = useRef<IStandaloneEditor | null>(null)
  const [editorReady, setEditorReady] = useState(0)

  const activeTab = tabs.find((t) => t.path === activePath) ?? null
  const merged = { ...DEFAULT_PREFS, ...prefs }
  const commands = useMemo(() => enabledCommands(plugins), [plugins])
  const pluginThemes = useMemo(
    () => enabledManifests(plugins).flatMap((m) => m.contributes.themes.map((t) => ({ id: t.id, label: t.label }))),
    [plugins]
  )
  const allThemes = [...BUILTIN_THEMES, ...pluginThemes]
  const theme = allThemes.some((t) => t.id === merged.theme) ? merged.theme : 'localpilot-dark'

  useEffect(() => syncWorkspace(workspace), [workspace, syncWorkspace])
  useEffect(() => {
    if (!pluginsLoaded) void refreshPlugins()
  }, [pluginsLoaded, refreshPlugins])

  // Plugin themes + snippets → Monaco.
  useEffect(() => registerPluginContributions(enabledManifests(plugins)), [plugins])

  // Another pane asked to open a file here.
  useEffect(() => {
    if (!editorOpenRequest) return
    void openFile(editorOpenRequest.path, editorOpenRequest.line)
    clearEditorOpenRequest()
  }, [editorOpenRequest, openFile, clearEditorOpenRequest])

  // Pick up agent edits: refresh clean tabs on focus and when a run finishes.
  useEffect(() => {
    const onFocus = (): void => void refreshClean()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshClean])
  useEffect(() => {
    if (!isAgentRunning) void refreshClean()
  }, [isAgentRunning, refreshClean])

  useEffect(() => {
    if (!activePath) return
    setRecent((prev) => [activePath, ...prev.filter((p) => p !== activePath)].slice(0, 12))
  }, [activePath, setRecent])

  // Reveal a requested line once the right model is showing.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !reveal || reveal.path !== activePath) return
    const id = window.setTimeout(() => {
      editor.revealLineInCenter(reveal.line)
      editor.setPosition({ lineNumber: reveal.line, column: 1 })
      editor.focus()
    }, 30)
    return () => window.clearTimeout(id)
  }, [reveal, activePath, editorReady])

  const showSide = (view: SideView): void => {
    if (sideOpen && sideView === view) {
      setSideOpen(false)
      return
    }
    setSideView(view)
    setSideOpen(true)
    if (view === 'search') setSearchFocus((n) => n + 1)
  }

  const saveActive = useCallback(async (): Promise<void> => {
    const editor = editorRef.current
    const tab = useIdeStore.getState().tabs.find((t) => t.path === useIdeStore.getState().activePath)
    if (!tab || tab.readOnly) return
    if (merged.formatOnSave && editor) {
      await editor.getAction('editor.action.formatDocument')?.run()
    }
    const value = editor?.getModel()?.getValue() ?? tab.value
    await save(tab.path, value)
  }, [merged.formatOnSave, save])

  const selectionContext = useCallback(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    const tab = useIdeStore.getState().tabs.find((t) => t.path === useIdeStore.getState().activePath)
    if (!editor || !model || !tab) return null
    const selection = editor.getSelection()
    const hasSelection = selection && !selection.isEmpty()
    const text = hasSelection ? model.getValueInRange(selection) : model.getValue()
    return { editor, model, tab, selection: hasSelection ? selection : null, text }
  }, [])

  const openInlineEdit = useCallback(
    (instruction?: string): void => {
      const ctx = selectionContext()
      if (!ctx || ctx.tab.readOnly) return
      const full = ctx.model.getValue()
      let start = 0
      let end = full.length
      if (ctx.selection) {
        // Expand to whole lines so the model sees complete statements.
        const range = new monaco.Range(
          ctx.selection.startLineNumber,
          1,
          ctx.selection.endLineNumber,
          ctx.model.getLineMaxColumn(ctx.selection.endLineNumber)
        )
        start = ctx.model.getOffsetAt(range.getStartPosition())
        end = ctx.model.getOffsetAt(range.getEndPosition())
      } else if (full.length > 24_000) {
        useIdeStore.getState().setMessage('Select the code to edit — the file is too large to rewrite whole.', 'info')
        return
      }
      setInline({
        path: ctx.tab.path,
        language: ctx.tab.language,
        fullText: full,
        start,
        end,
        instruction,
        autoRun: Boolean(instruction)
      })
    },
    [selectionContext]
  )

  const sendToChat = useCallback(
    (template?: string): void => {
      const ctx = selectionContext()
      if (!ctx) return
      const snippet = ctx.text.length > 12_000 ? `${ctx.text.slice(0, 12_000)}\n…` : ctx.text
      const prompt = template
        ? renderPluginPrompt(template, { selection: snippet, file: ctx.tab.path, language: ctx.tab.language })
        : ctx.selection
          ? `In \`${ctx.tab.path}\` (lines ${ctx.selection.startLineNumber}-${ctx.selection.endLineNumber}):\n\n\`\`\`${ctx.tab.language}\n${snippet}\n\`\`\`\n\n`
          : `@${ctx.tab.path} `
      queueComposerInsert(prompt)
      setView('chat')
    },
    [selectionContext, queueComposerInsert, setView]
  )

  const runActiveFile = useCallback((): void => {
    const tab = useIdeStore.getState().tabs.find((t) => t.path === useIdeStore.getState().activePath)
    if (!tab) return
    const runner = RUNNERS[tab.language]
    if (!runner) {
      useIdeStore.getState().setMessage(`No runner for ${tab.language} files`, 'info')
      return
    }
    setPanelOpen(true)
    void (async () => {
      if (isDirty(tab)) await saveActive()
      await runInTerminal(runner(tab.path))
    })()
  }, [saveActive, setPanelOpen])

  // Keep latest callbacks for Monaco actions registered once per mount.
  const actionsRef = useRef({ saveActive, openInlineEdit, sendToChat, runActiveFile })
  actionsRef.current = { saveActive, openInlineEdit, sendToChat, runActiveFile }

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
    setEditorReady((n) => n + 1)
    editor.addAction({
      id: 'lp.save',
      label: 'File: Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => void actionsRef.current.saveActive()
    })
    editor.addAction({
      id: 'lp.ai-edit',
      label: 'LocalPilot: Edit with AI',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
      contextMenuGroupId: '0_localpilot',
      contextMenuOrder: 1,
      run: () => actionsRef.current.openInlineEdit()
    })
    editor.addAction({
      id: 'lp.ask-chat',
      label: 'LocalPilot: Ask about selection in chat',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
      contextMenuGroupId: '0_localpilot',
      contextMenuOrder: 2,
      run: () => actionsRef.current.sendToChat()
    })
    editor.addAction({
      id: 'lp.run-file',
      label: 'Run: Current File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F5],
      contextMenuGroupId: '1_run',
      run: () => actionsRef.current.runActiveFile()
    })
    editor.onDidChangeCursorSelection((event) => {
      const model = editor.getModel()
      const sel = event.selection
      setCursor({
        line: sel.positionLineNumber,
        column: sel.positionColumn,
        selected: model && !sel.isEmpty() ? model.getValueLengthInRange(sel) : 0
      })
    })
  }

  // Plugin commands → editor context menu (re-registered when plugins change).
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const disposables = commands.map((command, index) =>
      editor.addAction({
        id: `lp.plugin.${command.key}`,
        label: `${command.pluginName}: ${command.title}`,
        contextMenuGroupId: '2_plugins',
        contextMenuOrder: index,
        run: () => {
          if (command.target === 'inline') actionsRef.current.openInlineEdit(command.prompt)
          else actionsRef.current.sendToChat(command.prompt)
        }
      })
    )
    return () => {
      for (const d of disposables) d.dispose()
    }
  }, [commands, editorReady])

  // Window-level shortcuts (when focus is outside Monaco, or Monaco lets them through).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'p' && !event.shiftKey) {
        event.preventDefault()
        setQuickOpen(true)
      } else if (key === 's') {
        event.preventDefault()
        if (event.shiftKey || event.altKey) void saveAll()
        else void saveActive()
      } else if (key === 'b' && !event.shiftKey) {
        event.preventDefault()
        setSideOpen((v) => !v)
      } else if (event.key === '`' || event.code === 'Backquote' || key === 'j') {
        event.preventDefault()
        setPanelOpen((v) => !v)
      } else if (key === 'w' && !event.shiftKey) {
        const path = useIdeStore.getState().activePath
        if (path) {
          event.preventDefault()
          requestClose(path)
        }
      } else if (event.shiftKey && key === 'f') {
        event.preventDefault()
        showSide('search')
      } else if (event.shiftKey && key === 'e') {
        event.preventDefault()
        showSide('explorer')
      } else if (event.shiftKey && key === 'x') {
        event.preventDefault()
        showSide('extensions')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveActive, saveAll, sideOpen, sideView])

  const requestClose = (path: string): void => {
    const tab = useIdeStore.getState().tabs.find((t) => t.path === path)
    if (tab && isDirty(tab) && !window.confirm(`${tab.name} has unsaved changes. Close without saving?`)) return
    closeTab(path)
  }

  const onPanelDrag = (event: React.PointerEvent): void => {
    event.preventDefault()
    const startY = event.clientY
    const start = panelHeight
    const onMove = (e: PointerEvent): void =>
      setPanelHeight(Math.min(Math.max(start + (startY - e.clientY), 100), window.innerHeight - 200))
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const tabMenuItems = (path: string): MenuItem[] => [
    { label: 'Close', keys: 'Ctrl+W', run: () => requestClose(path) },
    { label: 'Close Others', run: () => closeOthers(path) },
    { label: 'Close All', run: () => closeAll() },
    'divider',
    { label: 'Copy Relative Path', run: () => void navigator.clipboard.writeText(path) },
    {
      label: 'Mention in Chat',
      run: () => {
        queueComposerInsert(`@${path} `)
        setView('chat')
      }
    }
  ]

  const dirtyCount = tabs.filter(isDirty).length
  const crumbs = activeTab ? activeTab.path.split('/') : []

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <nav className="lp-activitybar" aria-label="Code views">
          <ActivityButton label="Explorer (Ctrl+Shift+E)" active={sideOpen && sideView === 'explorer'} onClick={() => showSide('explorer')}>
            <Files size={20} />
          </ActivityButton>
          <ActivityButton label="Search (Ctrl+Shift+F)" active={sideOpen && sideView === 'search'} onClick={() => showSide('search')}>
            <MagnifyingGlass size={20} />
          </ActivityButton>
          <ActivityButton label="Extensions (Ctrl+Shift+X)" active={sideOpen && sideView === 'extensions'} onClick={() => showSide('extensions')}>
            <PuzzlePiece size={20} />
            {plugins.length > 0 ? <span className="lp-activity-badge">{plugins.filter((p) => p.enabled).length}</span> : null}
          </ActivityButton>
          <div className="flex-1" />
          <ActivityButton label="Terminal (Ctrl+`)" active={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
            <TerminalWindow size={20} />
          </ActivityButton>
          <ActivityButton label="Editor settings" active={prefsOpen} onClick={() => setPrefsOpen((v) => !v)}>
            <GearSix size={20} />
          </ActivityButton>
        </nav>

        {/* Side bar */}
        {sideOpen ? (
          <aside className="lp-sidebar relative flex shrink-0 flex-col" style={{ width: side.width }}>
            {sideView === 'explorer' ? <Explorer /> : sideView === 'search' ? <SearchView focusNonce={searchFocus} /> : <ExtensionsView />}
            <div
              role="separator"
              aria-orientation="vertical"
              className={`lp-resize-handle ${side.dragging ? 'is-dragging' : ''}`}
              style={{ right: '-3px' }}
              onPointerDown={side.onHandlePointerDown}
            />
          </aside>
        ) : null}

        {/* Editor group + panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="lp-editor-tabs" role="tablist" aria-label="Open editors">
            {tabs.map((tab) => {
              const active = tab.path === activePath
              const dirty = isDirty(tab)
              return (
                <div
                  key={tab.path}
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  className={`lp-editor-tab ${active ? 'is-active' : ''}`}
                  title={tab.path}
                  onClick={() => activate(tab.path)}
                  onAuxClick={(e) => {
                    if (e.button === 1) requestClose(tab.path)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setTabMenu({ x: e.clientX, y: e.clientY, path: tab.path })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') activate(tab.path)
                  }}
                >
                  <FileIcon name={tab.name} size={13} />
                  <span className={`truncate ${tab.readOnly ? 'italic' : ''}`}>{tab.name}</span>
                  <button
                    type="button"
                    className="lp-editor-tab-close"
                    aria-label={`Close ${tab.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      requestClose(tab.path)
                    }}
                  >
                    {dirty ? <Circle size={8} weight="fill" className="lp-dirty-dot" /> : null}
                    <X size={12} className="lp-close-x" />
                  </button>
                </div>
              )
            })}
            <div className="flex-1" />
            {activeTab ? (
              <div className="flex items-center gap-0.5 px-2">
                {RUNNERS[activeTab.language] ? (
                  <button type="button" className="lp-mini-btn" title="Run file (Ctrl+F5)" aria-label="Run file" onClick={runActiveFile}>
                    <Play size={14} weight="fill" className="text-[var(--color-ok)]" />
                  </button>
                ) : null}
                <button type="button" className="lp-mini-btn" title="Edit with AI (Ctrl+I)" aria-label="Edit with AI" disabled={activeTab.readOnly} onClick={() => openInlineEdit()}>
                  <Sparkle size={14} weight="fill" className="text-[var(--color-accent)]" />
                </button>
                <button type="button" className="lp-mini-btn" title="Ask in chat (Ctrl+Shift+L)" aria-label="Ask in chat" onClick={() => sendToChat()}>
                  <ChatCircleText size={14} />
                </button>
              </div>
            ) : null}
          </div>

          {activeTab ? (
            <div className="lp-breadcrumbs">
              {crumbs.map((part, i) => (
                <span key={`${part}-${i}`} className="flex items-center gap-1">
                  {i > 0 ? <CaretRight size={9} className="text-[var(--color-text-faint)]" aria-hidden /> : null}
                  {i === crumbs.length - 1 ? <FileIcon name={part} size={12} /> : null}
                  <span className={i === crumbs.length - 1 ? 'text-[var(--color-text)]' : ''}>{part}</span>
                </span>
              ))}
              {activeTab.note ? <span className="ml-3 text-[var(--color-warn)]">{activeTab.note}</span> : null}
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            {activeTab ? (
              <>
                <Editor
                  path={activeTab.path}
                  language={activeTab.language}
                  value={activeTab.value}
                  theme={theme}
                  keepCurrentModel
                  saveViewState
                  onMount={onMount}
                  onChange={(value) => setValue(activeTab.path, value ?? '')}
                  loading={<div className="p-4 text-[12px] text-[var(--color-text-faint)]">Loading editor…</div>}
                  options={{
                    readOnly: activeTab.readOnly,
                    fontSize: merged.fontSize,
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    fontLigatures: true,
                    minimap: { enabled: merged.minimap, renderCharacters: false, scale: 1 },
                    wordWrap: merged.wordWrap ? 'on' : 'off',
                    tabSize: merged.tabSize,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    renderLineHighlight: 'all',
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: 'active', indentation: true },
                    stickyScroll: { enabled: true },
                    linkedEditing: true,
                    padding: { top: 8 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    'semanticHighlighting.enabled': true
                  }}
                />
                {inline && inline.path === activeTab.path ? (
                  <InlineAi
                    target={inline}
                    theme={theme}
                    onClose={() => {
                      setInline(null)
                      editorRef.current?.focus()
                    }}
                    onAccept={(replacement) => {
                      const editor = editorRef.current
                      const model = editor?.getModel()
                      if (editor && model) {
                        if (model.getValue() !== inline.fullText) {
                          useIdeStore.getState().setMessage('The file changed while generating — edit discarded.', 'error')
                        } else {
                          const range = monaco.Range.fromPositions(model.getPositionAt(inline.start), model.getPositionAt(inline.end))
                          editor.pushUndoStop()
                          editor.executeEdits('localpilot-ai', [{ range, text: replacement, forceMoveMarkers: true }])
                          editor.pushUndoStop()
                          useIdeStore.getState().setMessage('AI edit applied — Ctrl+Z to undo', 'ok')
                        }
                      }
                      setInline(null)
                      editor?.focus()
                    }}
                  />
                ) : null}
              </>
            ) : (
              <Welcome onQuickOpen={() => setQuickOpen(true)} hasWorkspace={Boolean(workspace)} />
            )}
            {prefsOpen ? (
              <EditorPrefsPopover
                prefs={merged}
                themes={allThemes}
                onChange={(next) => setPrefs({ ...merged, ...next })}
                onClose={() => setPrefsOpen(false)}
              />
            ) : null}
          </div>

          {panelOpen ? (
            <div className="relative shrink-0 border-t border-[var(--color-border)]" style={{ height: panelHeight }}>
              <div role="separator" aria-orientation="horizontal" className="lp-resize-handle-h" onPointerDown={onPanelDrag} />
              <TerminalPanel onClose={() => setPanelOpen(false)} cwdLabel={workspace || '~'} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Status bar */}
      <div className="lp-ide-status" role="status">
        <span className="flex items-center gap-1">
          <Sparkle size={11} weight="fill" aria-hidden />
          {activeModel ?? 'no model'}
        </span>
        {dirtyCount > 0 ? <span>{dirtyCount} unsaved</span> : null}
        {message ? (
          <span className={message.tone === 'error' ? 'text-[#ffd0cf]' : ''} aria-live="polite">
            {message.text}
          </span>
        ) : null}
        <div className="flex-1" />
        {activeTab ? (
          <>
            <span>
              Ln {cursor.line}, Col {cursor.column}
              {cursor.selected > 0 ? ` (${cursor.selected} selected)` : ''}
            </span>
            <button type="button" onClick={() => setPrefsOpen(true)}>
              Spaces: {merged.tabSize}
            </button>
            <span>UTF-8</span>
            <span className="capitalize">{activeTab.language}</span>
            {activeTab.readOnly ? <span>Read-only</span> : null}
          </>
        ) : null}
      </div>

      <QuickOpen open={quickOpen} onClose={() => setQuickOpen(false)} onPick={(p) => void openFile(p)} recent={recent} />
      {tabMenu ? <ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems(tabMenu.path)} onClose={() => setTabMenu(null)} /> : null}
    </div>
  )
}

function ActivityButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button type="button" className={`lp-activity-btn ${active ? 'is-active' : ''}`} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

function Welcome({ onQuickOpen, hasWorkspace }: { onQuickOpen: () => void; hasWorkspace: boolean }): React.JSX.Element {
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const rows: Array<[string, string]> = [
    ['Go to file', 'Ctrl+P'],
    ['Edit selection with AI', 'Ctrl+I'],
    ['Ask about selection in chat', 'Ctrl+Shift+L'],
    ['Find in files', 'Ctrl+Shift+F'],
    ['Toggle terminal', 'Ctrl+`'],
    ['Run current file', 'Ctrl+F5'],
    ['Save / Save all', 'Ctrl+S / Ctrl+Alt+S'],
    ['Command palette', 'Ctrl+K']
  ]
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img src={logoMark} alt="" width={36} height={36} className="rounded-[8px] opacity-90" />
          <div>
            <h1 className="text-[18px] font-medium tracking-tight">LocalPilot Code</h1>
            <p className="text-[12px] text-[var(--color-text-muted)]">Edit, run, and rewrite with AI — in your own folder.</p>
          </div>
        </div>
        {!hasWorkspace ? (
          <button type="button" className="lp-btn lp-btn-accent mb-6" onClick={() => void openWorkspace()}>
            Open Folder…
          </button>
        ) : (
          <button type="button" className="lp-btn lp-btn-ghost mb-6" onClick={onQuickOpen}>
            <MagnifyingGlass size={13} aria-hidden /> Go to file…
          </button>
        )}
        <ul className="space-y-1.5">
          {rows.map(([label, keys]) => (
            <li key={label} className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)]">
              <span>{label}</span>
              <span className="flex gap-1">
                {keys.split(' / ').map((k) => (
                  <Kbd key={k} keys={k.replace(/^Ctrl\+/, 'Mod+')} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function EditorPrefsPopover({
  prefs,
  themes,
  onChange,
  onClose
}: {
  prefs: EditorPrefs
  themes: Array<{ id: string; label: string }>
  onChange: (next: Partial<EditorPrefs>) => void
  onClose: () => void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="lp-popover absolute bottom-3 left-3 z-30 w-72" role="dialog" aria-label="Editor settings">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">Editor</span>
        <button type="button" className="lp-mini-btn" aria-label="Close" onClick={onClose}>
          <X size={12} />
        </button>
      </div>
      <label className="mb-2 block text-[12px] text-[var(--color-text-muted)]">
        Color theme
        <select className="lp-input mt-1 !py-1 text-[12px]" value={prefs.theme} onChange={(e) => onChange({ theme: e.target.value })}>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block text-[12px] text-[var(--color-text-muted)]">
          Font size
          <input type="number" min={9} max={28} className="lp-input mt-1 !py-1 text-[12px]" value={prefs.fontSize} onChange={(e) => onChange({ fontSize: Math.min(28, Math.max(9, Number(e.target.value) || 13)) })} />
        </label>
        <label className="block text-[12px] text-[var(--color-text-muted)]">
          Tab size
          <select className="lp-input mt-1 !py-1 text-[12px]" value={prefs.tabSize} onChange={(e) => onChange({ tabSize: Number(e.target.value) })}>
            {[2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(
        [
          ['minimap', 'Minimap'],
          ['wordWrap', 'Word wrap'],
          ['formatOnSave', 'Format on save']
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between py-1 text-[12px] text-[var(--color-text-muted)]">
          {label}
          <span className="lp-switch">
            <input type="checkbox" checked={prefs[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
            <span />
          </span>
        </label>
      ))}
    </div>
  )
}

import {
  Code,
  DownloadSimple,
  FolderOpen,
  MagnifyingGlass,
  Palette,
  PlugsConnected,
  Plus,
  Sparkle,
  Package,
  Trash
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import {
  BUILTIN_PLUGINS,
  PLUGIN_TEMPLATE,
  PluginManifestSchema,
  type PluginCategory,
  type PluginManifest
} from '@shared/plugins'
import { Dialog } from '../components/ui/Dialog'
import { Button } from '../components/ui/Button'
import { usePluginsStore } from './pluginsStore'

const CATEGORY: Record<PluginCategory, { label: string; icon: React.ReactNode }> = {
  theme: { label: 'Theme', icon: <Palette size={18} weight="duotone" /> },
  snippets: { label: 'Snippets', icon: <Code size={18} weight="duotone" /> },
  prompts: { label: 'AI Prompts', icon: <Sparkle size={18} weight="duotone" /> },
  mcp: { label: 'MCP Server', icon: <PlugsConnected size={18} weight="duotone" /> },
  pack: { label: 'Pack', icon: <Package size={18} weight="duotone" /> }
}

const BUILTIN = BUILTIN_PLUGINS.map((p) => PluginManifestSchema.parse(p))

function summary(manifest: PluginManifest): string {
  const c = manifest.contributes
  const parts = [
    c.themes.length && `${c.themes.length} theme${c.themes.length > 1 ? 's' : ''}`,
    c.snippets.length && `${c.snippets.length} snippets`,
    c.commands.length && `${c.commands.length} AI command${c.commands.length > 1 ? 's' : ''}`,
    c.mcpServers.length && `${c.mcpServers.length} MCP server${c.mcpServers.length > 1 ? 's' : ''}`
  ].filter(Boolean)
  return parts.join(' · ')
}

export function ExtensionsView(): React.JSX.Element {
  const { plugins, loaded, error, refresh, install, uninstall, setEnabled, importFromFile } = usePluginsStore()
  const [tab, setTab] = useState<'installed' | 'marketplace'>('installed')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  useEffect(() => {
    if (loaded && plugins.length === 0) setTab('marketplace')
    // Only on first load: don't yank the user off Installed after an uninstall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const installedIds = useMemo(() => new Set(plugins.map((p) => p.manifest.id)), [plugins])
  const needle = query.trim().toLowerCase()
  const matches = (m: PluginManifest): boolean =>
    !needle || m.name.toLowerCase().includes(needle) || m.description.toLowerCase().includes(needle) || m.category.includes(needle)

  const run = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="lp-side-section-head">
        Extensions
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" className="lp-mini-btn" title="Create plugin…" aria-label="Create plugin" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
          </button>
          <button type="button" className="lp-mini-btn" title="Install from file…" aria-label="Install from file" onClick={() => void importFromFile()}>
            <DownloadSimple size={14} />
          </button>
          <button type="button" className="lp-mini-btn" title="Open plugins folder" aria-label="Open plugins folder" onClick={() => void window.localpilot.openPluginFolder()}>
            <FolderOpen size={14} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="lp-search-box">
          <MagnifyingGlass size={13} className="shrink-0 text-[var(--color-text-faint)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search extensions"
            aria-label="Search extensions"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </div>
        <div className="lp-seg mt-2" role="tablist" aria-label="Extension lists">
          <button type="button" role="tab" aria-selected={tab === 'installed'} className={tab === 'installed' ? 'is-active' : ''} onClick={() => setTab('installed')}>
            Installed <span className="lp-count-pill">{plugins.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'marketplace'} className={tab === 'marketplace' ? 'is-active' : ''} onClick={() => setTab('marketplace')}>
            Marketplace
          </button>
        </div>
        {error ? <p className="mt-2 text-[11px] text-[var(--color-danger)]">{error}</p> : null}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-6">
        {tab === 'installed' ? (
          plugins.filter((p) => matches(p.manifest)).length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-[var(--color-text-faint)]">
              {plugins.length === 0 ? 'Nothing installed yet — browse the Marketplace.' : 'No matches.'}
            </p>
          ) : (
            plugins
              .filter((p) => matches(p.manifest))
              .map((p) => (
                <PluginCard key={p.manifest.id} manifest={p.manifest} dimmed={!p.enabled}>
                  <label className="lp-switch" title={p.enabled ? 'Disable' : 'Enable'}>
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      disabled={busy === p.manifest.id}
                      onChange={(e) => void run(p.manifest.id, () => setEnabled(p.manifest.id, e.target.checked))}
                      aria-label={`${p.enabled ? 'Disable' : 'Enable'} ${p.manifest.name}`}
                    />
                    <span />
                  </label>
                  <button
                    type="button"
                    className="lp-mini-btn hover:!text-[var(--color-danger)]"
                    aria-label={`Uninstall ${p.manifest.name}`}
                    title="Uninstall"
                    disabled={busy === p.manifest.id}
                    onClick={() => void run(p.manifest.id, () => uninstall(p.manifest.id))}
                  >
                    <Trash size={13} />
                  </button>
                </PluginCard>
              ))
          )
        ) : (
          BUILTIN.filter(matches).map((m) => (
            <PluginCard key={m.id} manifest={m}>
              {installedIds.has(m.id) ? (
                <span className="text-[10px] text-[var(--color-ok)]">Installed</span>
              ) : (
                <Button size="sm" variant="accent" loading={busy === m.id} onClick={() => void run(m.id, () => install(m))}>
                  Install
                </Button>
              )}
            </PluginCard>
          ))
        )}
      </div>

      <CreatePluginDialog open={createOpen} onClose={() => setCreateOpen(false)} onInstall={install} />
    </div>
  )
}

function PluginCard({
  manifest,
  dimmed,
  children
}: {
  manifest: PluginManifest
  dimmed?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const category = CATEGORY[manifest.category]
  const mcpNeeds = manifest.contributes.mcpServers.length > 0
  return (
    <div className={`lp-ext-card ${dimmed ? 'opacity-60' : ''}`}>
      <div className="lp-ext-icon">{category.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-[var(--color-text)]">{manifest.name}</span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-faint)]">v{manifest.version}</span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug text-[var(--color-text-muted)]">{manifest.description}</p>
        <p
          className="mt-1 truncate text-[10px] text-[var(--color-text-faint)]"
          title={[category.label, summary(manifest), manifest.author].filter(Boolean).join(' · ')}
        >
          {[category.label, summary(manifest), manifest.author].filter(Boolean).join(' · ')}
        </p>
        {mcpNeeds ? (
          <p className="mt-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
            runs: {manifest.contributes.mcpServers.map((s) => `${s.command} ${s.args.join(' ')}`).join('; ')}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">{children}</div>
    </div>
  )
}

function CreatePluginDialog({
  open,
  onClose,
  onInstall
}: {
  open: boolean
  onClose: () => void
  onInstall: (manifest: unknown) => Promise<boolean>
}): React.JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(PLUGIN_TEMPLATE, null, 2))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Invalid JSON')
      return
    }
    const parsed = PluginManifestSchema.safeParse(raw)
    if (!parsed.success) {
      setProblem(parsed.error.issues.map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`).join('\n'))
      return
    }
    setBusy(true)
    try {
      if (await onInstall(parsed.data)) {
        setProblem(null)
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="lp-create-plugin" className="max-w-2xl">
      <h2 id="lp-create-plugin" className="text-[14px] font-medium">
        Create a plugin
      </h2>
      <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
        Plugins are JSON manifests. Commands use <code className="lp-md-inline-code">{'{{selection}}'}</code>,{' '}
        <code className="lp-md-inline-code">{'{{file}}'}</code>, <code className="lp-md-inline-code">{'{{language}}'}</code>;{' '}
        <code className="lp-md-inline-code">target: "inline"</code> rewrites the selection with a diff review. MCP args can use{' '}
        <code className="lp-md-inline-code">{'${workspace}'}</code>.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label="Plugin manifest JSON"
        className="lp-input mt-3 h-[340px] resize-none font-[var(--font-mono)] text-[11px] leading-relaxed"
      />
      {problem ? (
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--color-danger)]">{problem}</pre>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="accent" loading={busy} onClick={() => void submit()}>
          Install plugin
        </Button>
      </div>
    </Dialog>
  )
}

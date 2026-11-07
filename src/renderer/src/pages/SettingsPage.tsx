import {
  ArrowDown,
  ArrowSquareOut,
  ArrowUp,
  Brain,
  CheckCircle,
  ClockCounterClockwise,
  Cpu,
  Eye,
  EyeSlash,
  FolderOpen,
  Info,
  Key,
  MagnifyingGlass,
  PaintBrush,
  Plus,
  PlugsConnected,
  ShieldCheck,
  Star,
  Trash,
  TreeStructure,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import type { AuditRow, McpServerConfig, MemoryNoteRow } from '@shared/ipc'
import type { ProviderConfig, ProviderKind } from '@shared/types'
import {
  PROVIDER_CATALOG,
  TIER_LABEL,
  presetForProvider,
  providerFromPreset,
  searchCatalog,
  type ProviderPreset,
  type ProviderTier
} from '@shared/providerCatalog'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Dialog } from '../components/ui/Dialog'

const KINDS: { id: ProviderKind; label: string }[] = [
  { id: 'openai-compat', label: 'OpenAI-compatible' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'anthropic', label: 'Anthropic (native)' },
  { id: 'gemini', label: 'Gemini (native)' }
]

const PANE_KEYS = [
  'lp.pane.sidebar',
  'lp.pane.inspector',
  'lp.pane.sidebarOpen',
  'lp.pane.inspectorOpen',
  'lp.ide.sideWidth',
  'lp.ide.panelHeight',
  'lp.ide.sideOpen',
  'lp.ide.panelOpen'
]

type SectionId = 'providers' | 'fallback' | 'agent' | 'appearance' | 'mcp' | 'memory' | 'audit' | 'about'

const SECTIONS: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: 'providers', label: 'Models & keys', icon: <Cpu size={15} /> },
  { id: 'fallback', label: 'Fallback chain', icon: <TreeStructure size={15} /> },
  { id: 'agent', label: 'Workspace & agent', icon: <FolderOpen size={15} /> },
  { id: 'appearance', label: 'Appearance', icon: <PaintBrush size={15} /> },
  { id: 'mcp', label: 'MCP servers', icon: <PlugsConnected size={15} /> },
  { id: 'memory', label: 'Memory', icon: <Brain size={15} /> },
  { id: 'audit', label: 'Audit log', icon: <ShieldCheck size={15} /> },
  { id: 'about', label: 'About & updates', icon: <Info size={15} /> }
]

export function SettingsPage(): React.JSX.Element {
  const [section, setSection] = useState<SectionId>('providers')
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav className="lp-settings-nav" aria-label="Settings sections">
        <div className="px-3 pb-3 pt-4">
          <h1 className="text-[15px] font-medium tracking-tight">Settings</h1>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">Keys stay encrypted on this device.</p>
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`lp-settings-nav-item ${section === s.id ? 'is-active' : ''}`}
            aria-current={section === s.id ? 'page' : undefined}
            onClick={() => setSection(s.id)}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg)]">
        {section === 'providers' ? (
          <ProvidersSection />
        ) : section === 'fallback' ? (
          <FallbackSection />
        ) : section === 'agent' ? (
          <AgentSection />
        ) : section === 'appearance' ? (
          <AppearanceSection />
        ) : section === 'mcp' ? (
          <McpSection />
        ) : section === 'memory' ? (
          <MemorySection />
        ) : section === 'audit' ? (
          <AuditSection />
        ) : (
          <AboutSection />
        )}
      </div>
    </div>
  )
}

// ── Providers ───────────────────────────────────────────────────────

interface ProviderForm {
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  visionEnabled: boolean
  reasoningEnabled: boolean
  enabled: boolean
  maxTokens: number
  apiKey: string
}

function formFrom(p: ProviderConfig | undefined): ProviderForm {
  return {
    name: p?.name ?? '',
    kind: p?.kind ?? 'openai-compat',
    baseUrl: p?.baseUrl ?? '',
    model: p?.model ?? '',
    visionEnabled: p?.visionEnabled ?? false,
    reasoningEnabled: p?.reasoningEnabled ?? false,
    enabled: p?.enabled ?? true,
    maxTokens: p?.maxTokens ?? 0,
    apiKey: ''
  }
}

function ProvidersSection(): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const activeId = useAppStore((s) => s.settings?.activeProviderId ?? null)
  const upsertProvider = useAppStore((s) => s.upsertProvider)
  const deleteProvider = useAppStore((s) => s.deleteProvider)
  const testProvider = useAppStore((s) => s.testProvider)
  const testResult = useAppStore((s) => s.testResult)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)

  const [selectedId, setSelectedId] = useState(activeId ?? providers[0]?.id ?? '')
  const selected = providers.find((p) => p.id === selectedId)
  const preset = selected ? presetForProvider(selected) : undefined
  const [form, setForm] = useState<ProviderForm>(() => formFrom(selected))
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm(formFrom(providers.find((p) => p.id === selectedId)))
    setModels([])
    setShowKey(false)
    setSaved(false)
    // Re-sync only when switching providers, not on every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const modelOptions = useMemo(
    () => [...new Set([...(preset?.models ?? []), ...models])],
    [preset, models]
  )

  const onSave = async (): Promise<void> => {
    if (!selectedId) return
    setSaving(true)
    try {
      await upsertProvider(
        {
          id: selectedId,
          name: form.name.trim() || 'Provider',
          kind: form.kind,
          baseUrl: form.baseUrl.trim(),
          model: form.model.trim(),
          visionEnabled: form.visionEnabled,
          reasoningEnabled: form.reasoningEnabled,
          enabled: form.enabled,
          ...(form.maxTokens > 0 ? { maxTokens: form.maxTokens } : {})
        },
        form.apiKey.length > 0 ? form.apiKey.trim() : undefined
      )
      setForm((f) => ({ ...f, apiKey: '' }))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  const onTest = async (): Promise<void> => {
    setTesting(true)
    try {
      if (form.apiKey || form.model !== selected?.model || form.baseUrl !== selected?.baseUrl) await onSave()
      await testProvider(selectedId)
    } finally {
      setTesting(false)
    }
  }

  const addFromPreset = async (p: ProviderPreset): Promise<void> => {
    const config = providerFromPreset(p, new Set(providers.map((x) => x.id)))
    await upsertProvider(config)
    setGalleryOpen(false)
    setSelectedId(config.id)
    if (p.needsKey) window.setTimeout(() => keyRef.current?.focus(), 80)
  }

  const addCustom = async (): Promise<void> => {
    const id = `custom-${Date.now().toString(36)}`
    await upsertProvider({
      id,
      kind: 'openai-compat',
      name: 'Custom provider',
      baseUrl: 'https://api.example.com/v1',
      model: 'model-name',
      visionEnabled: false,
      enabled: true
    })
    setGalleryOpen(false)
    setSelectedId(id)
  }

  const onDelete = async (): Promise<void> => {
    if (!selected || !window.confirm(`Remove ${selected.name}? Its saved key is deleted too.`)) return
    await deleteProvider(selected.id)
    setSelectedId(providers.find((p) => p.id !== selected.id)?.id ?? '')
  }

  const keyMissing = (p: ProviderConfig): boolean => Boolean(presetForProvider(p)?.needsKey) && !p.hasApiKey

  return (
    <div className="flex min-h-full">
      <div className="w-[280px] shrink-0 border-r border-[var(--color-border)] p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            Providers · {providers.length}
          </span>
          <Button size="sm" variant="accent" onClick={() => setGalleryOpen(true)}>
            <Plus size={12} weight="bold" aria-hidden /> Add
          </Button>
        </div>
        <ul className="space-y-1">
          {providers.map((p) => {
            const tier = presetForProvider(p)?.tier
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-current={p.id === selectedId ? 'true' : undefined}
                  className={`lp-provider-row ${p.id === selectedId ? 'is-active' : ''} ${p.enabled ? '' : 'opacity-55'}`}
                >
                  <span className={`lp-key-dot ${keyMissing(p) ? 'is-missing' : p.hasApiKey || tier === 'local' ? 'is-ok' : ''}`} aria-hidden />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{p.name}</span>
                      {p.id === activeId ? <Star size={11} weight="fill" className="shrink-0 text-[var(--color-accent)]" aria-label="Active" /> : null}
                    </span>
                    <span className="block truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">{p.model}</span>
                  </span>
                  {tier ? <span className={`lp-tier is-${tier}`}>{TIER_LABEL[tier]}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
          <span className="lp-key-dot is-ok mr-1 inline-block align-middle" /> ready ·{' '}
          <span className="lp-key-dot is-missing mr-1 inline-block align-middle" /> needs a key
        </p>
      </div>

      <div className="min-w-0 max-w-2xl flex-1 px-8 py-6">
        {!selected ? (
          <EmptyState onAdd={() => setGalleryOpen(true)} />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-medium tracking-tight">{selected.name}</h2>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                  {preset ? preset.blurb : 'Custom endpoint.'}
                </p>
              </div>
              {selected.id === activeId ? (
                <Badge tone="accent">Active</Badge>
              ) : (
                <Button size="sm" onClick={() => void setActiveProvider(selected.id)} disabled={!selected.enabled}>
                  <Star size={12} aria-hidden /> Make active
                </Button>
              )}
            </div>

            {preset?.needsKey || form.kind !== 'ollama' ? (
              <div className="lp-key-card mt-5">
                <div className="flex items-center gap-2">
                  <Key size={15} className="text-[var(--color-accent)]" aria-hidden />
                  <span className="text-[13px] font-medium">API key</span>
                  {selected.hasApiKey ? <Badge tone="ok">saved · encrypted</Badge> : preset?.needsKey ? <Badge tone="warn">required</Badge> : <Badge>optional</Badge>}
                  {preset ? (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 text-[12px] text-[var(--color-accent)] hover:underline"
                      onClick={() => void window.localpilot.openExternal(preset.keyUrl)}
                    >
                      {preset.tier === 'local' ? 'Download' : 'Get a key'} <ArrowSquareOut size={11} aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex gap-2">
                  <div className="lp-input flex items-center gap-1 !py-0 focus-within:border-[var(--color-accent)]">
                    <input
                      ref={keyRef}
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={form.apiKey}
                      onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void onSave()
                      }}
                      placeholder={selected.hasApiKey ? '•••••••• (leave blank to keep)' : (preset?.keyHint ?? 'Paste your API key')}
                      className="min-w-0 flex-1 bg-transparent py-1.5 font-[var(--font-mono)] text-[12px] outline-none"
                      aria-label="API key"
                    />
                    <button type="button" className="lp-mini-btn" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide key' : 'Show key'}>
                      {showKey ? <EyeSlash size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {selected.hasApiKey ? (
                    <Button
                      variant="danger"
                      onClick={() => {
                        void window.localpilot.setProviderApiKey(selected.id, '').then(() => useAppStore.getState().refreshProviders())
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Display name">
                <input className="lp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="API type">
                <select className="lp-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderKind })}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Base URL">
                  <input className="lp-input font-[var(--font-mono)] text-[12px]" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} spellCheck={false} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Model">
                  <div className="flex gap-2">
                    <input
                      className="lp-input font-[var(--font-mono)] text-[12px]"
                      value={form.model}
                      list="lp-model-options"
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      spellCheck={false}
                    />
                    <datalist id="lp-model-options">
                      {modelOptions.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <Button
                      onClick={() => {
                        void window.localpilot.listProviderModels(selectedId).then((list) => {
                          setModels(list)
                          if (list.length === 0) useAppStore.setState({ testResult: { ok: false, message: 'No models returned — check the key and base URL.' } })
                        })
                      }}
                    >
                      Fetch models
                    </Button>
                  </div>
                </Field>
                {modelOptions.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {modelOptions.slice(0, 14).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`lp-model-tag ${m === form.model ? 'is-on' : ''}`}
                        onClick={() => setForm({ ...form, model: m })}
                      >
                        {m}
                      </button>
                    ))}
                    {modelOptions.length > 14 ? (
                      <span className="self-center text-[10px] text-[var(--color-text-faint)]">+{modelOptions.length - 14} in the list</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Field label="Max output tokens (0 = default)">
                <input type="number" min={0} className="lp-input" value={form.maxTokens} onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 0 })} />
              </Field>
              <div className="flex flex-col justify-end gap-1.5 pb-1">
                <Toggle label="Enabled" checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
                <Toggle label="Vision (images)" checked={form.visionEnabled} onChange={(v) => setForm({ ...form, visionEnabled: v })} />
                <Toggle label="Stream reasoning" checked={form.reasoningEnabled} onChange={(v) => setForm({ ...form, reasoningEnabled: v })} />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-4">
              <Button variant="accent" loading={saving} onClick={() => void onSave()}>
                {saved ? <CheckCircle size={13} weight="fill" aria-hidden /> : null}
                {saved ? 'Saved' : 'Save'}
              </Button>
              <Button loading={testing} onClick={() => void onTest()}>
                Test connection
              </Button>
              <div className="flex-1" />
              <Button variant="danger" onClick={() => void onDelete()}>
                <Trash size={12} aria-hidden /> Remove
              </Button>
            </div>

            {testResult ? (
              <div
                className={`mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[13px] ${
                  testResult.ok ? 'border-[var(--color-ok)]/30' : 'border-[var(--color-danger)]/40'
                }`}
                role="status"
              >
                {testResult.ok ? (
                  <CheckCircle size={16} className="mt-0.5 shrink-0 text-[var(--color-ok)]" aria-hidden />
                ) : (
                  <WarningCircle size={16} className="mt-0.5 shrink-0 text-[var(--color-danger)]" aria-hidden />
                )}
                <div className="min-w-0 break-words">
                  {testResult.message}
                  {testResult.latencyMs != null ? <span className="ml-1 text-[var(--color-text-faint)]">({testResult.latencyMs} ms)</span> : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ProviderGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} onAdd={addFromPreset} onCustom={addCustom} />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Cpu size={32} weight="duotone" className="text-[var(--color-accent)]" aria-hidden />
      <p className="max-w-xs text-[13px] text-[var(--color-text-muted)]">
        Add a provider to start. Free options like Groq, Gemini, and OpenRouter take a minute to set up.
      </p>
      <Button variant="accent" onClick={onAdd}>
        Browse providers
      </Button>
    </div>
  )
}

function ProviderGallery({
  open,
  onClose,
  onAdd,
  onCustom
}: {
  open: boolean
  onClose: () => void
  onAdd: (preset: ProviderPreset) => Promise<void>
  onCustom: () => Promise<void>
}): React.JSX.Element {
  const [tier, setTier] = useState<ProviderTier | 'all'>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const list = searchCatalog(query, tier)
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: PROVIDER_CATALOG.length }
    for (const p of PROVIDER_CATALOG) c[p.tier] = (c[p.tier] ?? 0) + 1
    return c
  }, [])

  return (
    <Dialog open={open} onClose={onClose} labelledBy="lp-gallery-title" className="max-w-3xl !p-0">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="lp-gallery-title" className="text-[15px] font-medium">
            Add a model provider
          </h2>
          <p className="text-[12px] text-[var(--color-text-muted)]">
            Free keys and local runtimes cost nothing. Paid keys bill your own account.
          </p>
        </div>
        <button type="button" className="lp-mini-btn" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
        <div className="lp-seg" role="tablist" aria-label="Pricing">
          {(['all', 'free', 'local', 'paid'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tier === t} className={tier === t ? 'is-active' : ''} onClick={() => setTier(t)}>
              {t === 'all' ? 'All' : TIER_LABEL[t]} <span className="lp-count-pill">{counts[t] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="lp-search-box ml-auto w-56">
          <MagnifyingGlass size={13} className="text-[var(--color-text-faint)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers or models"
            aria-label="Search providers"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </div>
      </div>
      <div className="grid max-h-[58vh] grid-cols-1 gap-2 overflow-y-auto px-5 py-3 sm:grid-cols-2">
        {list.map((p) => (
          <div key={p.id} className="lp-preset-card">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium">{p.name}</span>
              <span className={`lp-tier is-${p.tier}`}>{TIER_LABEL[p.tier]}</span>
              {p.vision ? <span className="text-[10px] text-[var(--color-text-faint)]">vision</span> : null}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-muted)]">{p.blurb}</p>
            <p className="mt-1 truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">{p.model}</p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="accent"
                loading={busy === p.id}
                onClick={() => {
                  setBusy(p.id)
                  void onAdd(p).finally(() => setBusy(null))
                }}
              >
                <Plus size={11} weight="bold" aria-hidden /> Add
              </Button>
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline"
                onClick={() => void window.localpilot.openExternal(p.keyUrl)}
              >
                {p.tier === 'local' ? 'Download' : 'Get key'} <ArrowSquareOut size={10} aria-hidden />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 ? <p className="col-span-2 py-6 text-center text-[12px] text-[var(--color-text-faint)]">No providers match.</p> : null}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
        <span className="text-[11px] text-[var(--color-text-faint)]">Any OpenAI-compatible endpoint works too (vLLM, LiteLLM, Azure, gateways).</span>
        <Button size="sm" onClick={() => void onCustom()}>
          Custom endpoint
        </Button>
      </div>
    </Dialog>
  )
}

// ── Fallback chain ──────────────────────────────────────────────────

function FallbackSection(): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const settings = useAppStore((s) => s.settings)
  const setFallbackProviders = useAppStore((s) => s.setFallbackProviders)
  const chain = (settings?.fallbackProviderIds ?? []).filter((id) => providers.some((p) => p.id === id))
  const active = providers.find((p) => p.id === settings?.activeProviderId)
  const candidates = providers.filter((p) => p.enabled && !chain.includes(p.id) && p.id !== active?.id)
  const [pick, setPick] = useState('')

  const move = (index: number, delta: number): void => {
    const next = [...chain]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    void setFallbackProviders(next)
  }

  return (
    <Page title="Fallback chain" hint="When the active model fails before answering (bad key, used-up free quota, server down), LocalPilot retries the same request on the next provider in this list. A notice in the activity log says when it switched.">
      <ol className="space-y-1.5">
        <li className="lp-chain-row">
          <span className="lp-chain-num is-primary">1</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{active?.name ?? 'No active model'}</span>
            <span className="block truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">{active?.model}</span>
          </span>
          <Badge tone="accent">active</Badge>
        </li>
        {chain.map((id, index) => {
          const p = providers.find((x) => x.id === id)!
          return (
            <li key={id} className={`lp-chain-row ${p.enabled ? '' : 'opacity-55'}`}>
              <span className="lp-chain-num">{index + 2}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{p.name}</span>
                <span className="block truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                  {p.model}
                  {p.enabled ? '' : ' · disabled (skipped)'}
                </span>
              </span>
              <button type="button" className="lp-mini-btn" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={12} />
              </button>
              <button type="button" className="lp-mini-btn" aria-label="Move down" disabled={index === chain.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown size={12} />
              </button>
              <button type="button" className="lp-mini-btn" aria-label="Remove" onClick={() => void setFallbackProviders(chain.filter((x) => x !== id))}>
                <X size={12} />
              </button>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 flex gap-2">
        <select className="lp-input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Provider to add">
          <option value="">Add a fallback provider…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.model}
            </option>
          ))}
        </select>
        <Button
          disabled={!pick}
          onClick={() => {
            void setFallbackProviders([...chain, pick].slice(0, 8))
            setPick('')
          }}
        >
          Add
        </Button>
      </div>
      <p className="mt-3 text-[12px] text-[var(--color-text-faint)]">
        Tip: chain several free tiers (Groq → Gemini → OpenRouter → local Ollama) for an agent that keeps working when one quota runs out.
      </p>
    </Page>
  )
}

// ── Workspace & agent ───────────────────────────────────────────────

function AgentSection(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath)
  const clearWorkspace = useAppStore((s) => s.clearWorkspace)
  const setMaxAgentSteps = useAppStore((s) => s.setMaxAgentSteps)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const [draft, setDraft] = useState(settings?.workspacePath ?? '')
  useEffect(() => setDraft(settings?.workspacePath ?? ''), [settings?.workspacePath])

  return (
    <Page title="Workspace & agent" hint="Agent and Plan tools are sandboxed to the open folder.">
      <Group title="Workspace folder">
        <div className="flex gap-2">
          <Button variant="accent" onClick={() => void openWorkspace()}>
            <FolderOpen size={13} aria-hidden /> Open Folder…
          </Button>
          {settings?.workspacePath ? <Button onClick={() => void clearWorkspace()}>Clear</Button> : null}
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim()
            if (next !== (settings?.workspacePath ?? '')) void setWorkspacePath(next)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder="No folder open — click Open Folder or paste a path"
          className="lp-input mt-2 font-[var(--font-mono)] text-[12px]"
          spellCheck={false}
        />
      </Group>
      <Group title="Approvals">
        <select
          className="lp-input"
          value={settings?.permissionMode ?? 'ask-risky'}
          onChange={(e) => void setPermissionMode(e.target.value as 'ask-every-time' | 'ask-risky' | 'autonomous')}
        >
          <option value="ask-every-time">Ask before every tool</option>
          <option value="ask-risky">Ask before risky tools (recommended)</option>
          <option value="autonomous">Autonomous — never ask</option>
        </select>
      </Group>
      <Group title="Step budget" hint="Tool steps one Agent run may take before it stops and summarises.">
        <input
          type="number"
          min={5}
          max={200}
          className="lp-input max-w-[140px]"
          value={settings?.maxAgentSteps ?? 60}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) void setMaxAgentSteps(next)
          }}
        />
      </Group>
    </Page>
  )
}

// ── Appearance ──────────────────────────────────────────────────────

function AppearanceSection(): React.JSX.Element {
  const [reset, setReset] = useState(false)
  const rows: Array<[string, string]> = [
    ['Command palette', 'Ctrl/Cmd+K'],
    ['Chat · Code · Flow · Arena', 'Ctrl/Cmd+1 … 4'],
    ['Settings', 'Ctrl/Cmd+,'],
    ['Session list / inspector (chat)', 'Ctrl/Cmd+B / J'],
    ['Go to file (code)', 'Ctrl/Cmd+P'],
    ['Edit with AI (code)', 'Ctrl/Cmd+I'],
    ['Terminal (code)', 'Ctrl/Cmd+`']
  ]
  return (
    <Page title="Appearance" hint="Panes resize and collapse with the handles; the layout is remembered. Editor theme, font, and minimap live in the Code view's gear menu.">
      <Group title="Layout">
        <Button
          onClick={() => {
            for (const key of PANE_KEYS) window.localStorage.removeItem(key)
            setReset(true)
          }}
        >
          Reset pane layout
        </Button>
        {reset ? <p className="text-[12px] text-[var(--color-ok)]">Layout reset — reload the window (Ctrl+R) to apply defaults.</p> : null}
      </Group>
      <Group title="Keyboard shortcuts">
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {rows.map(([label, keys]) => (
            <li key={label} className="flex items-center justify-between px-3 py-2 text-[12px]">
              <span className="text-[var(--color-text-muted)]">{label}</span>
              <kbd className="lp-kbd">{keys}</kbd>
            </li>
          ))}
        </ul>
      </Group>
    </Page>
  )
}

// ── MCP ─────────────────────────────────────────────────────────────

function McpSection(): React.JSX.Element {
  const [text, setText] = useState('{\n  "servers": []\n}')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.localpilot.getMcpConfig().then((config) => setText(JSON.stringify(config, null, 2)))
  }, [])
  return (
    <Page title="MCP servers" hint="stdio Model Context Protocol servers give the agent extra tools. Install ready-made ones from Code → Extensions → Marketplace, or edit the JSON here.">
      <textarea
        className="lp-input min-h-[260px] font-[var(--font-mono)] text-[11px] leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label="MCP configuration JSON"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="accent"
          loading={busy}
          onClick={() => {
            let parsed: { servers: McpServerConfig[] }
            try {
              parsed = JSON.parse(text) as { servers: McpServerConfig[] }
            } catch (err) {
              setMsg({ ok: false, text: err instanceof Error ? err.message : 'Invalid JSON' })
              return
            }
            setBusy(true)
            void window.localpilot
              .saveMcpConfig(parsed)
              .then((result) =>
                setMsg(result.ok ? { ok: true, text: `Saved and reconnected — ${result.tools ?? 0} tool(s) available.` } : { ok: false, text: result.error ?? 'Save failed' })
              )
              .finally(() => setBusy(false))
          }}
        >
          Save & reconnect
        </Button>
        {msg ? <span className={`text-[12px] ${msg.ok ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'}`}>{msg.text}</span> : null}
      </div>
    </Page>
  )
}

// ── Memory / audit / about ─────────────────────────────────────────

function MemorySection(): React.JSX.Element {
  const [notes, setNotes] = useState<MemoryNoteRow[]>([])
  const load = (): void => void window.localpilot.listMemoryNotes().then(setNotes).catch(() => setNotes([]))
  useEffect(load, [])
  return (
    <Page title="Memory" hint="Notes the agent saved for future runs." action={<Button size="sm" onClick={load}>Refresh</Button>}>
      {notes.length === 0 ? (
        <Empty>No notes stored yet.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
                  {note.kind} · {new Date(note.createdAt).toLocaleDateString()}
                </div>
                <p className="text-[12px] text-[var(--color-text-muted)]">{note.content}</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void window.localpilot.deleteMemoryNote(note.id).then(() => setNotes((rows) => rows.filter((r) => r.id !== note.id)))}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

function AuditSection(): React.JSX.Element {
  const [rows, setRows] = useState<AuditRow[]>([])
  const load = (): void => void window.localpilot.recentAudit().then(setRows)
  useEffect(load, [])
  return (
    <Page title="Audit log" hint="Every tool the agent ran, newest first." action={<Button size="sm" onClick={load}><ClockCounterClockwise size={12} aria-hidden /> Refresh</Button>}>
      {rows.length === 0 ? (
        <Empty>No audit entries yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-[var(--color-surface)] text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
              <tr>
                <th className="px-3 py-1.5 font-medium">Time</th>
                <th className="px-3 py-1.5 font-medium">Tool</th>
                <th className="px-3 py-1.5 font-medium">Risk</th>
                <th className="px-3 py-1.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] font-[var(--font-mono)]">
              {rows.map((row, i) => (
                <tr key={`${row.timestamp}-${i}`} title={row.preview}>
                  <td className="px-3 py-1.5 text-[var(--color-text-faint)]">{new Date(row.timestamp).toLocaleTimeString()}</td>
                  <td className="px-3 py-1.5 text-[var(--color-text)]">{row.toolName}</td>
                  <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{row.risk}</td>
                  <td className={`px-3 py-1.5 ${row.ok ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'}`}>{row.ok ? 'ok' : 'failed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}

function AboutSection(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void window.localpilot.getVersion().then(setVersion), [])
  return (
    <Page title="About & updates" hint={`LocalPilot ${version || '…'} — packaged builds update from GitHub Releases.`}>
      <Button
        loading={busy}
        onClick={() => {
          setBusy(true)
          setMsg(null)
          void window.localpilot
            .checkForUpdates()
            .then((result) => {
              if (result.status === 'dev') setMsg(result.message ?? 'Dev build — updates disabled')
              else if (result.status === 'available') setMsg(`Update ${result.version ?? ''} available — downloading…`)
              else if (result.status === 'not-available') setMsg('You are on the latest version.')
              else setMsg(result.message ?? 'Update check failed')
            })
            .finally(() => setBusy(false))
        }}
      >
        Check for updates
      </Button>
      {msg ? <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">{msg}</p> : null}
    </Page>
  )
}

// ── Layout helpers ──────────────────────────────────────────────────

function Page({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="max-w-2xl px-8 py-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-medium tracking-tight">{title}</h2>
          {hint ? <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-muted)]">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="mb-6 space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">{title}</h3>
      {hint ? <p className="text-[12px] text-[var(--color-text-muted)]">{hint}</p> : null}
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="text-[12px] text-[var(--color-text-faint)]">{children}</p>
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
      <span className="lp-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
      {label}
    </label>
  )
}

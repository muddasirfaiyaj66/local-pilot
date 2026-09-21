import { CheckCircle, Plus, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { ProviderConfig, ProviderKind } from '@shared/types'

const KINDS: { id: ProviderKind; label: string }[] = [
  { id: 'ollama', label: 'Ollama' },
  { id: 'openai-compat', label: 'OpenAI-compatible' },
  { id: 'anthropic', label: 'Anthropic (compat)' },
  { id: 'gemini', label: 'Gemini (compat)' }
]

export function SettingsPage(): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const settings = useAppStore((s) => s.settings)
  const upsertProvider = useAppStore((s) => s.upsertProvider)
  const testProvider = useAppStore((s) => s.testProvider)
  const testResult = useAppStore((s) => s.testResult)

  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath)
  const clearWorkspace = useAppStore((s) => s.clearWorkspace)
  const setMaxAgentSteps = useAppStore((s) => s.setMaxAgentSteps)

  const [appVersion, setAppVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [workspaceDraft, setWorkspaceDraft] = useState(settings?.workspacePath ?? '')

  useEffect(() => {
    setWorkspaceDraft(settings?.workspacePath ?? '')
  }, [settings?.workspacePath])

  useEffect(() => {
    void window.localpilot.getVersion().then(setAppVersion)
  }, [])

  const onCheckUpdates = async (): Promise<void> => {
    setUpdateBusy(true)
    setUpdateMsg(null)
    try {
      const result = await window.localpilot.checkForUpdates()
      if (result.status === 'dev') setUpdateMsg(result.message ?? 'Dev build — updates disabled')
      else if (result.status === 'available')
        setUpdateMsg(`Update ${result.version ?? ''} available — downloading…`)
      else if (result.status === 'not-available') setUpdateMsg('You are on the latest version.')
      else setUpdateMsg(result.message ?? 'Update check failed')
    } finally {
      setUpdateBusy(false)
    }
  }

  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? '')
  const selected = providers.find((p) => p.id === selectedId) ?? providers[0]

  const [form, setForm] = useState({
    name: selected?.name ?? '',
    kind: (selected?.kind ?? 'ollama') as ProviderKind,
    baseUrl: selected?.baseUrl ?? '',
    model: selected?.model ?? '',
    visionEnabled: selected?.visionEnabled ?? false,
    apiKey: ''
  })

  const loadProvider = (p: ProviderConfig): void => {
    setSelectedId(p.id)
    setForm({
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      visionEnabled: p.visionEnabled,
      apiKey: ''
    })
  }

  const onSave = async (): Promise<void> => {
    const id = selectedId || `provider_${Date.now().toString(36)}`
    await upsertProvider(
      {
        id,
        name: form.name,
        kind: form.kind,
        baseUrl: form.baseUrl,
        model: form.model,
        visionEnabled: form.visionEnabled,
        enabled: true
      },
      form.apiKey.length > 0 ? form.apiKey : undefined
    )
    setSelectedId(id)
    setForm((f) => ({ ...f, apiKey: '' }))
  }

  const onAdd = (): void => {
    const id = `provider_${Date.now().toString(36)}`
    setSelectedId(id)
    setForm({
      name: 'New provider',
      kind: 'openai-compat',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      visionEnabled: true,
      apiKey: ''
    })
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-[240px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-9 items-center justify-between px-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            Providers
          </span>
          <button type="button" className="lp-icon-btn" onClick={onAdd} aria-label="Add provider">
            <Plus size={14} weight="bold" aria-hidden />
          </button>
        </div>
        <ul className="px-1.5 pb-2">
          {providers.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => loadProvider(p)}
                className={`mb-0.5 w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  p.id === selectedId
                    ? 'bg-[var(--color-hover)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]'
                }`}
              >
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                  {p.model}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)] px-8 py-6">
        <h1 className="text-[18px] font-medium tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
          Models, keys, and workspace. Keys stay in Electron safeStorage.
        </p>

        <section className="mt-8 max-w-lg">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            Workspace
          </h2>
          <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">
            Pick a project folder. Agent / Plan tools are sandboxed here.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void openWorkspace()}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-2)]"
            >
              Open Folder…
            </button>
            {settings?.workspacePath ? (
              <button
                type="button"
                onClick={() => void clearWorkspace()}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[13px] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
              >
                Clear
              </button>
            ) : null}
          </div>
          <input
            value={workspaceDraft}
            onChange={(e) => setWorkspaceDraft(e.target.value)}
            onBlur={() => {
              const next = workspaceDraft.trim()
              if (next !== (settings?.workspacePath ?? '')) {
                void setWorkspacePath(next)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
            placeholder="No folder open — click Open Folder or paste a path"
            className="lp-input mt-2 font-[var(--font-mono)] text-[12px]"
            spellCheck={false}
          />
        </section>

        <section className="mt-8 max-w-lg">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            Agent
          </h2>
          <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">
            Tool steps one Agent run may take before it stops and summarises.
          </p>
          <Field label="Step budget">
            <input
              type="number"
              min={5}
              max={200}
              className="lp-input"
              value={settings?.maxAgentSteps ?? 60}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (Number.isFinite(next)) void setMaxAgentSteps(next)
              }}
            />
          </Field>
        </section>

        <section className="mt-8 max-w-lg space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            About & updates
          </h2>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            LocalPilot {appVersion || '…'} — updates from GitHub Releases when packaged.
          </p>
          <button
            type="button"
            disabled={updateBusy}
            onClick={() => void onCheckUpdates()}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[13px] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            {updateBusy ? 'Checking…' : 'Check for updates'}
          </button>
          {updateMsg && (
            <p className="text-[13px] text-[var(--color-text-muted)]">{updateMsg}</p>
          )}
        </section>

        <section className="mt-8 max-w-lg space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            Provider
          </h2>
          <Field label="Name">
            <input
              className="lp-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Kind">
            <select
              className="lp-input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderKind })}
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base URL">
            <input
              className="lp-input font-[var(--font-mono)] text-[12px]"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
          </Field>
          <Field label="Model">
            <input
              className="lp-input"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </Field>
          <Field label={selected?.hasApiKey ? 'API key (saved — blank keeps it)' : 'API key'}>
            <input
              type="password"
              autoComplete="off"
              className="lp-input"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="sk-…"
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={form.visionEnabled}
              onChange={(e) => setForm({ ...form, visionEnabled: e.target.checked })}
            />
            Vision enabled
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => void onSave()}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-2)]"
            >
              Save
            </button>
            <button
              type="button"
              disabled={!selectedId}
              onClick={() => void testProvider(selectedId)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[13px] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Test connection
            </button>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] ${
                testResult.ok
                  ? 'border-[var(--color-ok)]/30 text-[var(--color-text)]'
                  : 'border-[var(--color-danger)]/40 text-[var(--color-text)]'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle size={16} className="mt-0.5 text-[var(--color-ok)]" aria-hidden />
              ) : (
                <WarningCircle size={16} className="mt-0.5 text-[var(--color-danger)]" aria-hidden />
              )}
              <div>
                {testResult.message}
                {testResult.latencyMs != null && (
                  <span className="ml-1 text-[var(--color-text-faint)]">({testResult.latencyMs} ms)</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  )
}

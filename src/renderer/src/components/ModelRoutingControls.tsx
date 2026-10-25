import { useRef, useState } from 'react'
import { CaretDown, Circuitry } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'
import { routedProviderId } from '../store/modelRouting'
import { useDismissPopover } from './useDismissPopover'

export function ModelRoutingControls({ draft }: { draft: string }): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const providers = useAppStore((s) => s.providers).filter((p) => p.enabled)
  const attachments = useAppStore((s) => s.attachments)
  const mode = useAppStore((s) => s.interactionMode)
  const setModelRouting = useAppStore((s) => s.setModelRouting)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useDismissPopover(open, root, () => setOpen(false))
  const routing = settings?.modelRouting
  if (!routing) return <></>
  const selected = routedProviderId(settings, providers, draft, attachments.some((a) => a.kind === 'image'), mode)
  const selectedModel = providers.find((p) => p.id === selected)?.model ?? 'No available model'
  const choices = [
    { key: 'fastProviderId', label: 'Simple tasks' },
    { key: 'strongProviderId', label: 'Agent and complex tasks' },
    { key: 'visionProviderId', label: 'Image tasks' }
  ] as const
  return (
    <div ref={root} className="relative">
      <button type="button" className="lp-composer-menu-trigger" onClick={() => setOpen(!open)} aria-label="Model routing settings" aria-expanded={open} title={`Next run: ${selectedModel}`}>
        <Circuitry size={13} aria-hidden /><span className="truncate">{routing.enabled ? `Auto · ${selectedModel}` : 'Manual model'}</span><CaretDown size={10} aria-hidden />
      </button>
      {open && <div className="lp-composer-menu">
        <div className="lp-composer-menu-title">Model routing</div>
        <label className="lp-composer-menu-label flex items-center gap-2"><input type="checkbox" checked={routing.enabled} onChange={(e) => void setModelRouting({ ...routing, enabled: e.target.checked })} /> Automatic routing</label>
        <div className="lp-composer-menu-divider" />
        {choices.map(({ key, label }) => <label key={key} className="lp-composer-menu-label">{label}
          <select aria-label={label} className="lp-select" value={routing[key]} onChange={(e) => void setModelRouting({ ...routing, [key]: e.target.value })}>
            <option value="">Use selected model</option>
            {providers.filter((p) => key !== 'visionProviderId' || p.visionEnabled).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}
          </select>
        </label>)}
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">Unconfigured routes use the selected model.</p>
      </div>}
    </div>
  )
}

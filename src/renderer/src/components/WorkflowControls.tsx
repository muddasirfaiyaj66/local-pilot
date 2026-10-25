import { useRef, useState } from 'react'
import { CaretDown, FloppyDisk, ListChecks, PencilSimple, Trash } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'
import { useDismissPopover } from './useDismissPopover'

interface Props {
  draft: string
  setDraft: (text: string) => void
}

export function WorkflowControls({ draft, setDraft }: Props): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const messages = useAppStore((s) => s.messages)
  const plan = useAppStore((s) => s.plan)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const saveWorkflow = useAppStore((s) => s.saveWorkflow)
  const deleteWorkflow = useAppStore((s) => s.deleteWorkflow)
  const [open, setOpen] = useState(false)
  const [id, setId] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [steps, setSteps] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useDismissPopover(open, root, () => setOpen(false))
  const workflows = settings?.workflows ?? []
  const lastGoal = !isStreaming ? [...messages].reverse().find((m) => m.role === 'user')?.content : undefined

  return (
    <div ref={root} className="relative">
      <button type="button" className="lp-composer-menu-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ListChecks size={13} aria-hidden /> Workflows{workflows.length ? ` ${workflows.length}` : ''}<CaretDown size={10} aria-hidden />
      </button>
      {open && (
        <div className="lp-composer-menu">
          <div className="lp-composer-menu-title">Saved workflows</div>
          <div className="max-h-32 overflow-y-auto">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="lp-composer-menu-row">
                <button type="button" className="lp-composer-menu-action flex-1 truncate" title="Load into composer" onClick={() => {
                  setDraft(`${draft.trim() ? `${draft.trim()}\n\n` : ''}Follow this workflow:\n${workflow.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`)
                  setOpen(false)
                }}>{workflow.name}</button>
                <button type="button" className="lp-icon-btn !h-6 !w-6" aria-label={`Edit ${workflow.name}`} onClick={() => { setId(workflow.id); setName(workflow.name); setSteps(workflow.steps.join('\n')) }}><PencilSimple size={12} aria-hidden /></button>
                <button type="button" className="lp-icon-btn !h-6 !w-6" aria-label={`Delete ${workflow.name}`} onClick={() => void deleteWorkflow(workflow.id)}><Trash size={12} aria-hidden /></button>
              </div>
            ))}
            {workflows.length === 0 && <p className="text-[11px] text-[var(--color-text-muted)]">No workflows saved yet.</p>}
          </div>
          <div className="lp-composer-menu-divider" />
          <div className="lp-composer-menu-title">{id ? 'Edit workflow' : 'New workflow'}</div>
          <label className="lp-composer-menu-label">Name<input placeholder="e.g. Build and verify" value={name} onChange={(e) => setName(e.target.value)} className="lp-input" maxLength={80} /></label>
          <label className="lp-composer-menu-label">Steps<textarea placeholder="One step per line" value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} className="lp-input resize-y" /></label>
          <div className="flex items-center gap-1">
            {lastGoal && <button type="button" className="lp-composer-menu-action" onClick={() => setSteps(lastGoal)}>Last goal</button>}
            {plan?.steps.length ? <button type="button" className="lp-composer-menu-action" onClick={() => setSteps(plan.steps.map((step) => step.title).join('\n'))}>Plan steps</button> : null}
            <button type="button" className="lp-btn lp-btn-accent ml-auto inline-flex items-center gap-1" disabled={!name.trim() || !steps.trim()} onClick={() => {
              void saveWorkflow(name, steps.split('\n'), id)
              setId(undefined); setName(''); setSteps('')
            }}><FloppyDisk size={12} aria-hidden /> Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

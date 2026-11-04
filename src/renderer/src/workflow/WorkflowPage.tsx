import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ArrowClockwise, FloppyDisk, Play, Plus, Stop, Trash, Pause, ArrowRight, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode, WorkflowNodeKind, WorkflowRun } from '@shared/workflow'
import { WorkflowDefinitionSchema } from '@shared/workflow'
import type { WorkflowTriggerConfig } from '@shared/workflowTriggers'

const kinds: WorkflowNodeKind[] = ['input', 'agent', 'tool', 'condition', 'approval', 'delay', 'output', 'subworkflow', 'custom']
const terminal = new Set(['succeeded', 'failed', 'cancelled'])
const cardWidth = 164
const cardHeight = 78

function id(): string { return crypto.randomUUID() }
function fresh(): WorkflowDefinition {
  const now = Date.now()
  const input = id()
  const output = id()
  return { id: id(), name: 'New workflow', version: 1, nodes: [
    { id: input, label: 'Input', kind: 'input', config: {}, position: { x: 48, y: 120 } },
    { id: output, label: 'Output', kind: 'output', config: {}, position: { x: 344, y: 120 } }
  ], edges: [{ id: id(), source: input, target: output }], createdAt: now, updatedAt: now }
}
function makeNode(kind: WorkflowNodeKind, x: number, y: number): WorkflowNode {
  const base = { id: id(), label: kind[0]!.toUpperCase() + kind.slice(1), position: { x, y } }
  switch (kind) {
    case 'input': return { ...base, kind, config: {} }
    case 'agent': return { ...base, kind, config: { goal: 'Describe the task', mode: 'agent' } }
    case 'tool': return { ...base, kind, config: { toolName: 'fs_list', arguments: {} } }
    case 'condition': return { ...base, kind, config: { path: 'input.value', operator: 'exists' } }
    case 'approval': return { ...base, kind, config: { prompt: 'Approve this step?' } }
    case 'delay': return { ...base, kind, config: { durationMs: 1000 } }
    case 'output': return { ...base, kind, config: {} }
    case 'subworkflow': return { ...base, kind, config: { workflowId: '' } }
    case 'custom': return { ...base, kind, config: { type: 'example', input: {} } }
  }
}
function color(status?: string): string {
  if (status === 'succeeded') return 'var(--color-ok)'
  if (status === 'failed' || status === 'cancelled') return 'var(--color-danger)'
  if (status === 'running') return 'var(--color-accent)'
  if (status === 'waiting' || status === 'paused' || status === 'unknown') return 'var(--color-warn)'
  return 'var(--color-border-strong)'
}

export function WorkflowPage(): React.JSX.Element {
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([])
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof window.localpilot.listWorkflowRevisions>>>([])
  const [definition, setDefinition] = useState<WorkflowDefinition>(() => fresh())
  const [selected, setSelected] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectionPreview, setConnectionPreview] = useState<{ source: string; x: number; y: number } | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [inputText, setInputText] = useState('{}')
  const [approvals, setApprovals] = useState<Array<{ nodeId: string; prompt: string; kind: 'approval' | 'question' }>>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<Awaited<ReturnType<typeof window.localpilot.listWorkflowEvents>>>([])
  const [dryRun, setDryRun] = useState<Awaited<ReturnType<typeof window.localpilot.dryRunWorkflow>> | null>(null)
  const [triggers, setTriggers] = useState<WorkflowTriggerConfig[]>([])
  const [triggerKind, setTriggerKind] = useState<WorkflowTriggerConfig['kind']>('schedule')
  const [triggerPath, setTriggerPath] = useState('.')
  const [triggerInterval, setTriggerInterval] = useState(60)
  const [triggerPort, setTriggerPort] = useState(8787)
  const [triggerRecursive, setTriggerRecursive] = useState(false)
  const [filterPath, setFilterPath] = useState('')
  const [filterEquals, setFilterEquals] = useState('true')
  const [triggerToken, setTriggerToken] = useState<string | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const gesture = useRef<
    | { kind: 'move'; pointerId: number; nodeId: string; clientX: number; clientY: number; startX: number; startY: number; moved: boolean }
    | { kind: 'connect'; pointerId: number; nodeId: string; clientX: number; clientY: number; moved: boolean }
    | null
  >(null)
  const selectedNode = definition.nodes.find((node) => node.id === selected)
  const currentRun = runs.find((run) => run.id === runId)

  const refresh = useCallback(async () => {
    const [nextDefinitions, nextRuns] = await Promise.all([
      window.localpilot.listWorkflows(), window.localpilot.listWorkflowRuns()
    ])
    setDefinitions(nextDefinitions)
    setRuns(nextRuns)
  }, [])
  useEffect(() => { void refresh().catch((error: unknown) => setMessage(String(error))) }, [refresh])
  useEffect(() => window.localpilot.onWorkflowEvent((run) => {
    setRuns((old) => [run, ...old.filter((item) => item.id !== run.id)])
  }), [])
  useEffect(() => {
    if (!currentRun || terminal.has(currentRun.status)) return
    const timer = window.setInterval(() => {
      void window.localpilot.getWorkflowRun(currentRun.id).then((run) => {
        if (run) setRuns((old) => [run, ...old.filter((item) => item.id !== run.id)])
      }).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [currentRun?.id, currentRun?.status])
  useEffect(() => {
    if (!currentRun || currentRun.status !== 'waiting') { setApprovals([]); return }
    const load = (): void => { void window.localpilot.listWorkflowApprovals(currentRun.id).then(setApprovals).catch(() => undefined) }
    load()
    const timer = window.setInterval(load, 1000)
    return () => window.clearInterval(timer)
  }, [currentRun?.id, currentRun?.status])
  useEffect(() => {
    if (!currentRun) { setEvents([]); return }
    const load = (): void => { void window.localpilot.listWorkflowEvents(currentRun.id).then(setEvents).catch(() => undefined) }
    load()
    if (terminal.has(currentRun.status) || currentRun.status === 'unknown') return
    const timer = window.setInterval(load, 1500)
    return () => window.clearInterval(timer)
  }, [currentRun?.id, currentRun?.status])
  useEffect(() => {
    setTriggerToken(null)
    void window.localpilot.listWorkflowTriggers(definition.id).then(setTriggers).catch(() => setTriggers([]))
    void window.localpilot.listWorkflowRevisions(definition.id).then(setRevisions).catch(() => setRevisions([]))
  }, [definition.id])
  useEffect(() => { gesture.current = null; setConnectFrom(null); setConnectionPreview(null) }, [definition.id])
  useEffect(() => {
    const cancel = (event: KeyboardEvent): void => { if (event.key === 'Escape') { gesture.current = null; setConnectFrom(null); setConnectionPreview(null) } }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [])

  async function saveTrigger(): Promise<void> {
    if (!definitions.some((item) => item.id === definition.id)) { setMessage('Save the workflow before adding a trigger.'); return }
    try {
      const filter = filterPath.trim() ? { filter: { path: filterPath.trim(), equals: JSON.parse(filterEquals) as unknown } } : {}
      const base = { id: id(), workflowId: definition.id, enabled: true, dedupeMs: 1000, ...filter }
      let trigger: WorkflowTriggerConfig
      if (triggerKind === 'schedule') trigger = { ...base, kind: 'schedule', intervalMs: triggerInterval * 1000 }
      else if (triggerKind === 'filesystem') trigger = { ...base, kind: 'filesystem', path: triggerPath, recursive: triggerRecursive, events: ['rename', 'change'] }
      else if (triggerKind === 'git') trigger = { ...base, kind: 'git', path: triggerPath, intervalMs: triggerInterval * 1000 }
      else trigger = { ...base, kind: 'webhook', path: triggerPath, port: triggerPort }
      const result = await window.localpilot.saveWorkflowTrigger(trigger)
      setTriggers((old) => [...old, result.trigger])
      setTriggerToken(result.token ?? null)
      setMessage(result.token ? 'Webhook created. Copy the token now; it is shown only once.' : 'Trigger saved.')
    } catch (error) { setMessage(String(error)) }
  }
  async function toggleTrigger(trigger: WorkflowTriggerConfig): Promise<void> {
    try {
      const result = await window.localpilot.saveWorkflowTrigger({ ...trigger, enabled: !trigger.enabled })
      setTriggers((old) => old.map((item) => item.id === trigger.id ? result.trigger : item))
    } catch (error) { setMessage(String(error)) }
  }
  async function removeTrigger(trigger: WorkflowTriggerConfig): Promise<void> {
    if (!window.confirm(`Delete ${trigger.kind} trigger?`)) return
    try {
      await window.localpilot.deleteWorkflowTrigger(trigger.id)
      setTriggers((old) => old.filter((item) => item.id !== trigger.id))
      setTriggerToken(null)
    } catch (error) { setMessage(String(error)) }
  }

  function edit(updater: (old: WorkflowDefinition) => WorkflowDefinition): void {
    setDefinition((old) => ({ ...updater(old), updatedAt: Date.now() }))
    setErrors([])
    setDryRun(null)
  }
  function updateNode(next: WorkflowNode): void {
    edit((old) => ({ ...old, nodes: old.nodes.map((node) => node.id === next.id ? next : node) }))
  }
  function addNode(kind: WorkflowNodeKind): void {
    const offset = definition.nodes.length * 28
    const node = makeNode(kind, 100 + offset, 220 + offset)
    edit((old) => ({ ...old, nodes: [...old.nodes, node] }))
    setSelected(node.id)
  }
  function addConnection(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return
    const source = definition.nodes.find((node) => node.id === sourceId)
    const target = definition.nodes.find((node) => node.id === targetId)
    if (!source || !target) return
    if (source.kind === 'output' || target.kind === 'input') { setMessage('Connect from an output port to a node after Input and before Output.'); return }
    edit((old) => {
      if (old.edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return old
      const branch = source.kind === 'condition'
        ? old.edges.some((edge) => edge.source === sourceId && edge.branch === 'true') ? 'false' as const : 'true' as const
        : undefined
      return { ...old, edges: [...old.edges, { id: id(), source: sourceId, target: targetId, ...(branch ? { branch } : {}) }] }
    })
    setConnectFrom(null)
    setConnectionPreview(null)
    setSelected(targetId)
  }
  function canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = canvas.current!.getBoundingClientRect()
    return { x: clientX - bounds.left + canvas.current!.scrollLeft, y: clientY - bounds.top + canvas.current!.scrollTop }
  }
  function nodeAt(clientX: number, clientY: number): string | null {
    const element = document.elementFromPoint(clientX, clientY)
    return element?.closest<HTMLElement>('[data-flow-node-id]')?.dataset.flowNodeId ?? null
  }
  function onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    const card = target.closest<HTMLElement>('[data-flow-node-id]')
    const nodeId = card?.dataset.flowNodeId
    if (!nodeId) { setConnectFrom(null); return }
    if (connectFrom && connectFrom !== nodeId) { addConnection(connectFrom, nodeId); return }
    const node = definition.nodes.find((item) => item.id === nodeId)
    if (!node) return
    const isPort = Boolean(target.closest('[data-flow-port]'))
    if (isPort) {
      gesture.current = { kind: 'connect', pointerId: event.pointerId, nodeId, clientX: event.clientX, clientY: event.clientY, moved: false }
      setConnectFrom(nodeId)
      const point = canvasPoint(event.clientX, event.clientY)
      setConnectionPreview({ source: nodeId, ...point })
    } else {
      gesture.current = { kind: 'move', pointerId: event.pointerId, nodeId, clientX: event.clientX, clientY: event.clientY, startX: node.position.x, startY: node.position.y, moved: false }
      setSelected(nodeId)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function onCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.clientX
    const dy = event.clientY - current.clientY
    if (Math.hypot(dx, dy) > 4) current.moved = true
    if (!current.moved) return
    if (current.kind === 'move') {
      const x = Math.max(0, Math.round(current.startX + dx))
      const y = Math.max(0, Math.round(current.startY + dy))
      setDefinition((old) => ({ ...old, nodes: old.nodes.map((node) => node.id === current.nodeId ? { ...node, position: { x, y } } : node), updatedAt: Date.now() }))
    } else {
      setConnectionPreview({ source: current.nodeId, ...canvasPoint(event.clientX, event.clientY) })
    }
  }
  function onCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.kind === 'connect' && current.moved) {
      const targetId = nodeAt(event.clientX, event.clientY)
      if (targetId && targetId !== current.nodeId) addConnection(current.nodeId, targetId)
      else setConnectFrom(null)
    }
    gesture.current = null
    setConnectionPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function onCanvasPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current = null
    setConnectionPreview(null)
    setConnectFrom(null)
  }
  async function validate(): Promise<boolean> {
    try {
      const result = await window.localpilot.validateWorkflow(definition)
      setErrors(result.errors)
      setMessage(result.ok ? 'Graph is valid.' : 'Fix validation errors before running.')
      return result.ok
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setErrors([detail])
      setMessage('Fix validation errors before running.')
      return false
    }
  }
  async function save(): Promise<void> {
    setBusy(true)
    try {
      if (!await validate()) return
      const saved = await window.localpilot.saveWorkflowDefinition(definition)
      setDefinition(saved)
      await refresh()
      setRevisions(await window.localpilot.listWorkflowRevisions(saved.id))
      setMessage('Workflow saved.')
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }
  async function start(): Promise<void> {
    setBusy(true)
    try {
      if (!await validate()) return
      const input: unknown = JSON.parse(inputText)
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Run input must be a JSON object.')
      await window.localpilot.saveWorkflowDefinition(definition)
      const result = await window.localpilot.startWorkflow({ workflowId: definition.id, input: input as Record<string, unknown> })
      setRunId(result.runId)
      await refresh()
      setMessage('Workflow started.')
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }
  async function preview(): Promise<void> {
    setBusy(true)
    try {
      if (!await validate()) return
      await window.localpilot.saveWorkflowDefinition(definition)
      const ordered = await window.localpilot.dryRunWorkflow(definition.id)
      setDryRun(ordered)
      await refresh()
      setMessage('Dry run complete. No nodes were executed.')
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }
  function exportJson(): void {
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${definition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow'}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  async function importJson(file: File): Promise<void> {
    try {
      if (file.size > 1_000_000) throw new Error('Workflow file must be smaller than 1 MB.')
      const parsed: unknown = JSON.parse(await file.text())
      const original = WorkflowDefinitionSchema.parse(parsed)
      const now = Date.now()
      const imported = { ...original, id: id(), name: `${original.name} (imported)`.slice(0, 120), createdAt: now, updatedAt: now }
      const result = await window.localpilot.validateWorkflow(imported)
      if (!result.ok) throw new Error(result.errors.join('; '))
      const saved = await window.localpilot.saveWorkflowDefinition(imported)
      setDefinition(saved)
      setSelected(null)
      setRunId(null)
      setDryRun(null)
      await refresh()
      setRevisions(await window.localpilot.listWorkflowRevisions(saved.id))
      setMessage('Workflow imported as a new copy.')
    } catch (error) { setMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`) }
    finally { if (importInput.current) importInput.current.value = '' }
  }
  async function restoreRevision(revision: number): Promise<void> {
    if (!window.confirm(`Restore revision ${revision} of “${definition.name}”? Your current graph will be replaced by a new saved revision.`)) return
    try {
      const restored = await window.localpilot.restoreWorkflowRevision(definition.id, revision)
      setDefinition(restored)
      setSelected(null)
      setDryRun(null)
      setErrors([])
      await refresh()
      setRevisions(await window.localpilot.listWorkflowRevisions(restored.id))
      setMessage(`Restored revision ${revision}.`)
    } catch (error) { setMessage(String(error)) }
  }
  async function act(action: 'pause' | 'resume' | 'cancel'): Promise<void> {
    if (!runId) return
    try {
      if (action === 'pause') await window.localpilot.pauseWorkflow(runId)
      if (action === 'resume') await window.localpilot.resumeWorkflow(runId)
      if (action === 'cancel') await window.localpilot.cancelWorkflow(runId)
      const run = await window.localpilot.getWorkflowRun(runId)
      if (run) setRuns((old) => [run, ...old.filter((item) => item.id !== run.id)])
    } catch (error) { setMessage(String(error)) }
  }
  async function answerApproval(nodeId: string, allowed: boolean): Promise<void> {
    if (!runId) return
    try {
      await window.localpilot.respondWorkflowApproval(runId, nodeId, allowed)
      setApprovals((old) => old.filter((item) => item.nodeId !== nodeId))
    } catch (error) { setMessage(String(error)) }
  }
  async function answerQuestion(nodeId: string): Promise<void> {
    if (!runId) return
    const answer = answers[nodeId]?.trim()
    if (!answer) return
    try {
      await window.localpilot.answerWorkflowQuestion(runId, nodeId, answer)
      setApprovals((old) => old.filter((item) => item.nodeId !== nodeId))
      setAnswers((old) => { const next = { ...old }; delete next[nodeId]; return next })
    } catch (error) { setMessage(String(error)) }
  }
  async function replayUnknown(nodeId: string): Promise<void> {
    if (!runId) return
    if (!window.confirm('This node may already have completed its action before the app stopped. Replaying it could repeat that action. Replay anyway?')) return
    try {
      await window.localpilot.replayUnknownWorkflowNode(runId, nodeId, true)
      const run = await window.localpilot.getWorkflowRun(runId)
      if (run) setRuns((old) => [run, ...old.filter((item) => item.id !== run.id)])
      setMessage('Manual replay started.')
    } catch (error) { setMessage(String(error)) }
  }
  const edges = useMemo(() => definition.edges.map((edge) => {
    const source = definition.nodes.find((node) => node.id === edge.source)
    const target = definition.nodes.find((node) => node.id === edge.target)
    return source && target ? { edge, x1: source.position.x + cardWidth, y1: source.position.y + cardHeight / 2, x2: target.position.x, y2: target.position.y + cardHeight / 2 } : null
  }).filter((item) => item !== null), [definition])

  return <main className="flex min-w-0 flex-1 overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-3 flex items-center justify-between"><h1 className="text-sm font-semibold">Workflows</h1><button className="lp-icon-btn" title="New workflow" aria-label="New workflow" onClick={() => { setDefinition(fresh()); setSelected(null); setRunId(null); setErrors([]) }}><Plus size={16} /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {definitions.map((item) => <div key={item.id} className="mb-1 flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
          <button className="min-w-0 flex-1 truncate px-1 text-left text-xs" title={item.name} onClick={() => { setDefinition(item); setSelected(null); setRunId(null); setErrors([]) }}>{item.name}</button>
          <button className="lp-icon-btn !h-6 !w-6" title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`} onClick={() => { if (window.confirm(`Delete workflow “${item.name}”?`)) void window.localpilot.deleteWorkflowDefinition(item.id).then(() => { if (definition.id === item.id) { setDefinition(fresh()); setSelected(null); setRunId(null) } return refresh() }).catch((error: unknown) => setMessage(String(error))) }}><Trash size={12} /></button>
        </div>)}
      </div>
      <div className="border-t border-[var(--color-border)] pt-3"><div className="mb-2 text-xs font-medium">Node palette</div><div className="grid grid-cols-2 gap-1">{kinds.map((kind) => <button key={kind} className="lp-btn !justify-start text-xs capitalize" onClick={() => addNode(kind)}><Plus size={11} /> {kind}</button>)}</div></div>
      <details className="mt-3 max-h-[42%] overflow-y-auto border-t border-[var(--color-border)] pt-3 text-xs"><summary className="font-medium">Automation triggers ({triggers.length})</summary>
        <div className="mt-2 space-y-2">{triggers.map((trigger) => <div key={trigger.id} className="flex items-center gap-1 rounded border border-[var(--color-border)] p-1"><input type="checkbox" checked={trigger.enabled} aria-label={`Enable ${trigger.kind} trigger`} onChange={() => void toggleTrigger(trigger)} /><span className="min-w-0 flex-1 truncate" title={JSON.stringify(trigger)}>{trigger.kind}{trigger.kind === 'schedule' || trigger.kind === 'git' ? ` · ${Math.round(trigger.intervalMs / 1000)}s` : ` · ${trigger.path}`}</span><button className="lp-icon-btn !h-5 !w-5" aria-label={`Delete ${trigger.kind} trigger`} onClick={() => void removeTrigger(trigger)}><Trash size={11} /></button></div>)}
          <label className="block">Type<select className="lp-select mt-1 w-full" value={triggerKind} onChange={(event) => { const kind = event.target.value as WorkflowTriggerConfig['kind']; setTriggerKind(kind); setTriggerPath(kind === 'webhook' ? '/localpilot' : '.') }}><option value="schedule">Schedule</option><option value="filesystem">Filesystem</option><option value="git">Git commits</option><option value="webhook">Local webhook</option></select></label>
          {(triggerKind === 'filesystem' || triggerKind === 'git' || triggerKind === 'webhook') && <label className="block">{triggerKind === 'webhook' ? 'HTTP path' : 'Workspace relative path'}<input className="lp-input mt-1 w-full" value={triggerPath} onChange={(event) => setTriggerPath(event.target.value)} /></label>}
          {(triggerKind === 'schedule' || triggerKind === 'git') && <label className="block">Interval (seconds)<input className="lp-input mt-1 w-full" type="number" min={1} value={triggerInterval} onChange={(event) => setTriggerInterval(Number(event.target.value))} /></label>}
          {triggerKind === 'filesystem' && <label className="flex items-center gap-2"><input type="checkbox" checked={triggerRecursive} onChange={(event) => setTriggerRecursive(event.target.checked)} /> Include subfolders</label>}
          {triggerKind === 'webhook' && <label className="block">Local port<input className="lp-input mt-1 w-full" type="number" min={1024} max={65535} value={triggerPort} onChange={(event) => setTriggerPort(Number(event.target.value))} /></label>}
          <label className="block">Payload path filter (optional)<input className="lp-input mt-1 w-full" placeholder="e.g. event.type" value={filterPath} onChange={(event) => setFilterPath(event.target.value)} /></label>
          {filterPath.trim() && <label className="block">Equals (JSON)<input className="lp-input mt-1 w-full font-[var(--font-mono)]" placeholder='"changed"' value={filterEquals} onChange={(event) => setFilterEquals(event.target.value)} /></label>}
          <button className="lp-btn w-full justify-center" onClick={() => void saveTrigger()}><Plus size={12} /> Add trigger</button>
          {triggerToken && <div className="rounded border border-[var(--color-warn)] p-2"><p className="mb-1">Copy this webhook bearer token now. It will not be shown again.</p><code className="block break-all select-all text-[var(--color-warn)]">{triggerToken}</code><button className="mt-1 underline" onClick={() => setTriggerToken(null)}>Dismiss</button></div>}
        </div>
      </details>
      <details className="mt-3 max-h-36 overflow-y-auto border-t border-[var(--color-border)] pt-3 text-xs"><summary className="font-medium">Revisions ({revisions.length})</summary><div className="mt-2 space-y-1">{revisions.map((item) => <div key={item.revision} className="flex items-center gap-1 rounded border border-[var(--color-border)] p-1"><span className="min-w-0 flex-1 truncate">#{item.revision} · {item.definition.nodes.length} nodes</span><button className="underline text-[var(--color-accent)]" onClick={() => void restoreRevision(item.revision)}>Restore</button></div>)}</div></details>
    </aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
        <input className="lp-input max-w-60" aria-label="Workflow name" value={definition.name} maxLength={120} onChange={(event) => edit((old) => ({ ...old, name: event.target.value }))} />
        <button className="lp-btn" disabled={busy} onClick={() => void validate()}>Validate</button>
        <button className="lp-btn" disabled={busy} onClick={() => void save()}><FloppyDisk size={14} /> Save</button>
        <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" aria-label="Import workflow JSON" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJson(file) }} />
        <button className="lp-btn" disabled={busy} onClick={() => importInput.current?.click()}><UploadSimple size={14} /> Import</button>
        <button className="lp-btn" onClick={exportJson}><DownloadSimple size={14} /> Export</button>
        <button className="lp-btn" disabled={busy} onClick={() => void preview()}>Dry run</button>
        <button className="lp-btn lp-btn-accent" disabled={busy} onClick={() => void start()}><Play size={14} /> Run</button>
        <button className="lp-icon-btn" title="Refresh" aria-label="Refresh workflows" onClick={() => void refresh()}><ArrowClockwise size={14} /></button>
        {connectFrom && <span className="text-xs text-[var(--color-accent)]">Click a target node to connect · <button className="underline" onClick={() => setConnectFrom(null)}>Cancel</button></span>}
      </header>
      {message && <div role="status" className="border-b border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]">{message}</div>}
      {errors.length > 0 && <ul className="max-h-28 overflow-y-auto border-b border-[var(--color-danger)]/50 px-5 py-2 text-xs text-[var(--color-danger)]">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
      {dryRun && <div className="max-h-32 overflow-y-auto border-b border-[var(--color-border)] p-2 text-xs"><strong>Planned order</strong><ol className="mt-1 list-inside list-decimal text-[var(--color-text-muted)]">{dryRun.map((step) => <li key={step.nodeId}>{step.label} <span className="font-[var(--font-mono)]">({step.kind}{step.risk ? ` · ${step.risk}` : ''})</span></li>)}</ol></div>}
      <div ref={canvas} className="relative min-h-0 flex-1 overflow-auto" onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerCancel} style={{ backgroundImage: 'radial-gradient(var(--color-border) 1px, transparent 1px)', backgroundSize: '20px 20px', touchAction: 'none' }}>
        <div className="relative" style={{ width: Math.max(900, ...definition.nodes.map((node) => node.position.x + 240)), height: Math.max(600, ...definition.nodes.map((node) => node.position.y + 150)) }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><defs><marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="var(--color-text-muted)" /></marker></defs>{edges.map((item) => <path key={item.edge.id} d={`M ${item.x1} ${item.y1} C ${item.x1 + 72} ${item.y1}, ${item.x2 - 72} ${item.y2}, ${item.x2} ${item.y2}`} fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" markerEnd="url(#workflow-arrow)" />)}{connectionPreview && (() => { const source = definition.nodes.find((node) => node.id === connectionPreview.source); return source ? <path d={`M ${source.position.x + cardWidth} ${source.position.y + cardHeight / 2} L ${connectionPreview.x} ${connectionPreview.y}`} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="5 4" /> : null })()}</svg>
          {definition.nodes.map((node) => <div key={node.id} data-flow-node-id={node.id} className="absolute rounded-lg border bg-[var(--color-surface)] shadow-lg" style={{ left: node.position.x, top: node.position.y, width: cardWidth, height: cardHeight, borderColor: connectFrom === node.id || selected === node.id ? 'var(--color-accent)' : color(currentRun?.nodeRuns[node.id]?.status) }}>
            <button className="flex h-12 w-full cursor-grab flex-col items-start overflow-hidden px-3 py-1 text-left active:cursor-grabbing" onClick={(event) => { if (event.detail === 0) { if (connectFrom && connectFrom !== node.id) addConnection(connectFrom, node.id); else setSelected(node.id) } }}><span className="truncate text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{node.kind}</span><span className="w-full truncate text-xs font-medium">{node.label}</span></button>
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-2 py-0.5"><span className="truncate text-[10px] text-[var(--color-text-muted)]">{currentRun?.nodeRuns[node.id]?.status ?? 'idle'}</span><button data-flow-port className="inline-flex items-center gap-1 rounded px-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]" onClick={(event) => { if (event.detail === 0) setConnectFrom(node.id) }} aria-label={`Connect from ${node.label}`} title="Click, then click a target node; or drag to a target node"><span>Connect</span><ArrowRight size={13} /></button></div>
          </div>)}
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto border-t border-[var(--color-border)] p-3">
        <div className="mb-2 flex items-center gap-2"><strong className="text-xs">Runs</strong><input className="lp-input !w-56 !py-1 font-[var(--font-mono)] text-xs" aria-label="Run input JSON" value={inputText} onChange={(event) => setInputText(event.target.value)} title="JSON object passed to input node" />
          {currentRun && !terminal.has(currentRun.status) && currentRun.status !== 'unknown' && <><button className="lp-btn !py-1 text-xs" onClick={() => void act(currentRun.status === 'paused' ? 'resume' : 'pause')}>{currentRun.status === 'paused' ? <Play size={12} /> : <Pause size={12} />}{currentRun.status === 'paused' ? 'Resume' : 'Pause'}</button><button className="lp-btn !py-1 text-xs" onClick={() => void act('cancel')}><Stop size={12} /> Cancel</button></>}
        </div>
        <div className="flex gap-2 overflow-x-auto">{runs.filter((run) => run.workflowId === definition.id).map((run) => <button key={run.id} className="shrink-0 rounded border px-2 py-1 text-xs" style={{ borderColor: color(run.status) }} onClick={() => setRunId(run.id)} aria-pressed={run.id === runId}>{new Date(run.createdAt).toLocaleString()} · {run.status}</button>)}</div>
        {currentRun && (currentRun.status === 'unknown' || currentRun.status === 'paused') && Object.values(currentRun.nodeRuns).filter((node) => node.status === 'unknown').map((node) => <div key={node.nodeId} className="mt-2 flex items-center gap-2 rounded border border-[var(--color-warn)]/50 p-2 text-xs"><span className="min-w-0 flex-1">Outcome unknown for {definition.nodes.find((item) => item.id === node.nodeId)?.label ?? node.nodeId}. This action may already have occurred.</span><button className="lp-btn !py-1" onClick={() => void replayUnknown(node.nodeId)}>Review and replay</button></div>)}
        {approvals.map((approval) => <div key={approval.nodeId} className="mt-2 flex items-start gap-2 rounded border border-[var(--color-warn)]/50 p-2 text-xs"><p className="min-w-0 flex-1 whitespace-pre-wrap">{approval.prompt}</p>{approval.kind === 'question' ? <div className="flex gap-1"><input className="lp-input !py-1" aria-label="Answer agent question" value={answers[approval.nodeId] ?? ''} onChange={(event) => setAnswers((old) => ({ ...old, [approval.nodeId]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') void answerQuestion(approval.nodeId) }} /><button className="lp-btn lp-btn-accent !py-1" disabled={!answers[approval.nodeId]?.trim()} onClick={() => void answerQuestion(approval.nodeId)}>Submit</button></div> : <><button className="lp-btn !py-1" onClick={() => void answerApproval(approval.nodeId, false)}>Deny</button><button className="lp-btn lp-btn-accent !py-1" onClick={() => void answerApproval(approval.nodeId, true)}>Approve</button></>}</div>)}
        {currentRun && <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><strong>Status:</strong> {currentRun.status}{currentRun.error && <p className="text-[var(--color-danger)]">{currentRun.error}</p>}</div><div><strong>Output:</strong><pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[var(--color-text-muted)]">{JSON.stringify(currentRun.output ?? {}, null, 2)}</pre></div></div>}
        {currentRun && <details className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs"><summary className="font-medium">Execution events ({events.length})</summary><div className="mt-2 max-h-44 overflow-auto font-[var(--font-mono)]">{events.map((event) => <div key={event.id} className="border-b border-[var(--color-border)] py-1"><span className="text-[var(--color-text-muted)]">{new Date(event.createdAt).toLocaleTimeString()}</span> · {event.type}<pre className="whitespace-pre-wrap break-all text-[var(--color-text-muted)]">{JSON.stringify(event.payload, null, 2)}</pre></div>)}</div></details>}
      </div>
    </section>
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <h2 className="mb-3 text-sm font-semibold">Inspector</h2>
      {selectedNode ? <NodeInspector node={selectedNode} edges={definition.edges} nodeRun={currentRun?.nodeRuns[selectedNode.id]} onChange={updateNode} onDelete={() => { edit((old) => ({ ...old, nodes: old.nodes.filter((node) => node.id !== selectedNode.id), edges: old.edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id) })); setSelected(null) }} onRemoveEdge={(edgeId) => edit((old) => ({ ...old, edges: old.edges.filter((edge) => edge.id !== edgeId) }))} onBranch={(edgeId, branch) => edit((old) => ({ ...old, edges: old.edges.map((edge) => edge.id === edgeId ? { ...edge, branch } : edge) }))} /> : <p className="text-xs text-[var(--color-text-muted)]">Select a node to edit its configuration and inspect its latest input and output.</p>}
    </aside>
  </main>
}

function NodeInspector({ node, edges, nodeRun, onChange, onDelete, onRemoveEdge, onBranch }: {
  node: WorkflowNode; edges: WorkflowEdge[]; nodeRun?: WorkflowRun['nodeRuns'][string]; onChange: (node: WorkflowNode) => void; onDelete: () => void; onRemoveEdge: (edgeId: string) => void; onBranch: (edgeId: string, branch: 'true' | 'false' | undefined) => void
}): React.JSX.Element {
  const [json, setJson] = useState('{}')
  const [jsonError, setJsonError] = useState('')
  useEffect(() => {
    if (node.kind === 'tool') setJson(JSON.stringify(node.config.arguments, null, 2))
    if (node.kind === 'custom') setJson(JSON.stringify(node.config.input, null, 2))
  }, [node.id, node.kind])
  const field = (label: string, value: string, update: (value: string) => void, multiline = false): React.JSX.Element => <label className="mb-3 block text-xs text-[var(--color-text-muted)]">{label}{multiline ? <textarea className="lp-input mt-1 w-full resize-y" rows={4} value={value} onChange={(event) => update(event.target.value)} /> : <input className="lp-input mt-1 w-full" value={value} onChange={(event) => update(event.target.value)} />}</label>
  function config(values: Record<string, unknown>): void { onChange({ ...node, config: { ...node.config, ...values } } as WorkflowNode) }
  const outgoing = edges.filter((edge) => edge.source === node.id)
  return <>
    {field('Label', node.label, (label) => onChange({ ...node, label }))}
    {node.kind === 'agent' && <>{field('Goal', node.config.goal, (goal) => config({ goal }), true)}{field('Provider ID (optional; overrides route)', node.config.providerId ?? '', (providerId) => config({ providerId: providerId || undefined }))}<label className="mb-3 block text-xs">Model route<select className="lp-select mt-1 w-full" value={node.config.route ?? ''} onChange={(event) => config({ route: event.target.value || undefined })}><option value="">Default (strong)</option><option value="fast">Fast</option><option value="strong">Strong</option><option value="vision">Vision</option></select></label><label className="mb-3 block text-xs">Mode<select className="lp-select mt-1 w-full" value={node.config.mode} onChange={(event) => config({ mode: event.target.value })}><option value="agent">Agent</option><option value="plan">Plan</option></select></label></>}
    {node.kind === 'tool' && <>{field('Tool name', node.config.toolName, (toolName) => config({ toolName }))}{field('Arguments JSON', json, (value) => { setJson(value); try { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be an object'); config({ arguments: parsed }); setJsonError('') } catch (error) { setJsonError(String(error)) } }, true)}{jsonError && <p className="text-xs text-[var(--color-danger)]">{jsonError}</p>}</>}
    {node.kind === 'condition' && <>{field('Input path', node.config.path, (path) => config({ path }))}<label className="mb-3 block text-xs">Operator<select className="lp-select mt-1 w-full" value={node.config.operator} onChange={(event) => config({ operator: event.target.value })}><option value="exists">Exists</option><option value="equals">Equals</option><option value="not_equals">Not equals</option><option value="contains">Contains</option></select></label>{field('Comparison value', String(node.config.value ?? ''), (value) => config({ value }))}</>}
    {node.kind === 'approval' && field('Approval prompt', node.config.prompt, (prompt) => config({ prompt }), true)}
    {node.kind === 'delay' && field('Duration (ms)', String(node.config.durationMs), (value) => config({ durationMs: Number(value) }))}
    {node.kind === 'subworkflow' && field('Workflow ID', node.config.workflowId, (workflowId) => config({ workflowId }))}
    {node.kind === 'custom' && <>{field('Registered custom node type', node.config.type, (type) => config({ type }))}{field('Input JSON', json, (value) => { setJson(value); try { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be an object'); config({ input: parsed }); setJsonError('') } catch (error) { setJsonError(String(error)) } }, true)}{jsonError && <p className="text-xs text-[var(--color-danger)]">{jsonError}</p>}</>}
    <div className="mb-3 border-t border-[var(--color-border)] pt-3"><div className="mb-1 text-xs font-medium">Outgoing edges</div>{outgoing.map((edge) => <div key={edge.id} className="mb-1 flex items-center gap-1 text-xs"><span className="min-w-0 flex-1 truncate">→ {edge.target.slice(0, 8)}</span>{node.kind === 'condition' && <select className="lp-select !w-16 !py-0" aria-label="Condition branch" value={edge.branch ?? 'true'} onChange={(event) => onBranch(edge.id, event.target.value as 'true' | 'false')}><option value="true">True</option><option value="false">False</option></select>}<button className="lp-icon-btn !h-5 !w-5" aria-label="Remove edge" onClick={() => onRemoveEdge(edge.id)}><Trash size={11} /></button></div>)}</div>
    {nodeRun && <div className="mb-3 border-t border-[var(--color-border)] pt-3 text-xs"><p>Status: {nodeRun.status} · attempt {nodeRun.attempt}</p>{nodeRun.error && <p className="text-[var(--color-danger)]">{nodeRun.error}</p>}<p className="mt-2">Input</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[var(--color-text-muted)]">{JSON.stringify(nodeRun.input ?? {}, null, 2)}</pre><p className="mt-2">Output</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[var(--color-text-muted)]">{JSON.stringify(nodeRun.output ?? {}, null, 2)}</pre></div>}
    <button className="lp-btn lp-btn-danger text-xs" onClick={onDelete}><Trash size={12} /> Delete node</button>
  </>
}

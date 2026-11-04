import { randomUUID } from 'node:crypto'
import {
  WorkflowDefinitionSchema,
  WorkflowRunSchema,
  type WorkflowDefinition,
  type WorkflowRun
} from '@shared/workflow'
import { getMemoryDb } from '../agent/memory'

type DatabaseSync = import('node:sqlite').DatabaseSync

export interface WorkflowEventRecord {
  id: number
  runId: string
  type: string
  payload: unknown
  createdAt: number
}

export interface WorkflowDefinitionRevision {
  workflowId: string
  revision: number
  definition: WorkflowDefinition
  savedAt: number
}

let initialized = false

function database(): DatabaseSync {
  const db = getMemoryDb()
  if (!initialized) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (id, version)
      );
      CREATE TABLE IF NOT EXISTS workflow_definition_revisions (
        workflow_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        payload TEXT NOT NULL,
        saved_at INTEGER NOT NULL,
        PRIMARY KEY (workflow_id, revision)
      );
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        workflow_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        definition_payload TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS workflow_runs_updated_idx ON workflow_runs(updated_at DESC);
      CREATE TABLE IF NOT EXISTS workflow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
      );
      CREATE INDEX IF NOT EXISTS workflow_events_run_idx ON workflow_events(run_id, id);
    `)
    initialized = true
  }
  return db
}

function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = action()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function saveWorkflowDefinition(raw: WorkflowDefinition): WorkflowDefinition {
  const definition = WorkflowDefinitionSchema.parse(raw)
  const db = database()
  transaction(db, () => {
    const prior = db.prepare(`
      SELECT payload FROM workflow_definitions WHERE id = ? AND version = ?
    `).get(definition.id, definition.version) as { payload: string } | undefined
    const payload = JSON.stringify(definition)
    if (prior?.payload === payload) return
    const latest = db.prepare(`
      SELECT COALESCE(MAX(revision), 0) AS revision
      FROM workflow_definition_revisions WHERE workflow_id = ?
    `).get(definition.id) as { revision: number }
    db.prepare(`
      INSERT INTO workflow_definition_revisions (workflow_id, revision, payload, saved_at)
      VALUES (?, ?, ?, ?)
    `).run(definition.id, latest.revision + 1, payload, Date.now())
    db.prepare(`
      INSERT INTO workflow_definitions (id, version, name, payload, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id, version) DO UPDATE SET
        name = excluded.name, payload = excluded.payload, updated_at = excluded.updated_at
    `).run(definition.id, definition.version, definition.name, payload, definition.updatedAt)
  })
  return definition
}

export function listDefinitionRevisions(workflowId: string): WorkflowDefinitionRevision[] {
  const rows = database().prepare(`
    SELECT workflow_id AS workflowId, revision, payload, saved_at AS savedAt
    FROM workflow_definition_revisions WHERE workflow_id = ? ORDER BY revision DESC
  `).all(workflowId) as unknown as Array<Omit<WorkflowDefinitionRevision, 'definition'> & { payload: string }>
  return rows.map(({ payload, ...row }) => ({ ...row, definition: WorkflowDefinitionSchema.parse(JSON.parse(payload)) }))
}

export function getDefinitionRevision(workflowId: string, revision: number): WorkflowDefinitionRevision | null {
  const row = database().prepare(`
    SELECT workflow_id AS workflowId, revision, payload, saved_at AS savedAt
    FROM workflow_definition_revisions WHERE workflow_id = ? AND revision = ?
  `).get(workflowId, revision) as
    | (Omit<WorkflowDefinitionRevision, 'definition'> & { payload: string })
    | undefined
  if (!row) return null
  const { payload, ...meta } = row
  return { ...meta, definition: WorkflowDefinitionSchema.parse(JSON.parse(payload)) }
}

export function getWorkflowDefinition(id: string, version?: number): WorkflowDefinition | null {
  const db = database()
  const row = (version === undefined
    ? db.prepare('SELECT payload FROM workflow_definitions WHERE id = ? ORDER BY version DESC LIMIT 1').get(id)
    : db.prepare('SELECT payload FROM workflow_definitions WHERE id = ? AND version = ?').get(id, version)) as { payload: string } | undefined
  return row ? WorkflowDefinitionSchema.parse(JSON.parse(row.payload)) : null
}

export function listWorkflowDefinitions(): WorkflowDefinition[] {
  const rows = database().prepare(`
    SELECT d.payload FROM workflow_definitions d
    WHERE d.version = (SELECT MAX(v.version) FROM workflow_definitions v WHERE v.id = d.id)
    ORDER BY d.updated_at DESC
  `).all() as unknown as Array<{ payload: string }>
  return rows.map((row) => WorkflowDefinitionSchema.parse(JSON.parse(row.payload)))
}

export function deleteWorkflowDefinition(id: string): boolean {
  // Keep immutable revisions for run review and explicit restoration.
  return Number(database().prepare('DELETE FROM workflow_definitions WHERE id = ?').run(id).changes) > 0
}

export function createWorkflowRun(raw: WorkflowRun, rawDefinition: WorkflowDefinition): WorkflowRun {
  const run = WorkflowRunSchema.parse(raw)
  const definition = WorkflowDefinitionSchema.parse(rawDefinition)
  if (run.workflowId !== definition.id || run.workflowVersion !== definition.version) {
    throw new Error('Workflow run and definition do not match')
  }
  database().prepare(`
    INSERT INTO workflow_runs
      (id, workflow_id, workflow_version, status, definition_payload, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, run.workflowId, run.workflowVersion, run.status,
    JSON.stringify(definition), JSON.stringify(run), run.updatedAt)
  return run
}

export function getWorkflowRun(id: string): WorkflowRun | null {
  const row = database().prepare('SELECT payload FROM workflow_runs WHERE id = ?').get(id) as
    | { payload: string }
    | undefined
  return row ? WorkflowRunSchema.parse(JSON.parse(row.payload)) : null
}

export function getRunDefinition(runId: string): WorkflowDefinition | null {
  const row = database().prepare('SELECT definition_payload FROM workflow_runs WHERE id = ?').get(runId) as
    | { definition_payload: string }
    | undefined
  return row ? WorkflowDefinitionSchema.parse(JSON.parse(row.definition_payload)) : null
}

export function listWorkflowRuns(limit = 50): WorkflowRun[] {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)))
  const rows = database().prepare('SELECT payload FROM workflow_runs ORDER BY updated_at DESC LIMIT ?').all(safeLimit) as unknown as Array<{ payload: string }>
  return rows.map((row) => WorkflowRunSchema.parse(JSON.parse(row.payload)))
}

/** Atomically persist a complete run checkpoint and its event before notifying the UI. */
export function checkpointWorkflowRun(raw: WorkflowRun, eventType: string, eventPayload: unknown = {}): WorkflowEventRecord {
  const run = WorkflowRunSchema.parse(raw)
  if (!eventType || eventType.length > 80) throw new Error('Invalid workflow event type')
  const payload = JSON.stringify(eventPayload)
  if (payload === undefined || payload.length > 1_000_000) throw new Error('Invalid workflow event payload')
  const db = database()
  return transaction(db, () => {
    const updated = db.prepare(`
      UPDATE workflow_runs SET status = ?, payload = ?, updated_at = ? WHERE id = ?
    `).run(run.status, JSON.stringify(run), run.updatedAt, run.id)
    if (Number(updated.changes) !== 1) throw new Error(`Workflow run not found: ${run.id}`)
    const createdAt = Date.now()
    const result = db.prepare(`
      INSERT INTO workflow_events (run_id, type, payload, created_at) VALUES (?, ?, ?, ?)
    `).run(run.id, eventType, payload, createdAt)
    return { id: Number(result.lastInsertRowid), runId: run.id, type: eventType, payload: eventPayload, createdAt }
  })
}

export function listWorkflowEvents(runId: string, afterId = 0, limit = 500): WorkflowEventRecord[] {
  const safeLimit = Math.min(1000, Math.max(1, Math.trunc(limit)))
  const rows = database().prepare(`
    SELECT id, run_id AS runId, type, payload, created_at AS createdAt
    FROM workflow_events WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?
  `).all(runId, Math.max(0, Math.trunc(afterId)), safeLimit) as unknown as Array<Omit<WorkflowEventRecord, 'payload'> & { payload: string }>
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as unknown }))
}

/** Interrupted side effects have unknown outcomes and require an explicit replay decision. */
export function recoverInterruptedWorkflowRuns(): WorkflowRun[] {
  const rows = database().prepare(`
    SELECT payload, definition_payload FROM workflow_runs WHERE status IN ('pending', 'running', 'waiting')
  `).all() as unknown as Array<{ payload: string; definition_payload: string }>
  return rows.map((row) => {
    const run = WorkflowRunSchema.parse(JSON.parse(row.payload))
    const definition = WorkflowDefinitionSchema.parse(JSON.parse(row.definition_payload))
    const kinds = new Map(definition.nodes.map((node) => [node.id, node.kind]))
    const nodeRuns = Object.fromEntries(Object.entries(run.nodeRuns).map(([nodeId, node]) => [
      nodeId, node.status === 'running' ? { ...node, status: 'unknown' as const } :
        node.status === 'waiting' ? { ...node, status: kinds.get(nodeId) === 'agent' ? 'unknown' as const : 'pending' as const } : node
    ]))
    const recovered = WorkflowRunSchema.parse({
      ...run,
      status: 'paused',
      nodeRuns,
      updatedAt: Date.now(),
      error: 'Execution was interrupted. Review unknown node outcomes before replay.'
    })
    checkpointWorkflowRun(recovered, 'run_recovered', { recoveryId: randomUUID() })
    return recovered
  })
}

/** Short names used by the workflow service; all mutations remain main-process only. */
export const saveDefinition = saveWorkflowDefinition
export const listDefinitions = listWorkflowDefinitions
export const getDefinition = getWorkflowDefinition
export const deleteDefinition = deleteWorkflowDefinition
export const createRun = createWorkflowRun
export const getRun = getWorkflowRun
export const listRuns = listWorkflowRuns
export function updateRun(run: WorkflowRun): WorkflowRun {
  checkpointWorkflowRun(run, 'run_checkpoint', { status: run.status })
  return run
}

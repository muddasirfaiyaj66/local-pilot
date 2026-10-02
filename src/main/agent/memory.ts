import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { app } from 'electron'

type DatabaseSync = import('node:sqlite').DatabaseSync
type SqliteModule = typeof import('node:sqlite')

export interface MemoryNote {
  id: number
  kind: string
  content: string
  createdAt: number
}

let db: DatabaseSync | null = null

function dbPath(): string {
  // Vitest workers share os.tmpdir(); a single file DB races under Linux locking.
  // In-memory keeps unit tests isolated and avoids native path/lock flakiness on CI.
  if (process.env.VITEST) {
    return ':memory:'
  }
  try {
    const dir = join(app.getPath('userData'), 'memory')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'localpilot.sqlite')
  } catch {
    const dir = join(process.cwd(), '.localpilot-memory')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'localpilot.sqlite')
  }
}

function loadSqliteModule(): SqliteModule {
  const builtin =
    typeof process.getBuiltinModule === 'function'
      ? (process.getBuiltinModule('node:sqlite') as SqliteModule | undefined)
      : undefined
  if (builtin?.DatabaseSync) return builtin

  const require = createRequire(import.meta.url)
  return require('node:sqlite') as SqliteModule
}

function loadDatabaseSync(): SqliteModule['DatabaseSync'] {
  try {
    return loadSqliteModule().DatabaseSync
  } catch (err) {
    throw new Error(
      `SQLite memory requires Node.js 22.13+ (node:sqlite). ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

export function getMemoryDb(): DatabaseSync {
  if (db) return db
  const DatabaseSync = loadDatabaseSync()
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ui_sessions (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  return db
}

export interface PersistedSessions {
  tasks: Array<{ id: string; title: string; updatedAt: number }>
  activeTaskId: string | null
  sessions: Record<string, unknown>
}

export function saveSessions(state: PersistedSessions): void {
  const database = getMemoryDb()
  database
    .prepare(
      `INSERT INTO ui_sessions (id, payload, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(state), Date.now())
}

export function loadSessions(): PersistedSessions | null {
  const database = getMemoryDb()
  const row = database.prepare('SELECT payload FROM ui_sessions WHERE id = 1').get() as
    | { payload: string }
    | undefined
  if (!row?.payload) return null
  try {
    const parsed: unknown = JSON.parse(row.payload)
    if (!parsed || typeof parsed !== 'object') return null
    const state = parsed as Partial<PersistedSessions>
    if (!Array.isArray(state.tasks) || !state.sessions || typeof state.sessions !== 'object') {
      return null
    }
    return {
      tasks: state.tasks,
      activeTaskId: state.activeTaskId ?? null,
      sessions: state.sessions
    }
  } catch {
    return null
  }
}

export function addNote(kind: string, content: string): MemoryNote {
  const database = getMemoryDb()
  const createdAt = Date.now()
  database
    .prepare('INSERT INTO notes (kind, content, created_at) VALUES (?, ?, ?)')
    .run(kind, content, createdAt)
  const row = database.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }
  return { id: row.id, kind, content, createdAt }
}

export function searchNotes(query: string, limit = 20): MemoryNote[] {
  const database = getMemoryDb()
  const rows = database
    .prepare(
      `SELECT id, kind, content, created_at AS createdAt FROM notes
       WHERE content LIKE ? OR kind LIKE ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(`%${query}%`, `%${query}%`, limit) as unknown as Array<{
    id: number
    kind: string
    content: string
    createdAt: number
  }>
  return rows
}

export function deleteNote(id: number): boolean {
  const result = getMemoryDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

export function listRecentNotes(limit = 20): MemoryNote[] {
  const database = getMemoryDb()
  return database
    .prepare(
      `SELECT id, kind, content, created_at AS createdAt FROM notes ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as unknown as MemoryNote[]
}

export function recordTask(goal: string, summary: string, status: string): void {
  getMemoryDb()
    .prepare(
      'INSERT INTO task_history (goal, summary, status, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(goal, summary, status, Date.now())
}

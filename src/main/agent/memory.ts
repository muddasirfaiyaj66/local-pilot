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
  `)
  return db
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

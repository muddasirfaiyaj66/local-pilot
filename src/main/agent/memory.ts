import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { app } from 'electron'

type DatabaseSync = import('node:sqlite').DatabaseSync

export interface MemoryNote {
  id: number
  kind: string
  content: string
  createdAt: number
}

let db: DatabaseSync | null = null

function dbPath(): string {
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

function loadDatabaseSync(): typeof import('node:sqlite').DatabaseSync {
  try {
    const require = createRequire(import.meta.url)
    const mod = require('node:sqlite') as typeof import('node:sqlite')
    return mod.DatabaseSync
  } catch (err) {
    throw new Error(
      `SQLite memory requires Node.js 22+ (node:sqlite). ${err instanceof Error ? err.message : String(err)}`
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

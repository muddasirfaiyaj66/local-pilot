import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'

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

export function getMemoryDb(): DatabaseSync {
  if (db) return db
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
    .all(`%${query}%`, `%${query}%`, limit) as Array<{
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

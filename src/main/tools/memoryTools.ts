import { z } from 'zod'
import { addNote, listRecentNotes, searchNotes } from '../agent/memory'
import { errResult, okResult, type RegisteredTool } from './types'

export const memoryTools: RegisteredTool[] = [
  {
    name: 'memory_add',
    description: 'Store a note in LocalPilot SQLite memory for later recall.',
    risk: 'safe',
    timeoutMs: 5_000,
    parameters: z.object({
      kind: z.string().default('note'),
      content: z.string().min(1)
    }),
    jsonSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['content']
    },
    preview: (a) => `Remember (${String(a.kind ?? 'note')}): ${String(a.content ?? '').slice(0, 200)}`,
    execute: async (raw) => {
      try {
        const args = z
          .object({ kind: z.string().default('note'), content: z.string().min(1) })
          .parse(raw)
        const note = addNote(args.kind, args.content)
        return okResult(`Saved note #${note.id}`)
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'memory_search',
    description: 'Search SQLite memory notes by substring.',
    risk: 'safe',
    timeoutMs: 5_000,
    parameters: z.object({ query: z.string().min(1), limit: z.number().optional() }),
    jsonSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query']
    },
    preview: (a) => `Memory search: ${String(a.query ?? '')}`,
    execute: async (raw) => {
      try {
        const args = z
          .object({ query: z.string().min(1), limit: z.number().optional() })
          .parse(raw)
        const notes = searchNotes(args.query, args.limit ?? 20)
        return okResult(
          notes.map((n) => `#${n.id} [${n.kind}] ${n.content}`).join('\n') || 'No matches'
        )
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'memory_list',
    description: 'List recent memory notes.',
    risk: 'safe',
    timeoutMs: 5_000,
    parameters: z.object({ limit: z.number().optional() }),
    jsonSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } }
    },
    preview: () => 'List memory',
    execute: async (raw) => {
      try {
        const limit = z.object({ limit: z.number().optional() }).parse(raw).limit ?? 20
        const notes = listRecentNotes(limit)
        return okResult(
          notes.map((n) => `#${n.id} [${n.kind}] ${n.content}`).join('\n') || '(empty)'
        )
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  }
]

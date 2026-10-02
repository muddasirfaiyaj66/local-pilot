import { describe, expect, it } from 'vitest'
import { loadSessions, saveSessions } from './memory'

describe('session persistence', () => {
  it('round-trips chats and pending reviews', () => {
    const payload = {
      tasks: [{ id: 't1', title: 'Fix button', updatedAt: 10 }],
      activeTaskId: 't1',
      sessions: {
        t1: {
          messages: [{ id: 'm1', role: 'user', content: 'make it blue', createdAt: 10 }],
          pendingChanges: [{ id: 'c1', path: 'a.txt', before: '', after: 'blue', created: true }]
        }
      }
    }
    saveSessions(payload)
    const loaded = loadSessions()
    expect(loaded?.activeTaskId).toBe('t1')
    expect(loaded?.tasks[0]?.title).toBe('Fix button')
    expect(loaded?.sessions.t1).toMatchObject({
      messages: [{ content: 'make it blue' }],
      pendingChanges: [{ created: true }]
    })
  })
})

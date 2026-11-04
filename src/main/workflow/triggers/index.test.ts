import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowTriggerManager, TriggerSchema, type TriggerEvent } from './index'

const managers: WorkflowTriggerManager[] = []
afterEach(() => {
  for (const manager of managers.splice(0)) manager.stop()
  vi.useRealTimers()
})

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No TCP port')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

describe('workflow triggers', () => {
  it('validates webhook credentials and cadence before opening a listener', () => {
    expect(TriggerSchema.safeParse({ id: 'a', workflowId: 'w', kind: 'webhook', path: '/run', port: 4000, token: 'short' }).success).toBe(false)
    expect(TriggerSchema.safeParse({ id: 'a', workflowId: 'w', kind: 'schedule', intervalMs: 50 }).success).toBe(false)
  })

  it('fires a schedule and prevents overlapping deliveries', async () => {
    vi.useFakeTimers()
    const events: TriggerEvent[] = []
    let finish: (() => void) | undefined
    const manager = new WorkflowTriggerManager('.', (event) => {
      events.push(event)
      return new Promise<void>((resolve) => { finish = resolve })
    })
    managers.push(manager)
    await manager.start([{ id: 's', workflowId: 'w', kind: 'schedule', intervalMs: 1000, dedupeMs: 0 }])
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(events).toHaveLength(1)
    finish?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toHaveLength(2)
  })

  it('requires a bearer token and deduplicates identical webhook bodies', async () => {
    const events: TriggerEvent[] = []
    const port = await freePort()
    const token = 't'.repeat(32)
    const manager = new WorkflowTriggerManager('.', (event) => { events.push(event) })
    managers.push(manager)
    await manager.start([{ id: 'h', workflowId: 'w', kind: 'webhook', path: '/run', token, port, dedupeMs: 60_000, filter: { path: 'event', equals: 'push' } }])
    const url = `http://127.0.0.1:${port}/run`
    const body = JSON.stringify({ event: 'push' })
    const unauthorized = await fetch(url, { method: 'POST', body, headers: { authorization: 'Bearer wrong' } })
    expect(unauthorized.status).toBe(401)
    const authorized = await fetch(url, { method: 'POST', body, headers: { authorization: `Bearer ${token}` } })
    expect(authorized.status).toBe(202)
    const duplicate = await fetch(url, { method: 'POST', body, headers: { authorization: `Bearer ${token}` } })
    expect(duplicate.status).toBe(202)
    const filtered = await fetch(url, { method: 'POST', body: JSON.stringify({ event: 'issue' }), headers: { authorization: `Bearer ${token}` } })
    expect(filtered.status).toBe(202)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toEqual({ event: 'push' })
  })
})

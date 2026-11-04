import { createHash, timingSafeEqual } from 'node:crypto'
import { watch, realpathSync, type FSWatcher } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { z } from 'zod'

const execFileAsync = promisify(execFile)
const base = z.object({ id: z.string().min(1).max(120), workflowId: z.string().min(1).max(120), enabled: z.boolean().default(true), dedupeMs: z.number().int().min(0).max(3_600_000).default(1000), filter: z.object({ path: z.string().min(1).max(200), equals: z.unknown() }).strict().optional() })
export const TriggerSchema = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('schedule'), intervalMs: z.number().int().min(1000).max(86_400_000) }).strict(),
  base.extend({ kind: z.literal('filesystem'), path: z.string().min(1), recursive: z.boolean().default(false), events: z.array(z.enum(['rename', 'change'])).min(1).default(['rename', 'change']) }).strict(),
  base.extend({ kind: z.literal('git'), path: z.string().min(1), intervalMs: z.number().int().min(1000).max(86_400_000) }).strict(),
  base.extend({ kind: z.literal('webhook'), path: z.string().regex(/^\/[a-zA-Z0-9/_-]{1,120}$/), token: z.string().min(32).max(512), port: z.number().int().min(1024).max(65535) }).strict()
])
export type Trigger = z.infer<typeof TriggerSchema>
export interface TriggerEvent { triggerId: string; workflowId: string; kind: Trigger['kind']; timestamp: number; payload: Record<string, unknown> }
export type TriggerHandler = (event: TriggerEvent) => Promise<void> | void

function within(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel))
}

function checkedPath(workspacePath: string, raw: string): string {
  if (!workspacePath) throw new Error('Trigger workspace is required')
  const root = realpathSync(workspacePath)
  const target = realpathSync(resolve(root, raw))
  if (!within(root, target)) throw new Error('Trigger path is outside the workspace')
  return target
}

function secureToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false
  const a = createHash('sha256').update(actual).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Runtime-only trigger host. Persist webhook token separately in encrypted storage. */
export class WorkflowTriggerManager {
  private disposers: Array<() => void> = []
  private seen = new Map<string, number>()
  private running = new Set<string>()

  constructor(private readonly workspacePath: string, private readonly onEvent: TriggerHandler) {}

  async start(raw: unknown[]): Promise<void> {
    this.stop()
    const triggers = z.array(TriggerSchema).max(100).parse(raw)
    const ids = new Set<string>()
    for (const trigger of triggers) {
      if (ids.has(trigger.id)) throw new Error(`Duplicate trigger ID: ${trigger.id}`)
      ids.add(trigger.id)
    }
    try {
      for (const trigger of triggers) {
        if (!trigger.enabled) continue
        if (trigger.kind === 'schedule') this.startSchedule(trigger)
        else if (trigger.kind === 'filesystem') this.startFilesystem(trigger)
        else if (trigger.kind === 'git') await this.startGit(trigger)
        else await this.startWebhook(trigger)
      }
    } catch (error) { this.stop(); throw error }
  }

  stop(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.seen.clear()
    this.running.clear()
  }

  private emit(trigger: Trigger, key: string, payload: Record<string, unknown>): void {
    if (trigger.filter) {
      const actual = trigger.filter.path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, part) ? (value as Record<string, unknown>)[part] : undefined, payload)
      if (JSON.stringify(actual) !== JSON.stringify(trigger.filter.equals)) return
    }
    const now = Date.now()
    const previous = this.seen.get(`${trigger.id}:${key}`) ?? 0
    if (now - previous < trigger.dedupeMs || this.running.has(trigger.id)) return
    this.seen.set(`${trigger.id}:${key}`, now)
    this.running.add(trigger.id)
    Promise.resolve().then(() => this.onEvent({ triggerId: trigger.id, workflowId: trigger.workflowId, kind: trigger.kind, timestamp: now, payload }))
      .catch((error: unknown) => console.warn(`[LocalPilot] Trigger ${trigger.id} failed`, error))
      .finally(() => this.running.delete(trigger.id))
    if (this.seen.size > 1000) for (const [id, at] of this.seen) if (now - at > 3_600_000) this.seen.delete(id)
  }

  private startSchedule(trigger: Extract<Trigger, { kind: 'schedule' }>): void {
    const timer = setInterval(() => this.emit(trigger, 'tick', {}), trigger.intervalMs)
    this.disposers.push(() => clearInterval(timer))
  }

  private startFilesystem(trigger: Extract<Trigger, { kind: 'filesystem' }>): void {
    const path = checkedPath(this.workspacePath, trigger.path)
    const watcher: FSWatcher = watch(path, { recursive: trigger.recursive }, (event, filename) => {
      if (!trigger.events.includes(event)) return
      const name = filename?.toString() ?? ''
      this.emit(trigger, `${event}:${name}`, { event, filename: name })
    })
    watcher.on('error', (error) => console.warn(`[LocalPilot] Filesystem trigger ${trigger.id} failed`, error))
    this.disposers.push(() => watcher.close())
  }

  private async startGit(trigger: Extract<Trigger, { kind: 'git' }>): Promise<void> {
    const cwd = checkedPath(this.workspacePath, trigger.path)
    const head = async (): Promise<string> => (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5000, maxBuffer: 4096 })).stdout.trim()
    let last = await head()
    const timer = setInterval(() => {
      void head().then((next) => {
        if (next && next !== last) { const previous = last; last = next; this.emit(trigger, next, { previous, head: next }) }
      }).catch((error: unknown) => console.warn(`[LocalPilot] Git trigger ${trigger.id} failed`, error))
    }, trigger.intervalMs)
    this.disposers.push(() => clearInterval(timer))
  }

  private async startWebhook(trigger: Extract<Trigger, { kind: 'webhook' }>): Promise<void> {
    const server: Server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== trigger.path) { response.writeHead(404).end(); return }
      const bearer = request.headers.authorization?.replace(/^Bearer /i, '')
      if (!secureToken(bearer, trigger.token)) { response.writeHead(401).end(); return }
      let body = ''
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8')
        if (body.length > 65_536) request.destroy()
      })
      request.on('end', () => {
        try {
          const payload: unknown = JSON.parse(body)
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected JSON object')
          this.emit(trigger, createHash('sha256').update(body).digest('hex'), payload as Record<string, unknown>)
          response.writeHead(202).end()
        } catch { response.writeHead(400).end() }
      })
    })
    await new Promise<void>((resolveReady, reject) => {
      server.once('error', reject)
      server.listen(trigger.port, '127.0.0.1', () => { server.off('error', reject); resolveReady() })
    })
    this.disposers.push(() => server.close())
  }
}

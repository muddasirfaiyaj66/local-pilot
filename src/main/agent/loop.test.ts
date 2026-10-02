import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatStreamChunk } from '@shared/types'
import type { ModelProvider, ProviderChatMessage, ProviderChatParams } from '../providers/base'
import { fuzzySignature, isTransientToolError, runAgentLoop, seedConversation, trimTranscript } from './loop'

class ScriptedProvider implements ModelProvider {
  readonly kind = 'mock'
  turn = 0
  readonly seenTools: Array<ProviderChatParams['tools']> = []
  readonly transcripts: ProviderChatMessage[][] = []

  constructor(private readonly turns: Array<ChatStreamChunk[]>) {}

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    this.seenTools.push(params.tools)
    this.transcripts.push(params.messages)
    const chunks = this.turns[this.turn] ?? [{ type: 'text', text: 'Done.' }, { type: 'done' }]
    this.turn += 1
    for (const c of chunks) yield c
  }

  async listModels(): Promise<string[]> {
    return ['mock']
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'ok' }
  }
}

function listCall(id: string): ChatStreamChunk[] {
  return [
    {
      type: 'tool_call',
      toolCall: { id, name: 'fs_list', arguments: { path: '.' } }
    },
    { type: 'done', finishReason: 'tool_calls' }
  ]
}

function shellCall(id: string, command: string): ChatStreamChunk[] {
  return [
    {
      type: 'tool_call',
      toolCall: { id, name: 'shell_run', arguments: { command } }
    },
    { type: 'done', finishReason: 'tool_calls' }
  ]
}

describe('fuzzySignature', () => {
  it('collapses flag-only variations of the same command', () => {
    const a = fuzzySignature({ id: '1', name: 'shell_run', arguments: { command: 'npm create vite@latest . --template react' } })
    const b = fuzzySignature({ id: '2', name: 'shell_run', arguments: { command: 'npm create vite . --template react -y' } })
    expect(a).toBe(b)
  })

  it('separates genuinely different commands', () => {
    const a = fuzzySignature({ id: '1', name: 'shell_run', arguments: { command: 'npm install' } })
    const b = fuzzySignature({ id: '2', name: 'shell_run', arguments: { command: 'npm run dev' } })
    expect(a).not.toBe(b)
  })
})

describe('seedConversation', () => {
  it('keeps prior turns and does not duplicate the current goal', () => {
    const messages = seedConversation('make it blue', [
      { role: 'user', content: 'add a button' },
      { role: 'assistant', content: 'added the button' },
      { role: 'user', content: 'make it blue', images: [{ mimeType: 'image/png', data: 'abc' }] }
    ])
    expect(messages.map((m) => m.content)).toEqual(['add a button', 'added the button', 'make it blue'])
    expect(messages[2]?.images?.[0]?.data).toBe('abc')
  })
})

describe('trimTranscript', () => {
  it('shortens older tool output once the budget is exceeded', () => {
    const messages: ProviderChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'tool', content: 'x'.repeat(9000) },
      { role: 'user', content: 'goal' }
    ]
    trimTranscript(messages, 100)
    expect(messages[1]?.content).toContain('earlier context trimmed')
    expect(messages[2]?.content).toBe('goal')
  })
})

describe('isTransientToolError', () => {
  it('retries timeouts and network drops, not ordinary failures', () => {
    expect(isTransientToolError('Tool timed out after 1000ms')).toBe(true)
    expect(isTransientToolError('connect ECONNRESET')).toBe(true)
    expect(isTransientToolError('Command failed with exit code 1')).toBe(false)
    expect(isTransientToolError('Aborted')).toBe(false)
  })
})

describe('runAgentLoop', () => {
  it('summarises instead of just reporting the step limit', async () => {
    const provider = new ScriptedProvider([listCall('c1'), listCall('c2')])

    const result = await runAgentLoop({
      provider,
      goal: 'Inspect the workspace',
      workspacePath: process.cwd(),
      permissionMode: 'autonomous',
      maxSteps: 2,
      onEvent: () => undefined,
      requestPermission: async () => true,
      askUser: async () => 'yes'
    })

    expect(result.status).toBe('failed')
    expect(result.summary).toContain('Done.')
    expect(result.summary).toContain('step limit (2)')
  })

  it('blocks a failing command after repeated near-identical retries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lp-ban-'))
    try {
      // Same doomed generator, retried with cosmetic flag tweaks each turn.
      const provider = new ScriptedProvider([
        shellCall('c1', 'node -e "process.exit(4)" --template react'),
        shellCall('c2', 'node -e "process.exit(4)" --template react -y'),
        shellCall('c3', 'node -e "process.exit(4)" --template react --yes'),
        shellCall('c4', 'node -e "process.exit(4)" --template react --force'),
        [{ type: 'text', text: 'Switching approach.' }, { type: 'done', finishReason: 'stop' }]
      ])

      const results: Array<{ ok: boolean; error?: string }> = []
      await runAgentLoop({
        provider,
        goal: 'Create a website',
        workspacePath: dir,
        permissionMode: 'autonomous',
        maxSteps: 6,
        onEvent: (e) => {
          if (e.type === 'tool_result') results.push({ ok: e.result.ok, error: e.result.error })
        },
        requestPermission: async () => true,
        askUser: async () => 'yes'
      })

      expect(results.length).toBeGreaterThanOrEqual(3)
      expect(results.every((r) => !r.ok)).toBe(true)
      expect(results.at(-1)?.error).toContain('Blocked')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes prior messages in the model transcript', async () => {
    const provider = new ScriptedProvider([
      [{ type: 'text', text: 'The button is blue.' }, { type: 'done', finishReason: 'stop' }]
    ])

    await runAgentLoop({
      provider,
      goal: 'make it blue',
      priorMessages: [
        { role: 'user', content: 'add a button' },
        { role: 'assistant', content: 'added the button' },
        { role: 'user', content: 'make it blue' }
      ],
      workspacePath: process.cwd(),
      permissionMode: 'autonomous',
      maxSteps: 3,
      onEvent: () => undefined,
      requestPermission: async () => true,
      askUser: async () => 'yes'
    })

    const transcript = provider.transcripts[0] ?? []
    expect(transcript.some((m) => m.role === 'user' && m.content === 'add a button')).toBe(true)
    expect(transcript.filter((m) => m.content === 'make it blue')).toHaveLength(1)
  })

  it('runs a failing command once per model step', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lp-once-'))
    const marker = join(dir, 'runs.txt')
    const pathLiteral = marker.replace(/\\/g, '\\\\')
    const command = `node -e "require('fs').appendFileSync('${pathLiteral}','x');process.exit(1)"`
    try {
      const provider = new ScriptedProvider([
        shellCall('once', command),
        [{ type: 'text', text: 'Stopped after the failure.' }, { type: 'done', finishReason: 'stop' }]
      ])

      await runAgentLoop({
        provider,
        goal: 'run the check',
        workspacePath: dir,
        permissionMode: 'autonomous',
        maxSteps: 4,
        onEvent: () => undefined,
        requestPermission: async () => true,
        askUser: async () => 'yes'
      })

      expect(existsSync(marker)).toBe(true)
      expect(readFileSync(marker, 'utf8')).toBe('x')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops when aborted while waiting for permission', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lp-abort-'))
    const controller = new AbortController()
    try {
      const provider = new ScriptedProvider([
        [
          {
            type: 'tool_call',
            toolCall: {
              id: 'w1',
              name: 'fs_write',
              arguments: { path: 'a.txt', content: 'hi' }
            }
          },
          { type: 'done' }
        ]
      ])

      const result = await runAgentLoop({
        provider,
        goal: 'write a file',
        workspacePath: dir,
        permissionMode: 'ask-every-time',
        signal: controller.signal,
        maxSteps: 4,
        onEvent: () => undefined,
        requestPermission: () => {
          controller.abort()
          return new Promise(() => undefined)
        },
        askUser: async () => 'yes'
      })

      expect(result.status).toBe('stopped')
      expect(existsSync(join(dir, 'a.txt'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('completes when the model returns text without tools', async () => {
    const provider = new ScriptedProvider([
      [
        { type: 'text', text: 'All set — workspace looks fine.' },
        { type: 'done', finishReason: 'stop' }
      ]
    ])

    const events: string[] = []
    const result = await runAgentLoop({
      provider,
      goal: 'Say hello',
      workspacePath: process.cwd(),
      permissionMode: 'autonomous',
      maxSteps: 5,
      onEvent: (e) => events.push(e.type),
      requestPermission: async () => true,
      askUser: async () => 'yes'
    })

    expect(result.status).toBe('success')
    expect(events).toContain('plan')
    expect(events).toContain('thought')
    expect(events).toContain('done')
  })

  it('executes one tool then finishes on next turn', async () => {
    const provider = new ScriptedProvider([
      [
        {
          type: 'tool_call',
          toolCall: {
            id: 'c1',
            name: 'code_repo_index',
            arguments: {}
          }
        },
        { type: 'done', finishReason: 'tool_calls' }
      ],
      [
        { type: 'text', text: 'Indexed the repo successfully.' },
        { type: 'done', finishReason: 'stop' }
      ]
    ])

    const result = await runAgentLoop({
      provider,
      goal: 'Index the repository',
      workspacePath: process.cwd(),
      permissionMode: 'autonomous',
      maxSteps: 5,
      onEvent: () => undefined,
      requestPermission: async () => true,
      askUser: async () => 'yes'
    })

    expect(result.status).toBe('success')
    expect(result.summary.toLowerCase()).toContain('index')
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const provider: ModelProvider = {
      kind: 'mock',
      async *chat() {
        yield { type: 'text', text: 'partial' }
        yield { type: 'done' }
      },
      async listModels() {
        return []
      },
      async testConnection() {
        return { ok: true, message: 'ok' }
      }
    }

    const result = await runAgentLoop({
      provider,
      goal: 'Never finish',
      workspacePath: process.cwd(),
      permissionMode: 'autonomous',
      signal: controller.signal,
      onEvent: () => undefined,
      requestPermission: async () => true,
      askUser: async () => 'yes'
    })

    expect(result.status).toBe('stopped')
  })

  it('requests permission for risky tools in ask-risky mode', async () => {
    const provider = new ScriptedProvider([
      [
        {
          type: 'tool_call',
          toolCall: {
            id: 'c2',
            name: 'fs_write',
            arguments: { path: 'tmp-agent-test.txt', content: 'hi' }
          }
        },
        { type: 'done' }
      ],
      [{ type: 'text', text: 'Wrote file.' }, { type: 'done' }]
    ])

    const requestPermission = vi.fn(async () => false)

    const result = await runAgentLoop({
      provider,
      goal: 'Write a file',
      workspacePath: process.cwd(),
      permissionMode: 'ask-risky',
      maxSteps: 5,
      onEvent: () => undefined,
      requestPermission,
      askUser: async () => 'yes'
    })

    expect(requestPermission).toHaveBeenCalled()
    // Denied write → model may still "succeed" with text; status can be success or failed
    expect(['success', 'failed']).toContain(result.status)
  })

  it('plan mode exits after empty fs_list instead of looping to step limit', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'lp-plan-empty-'))
    try {
      const provider = new ScriptedProvider([
        listCall('p1'),
        [
          { type: 'text', text: '1. Scaffold HTML\n2. Add JS todo logic\n3. Style UI' },
          { type: 'done' }
        ]
      ])

      const result = await runAgentLoop({
        provider,
        goal: 'create a todo application',
        workspacePath: ws,
        permissionMode: 'autonomous',
        mode: 'plan',
        maxSteps: 8,
        onEvent: () => undefined,
        requestPermission: async () => true,
        askUser: async () => 'yes'
      })

      expect(result.status).toBe('success')
      expect(result.summary.toLowerCase()).toMatch(/scaffold|todo|plan|agent/)
      // After empty list, next turn should not offer tools
      expect(provider.seenTools[1]).toBeUndefined()
      expect(provider.turn).toBeLessThanOrEqual(2)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('plan mode stops duplicate fs_list without hitting the step limit', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'lp-plan-dup-'))
    try {
      const provider = new ScriptedProvider([
        listCall('d1'),
        listCall('d2'),
        listCall('d3'),
        listCall('d4'),
        listCall('d5'),
        listCall('d6'),
        listCall('d7'),
        listCall('d8')
      ])

      const result = await runAgentLoop({
        provider,
        goal: 'create a todo application',
        workspacePath: ws,
        permissionMode: 'autonomous',
        mode: 'plan',
        maxSteps: 8,
        onEvent: () => undefined,
        requestPermission: async () => true,
        askUser: async () => 'yes'
      })

      expect(result.status).toBe('success')
      expect(result.summary).not.toMatch(/step limit/i)
      expect(provider.turn).toBeLessThanOrEqual(3)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('watchdog fails a hung model stream instead of stalling forever', async () => {
    const { chatWithWatchdog } = await import('./loop')
    async function* hanging(): AsyncGenerator<ChatStreamChunk, void, unknown> {
      yield { type: 'text', text: 'partial' }
      await new Promise(() => undefined) // never resolves
    }
    await expect(async () => {
      const out: string[] = []
      for await (const c of chatWithWatchdog(hanging(), undefined, 50, 200)) {
        if (c.type === 'text') out.push(c.text)
      }
      void out
    }).rejects.toThrow(/stopped responding|timed out/i)
  })
})

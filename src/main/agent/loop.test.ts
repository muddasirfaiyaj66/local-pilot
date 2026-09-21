import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatStreamChunk } from '@shared/types'
import type { ModelProvider, ProviderChatParams } from '../providers/base'
import { runAgentLoop } from './loop'

class ScriptedProvider implements ModelProvider {
  readonly kind = 'mock'
  turn = 0
  readonly seenTools: Array<ProviderChatParams['tools']> = []

  constructor(private readonly turns: Array<ChatStreamChunk[]>) {}

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    this.seenTools.push(params.tools)
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

describe('runAgentLoop', () => {
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

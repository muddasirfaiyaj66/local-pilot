import { describe, expect, it, vi } from 'vitest'
import type { ChatStreamChunk } from '@shared/types'
import type { ModelProvider, ProviderChatParams } from '../providers/base'
import { runAgentLoop } from './loop'

class ScriptedProvider implements ModelProvider {
  readonly kind = 'mock'
  private turn = 0

  constructor(
    private readonly turns: Array<ChatStreamChunk[]>
  ) {}

  async *chat(_params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
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
})

import { describe, expect, it } from 'vitest'
import type { ChatStreamChunk } from '@shared/types'
import type { ModelProvider, ProviderChatParams } from './base'

/** Minimal mock used until the Phase 2 agent-loop tests land */
class MockStreamingProvider implements ModelProvider {
  readonly kind = 'mock'

  constructor(private readonly chunks: ChatStreamChunk[]) {}

  async *chat(_params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    for (const chunk of this.chunks) {
      yield chunk
    }
  }

  async listModels(): Promise<string[]> {
    return ['mock-model']
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'ok' }
  }
}

describe('MockStreamingProvider', () => {
  it('yields text then done', async () => {
    const provider = new MockStreamingProvider([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
      { type: 'done', finishReason: 'stop' }
    ])

    const out: ChatStreamChunk[] = []
    for await (const chunk of provider.chat({
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      out.push(chunk)
    }

    expect(out).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
      { type: 'done', finishReason: 'stop' }
    ])
  })
})

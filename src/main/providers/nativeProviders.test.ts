import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatStreamChunk } from '@shared/types'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.close()
    }
  })
  return new Response(body, { status: 200 })
}

async function collect(gen: AsyncGenerator<ChatStreamChunk>): Promise<ChatStreamChunk[]> {
  const out: ChatStreamChunk[] = []
  for await (const chunk of gen) out.push(chunk)
  return out
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AnthropicProvider', () => {
  it('streams text, tool calls, usage and finish reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          { type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 4 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'fs_list' } },
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"."}' } },
          { type: 'content_block_stop', index: 1 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
          { type: 'message_stop' }
        ])
      )
    )

    const provider = new AnthropicProvider({ baseUrl: 'https://api.anthropic.com', model: 'claude', apiKey: 'k' })
    const chunks = await collect(
      provider.chat({ messages: [{ role: 'user', content: 'list files' }], stream: true })
    )

    const text = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('')
    expect(text).toBe('Hello world')
    const tool = chunks.find((c) => c.type === 'tool_call')
    expect(tool && tool.type === 'tool_call' ? tool.toolCall : undefined).toEqual({
      id: 'toolu_1',
      name: 'fs_list',
      arguments: { path: '.' }
    })
    const usage = chunks.find((c) => c.type === 'usage')
    expect(usage && usage.type === 'usage' ? usage.promptTokens : undefined).toBe(10)
    expect(usage && usage.type === 'usage' ? usage.completionTokens : undefined).toBe(5)
    expect(usage && usage.type === 'usage' ? usage.cachedTokens : undefined).toBe(4)
    const done = chunks.at(-1)
    expect(done?.type === 'done' ? done.finishReason : undefined).toBe('tool_use')
  })

  it('emits reasoning from thinking deltas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          { type: 'message_start', message: { usage: { input_tokens: 1 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'considering…' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
          { type: 'message_stop' }
        ])
      )
    )

    const provider = new AnthropicProvider({ baseUrl: 'https://api.anthropic.com', model: 'claude' })
    const chunks = await collect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(chunks.some((c) => c.type === 'reasoning' && c.text === 'considering…')).toBe(true)
  })
})

describe('GeminiProvider', () => {
  it('streams text, reasoning, tool calls and usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          { candidates: [{ content: { role: 'model', parts: [{ text: 'Hi' }] } }] },
          { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] } }] },
          { candidates: [{ content: { parts: [{ functionCall: { name: 'fs_list', args: { path: '.' } } }] } }] },
          { usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10, thoughtsTokenCount: 2 } },
          { candidates: [{ finishReason: 'STOP' }] }
        ])
      )
    )

    const provider = new GeminiProvider({
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'models/gemini-2.0-flash',
      apiKey: 'k'
    })
    const chunks = await collect(provider.chat({ messages: [{ role: 'user', content: 'list files' }] }))

    expect(chunks.some((c) => c.type === 'text' && c.text === 'Hi')).toBe(true)
    expect(chunks.some((c) => c.type === 'reasoning' && c.text === 'thinking…')).toBe(true)
    const tool = chunks.find((c) => c.type === 'tool_call')
    expect(tool && tool.type === 'tool_call' ? tool.toolCall.name : undefined).toBe('fs_list')
    expect(tool && tool.type === 'tool_call' ? tool.toolCall.arguments : undefined).toEqual({ path: '.' })
    const usage = chunks.find((c) => c.type === 'usage')
    expect(usage && usage.type === 'usage' ? usage.promptTokens : undefined).toBe(7)
    expect(usage && usage.type === 'usage' ? usage.reasoningTokens : undefined).toBe(2)
    const done = chunks.at(-1)
    expect(done?.type === 'done' ? done.finishReason : undefined).toBe('stop')
  })
})

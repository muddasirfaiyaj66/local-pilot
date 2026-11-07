import { describe, expect, it, vi } from 'vitest'
import type { ChatStreamChunk } from '@shared/types'
import type { ModelProvider, ProviderChatParams } from './base'
import { FallbackProvider } from './fallback'

function scripted(script: Array<ChatStreamChunk | Error>): ModelProvider {
  return {
    kind: 'mock',
    async *chat(_params: ProviderChatParams) {
      for (const step of script) {
        if (step instanceof Error) throw step
        yield step
      }
    },
    listModels: async () => ['m'],
    testConnection: async () => ({ ok: true, message: 'ok' })
  }
}

async function collect(provider: ModelProvider, signal?: AbortSignal): Promise<ChatStreamChunk[]> {
  const out: ChatStreamChunk[] = []
  for await (const chunk of provider.chat({ messages: [{ role: 'user', content: 'hi' }], signal })) {
    out.push(chunk)
  }
  return out
}

describe('FallbackProvider', () => {
  it('uses the first provider when it succeeds', async () => {
    const chain = new FallbackProvider([
      { label: 'A', provider: scripted([{ type: 'text', text: 'a' }, { type: 'done' }]) },
      { label: 'B', provider: scripted([{ type: 'text', text: 'b' }, { type: 'done' }]) }
    ])
    expect(await collect(chain)).toEqual([{ type: 'text', text: 'a' }, { type: 'done' }])
  })

  it('falls through on an error chunk before any output and reports it', async () => {
    const onFallback = vi.fn()
    const chain = new FallbackProvider(
      [
        { label: 'A', provider: scripted([{ type: 'error', message: '401 bad key' }]) },
        { label: 'B', provider: scripted([{ type: 'text', text: 'b' }, { type: 'done' }]) }
      ],
      onFallback
    )
    expect(await collect(chain)).toEqual([{ type: 'text', text: 'b' }, { type: 'done' }])
    expect(onFallback).toHaveBeenCalledWith({ from: 'A', to: 'B', reason: '401 bad key' })
  })

  it('falls through when a provider throws before output', async () => {
    const chain = new FallbackProvider([
      { label: 'A', provider: scripted([new Error('ECONNREFUSED')]) },
      { label: 'B', provider: scripted([{ type: 'text', text: 'b' }, { type: 'done' }]) }
    ])
    expect(await collect(chain)).toEqual([{ type: 'text', text: 'b' }, { type: 'done' }])
  })

  it('passes a mid-stream error through instead of replaying on the next provider', async () => {
    const second = vi.fn()
    const chain = new FallbackProvider([
      {
        label: 'A',
        provider: scripted([{ type: 'text', text: 'half' }, { type: 'error', message: 'reset' }])
      },
      { label: 'B', provider: { ...scripted([]), chat: second } }
    ])
    expect(await collect(chain)).toEqual([
      { type: 'text', text: 'half' },
      { type: 'error', message: 'reset' }
    ])
    expect(second).not.toHaveBeenCalled()
  })

  it('reports the last failure when every provider fails', async () => {
    const chain = new FallbackProvider([
      { label: 'A', provider: scripted([{ type: 'error', message: 'quota' }]) },
      { label: 'B', provider: scripted([new Error('down')]) }
    ])
    expect(await collect(chain)).toEqual([{ type: 'error', message: 'B: down' }])
  })

  it('does not fall through after an abort', async () => {
    const controller = new AbortController()
    controller.abort()
    const second = vi.fn()
    const chain = new FallbackProvider([
      { label: 'A', provider: scripted([new Error('aborted')]) },
      { label: 'B', provider: { ...scripted([]), chat: second } }
    ])
    await expect(collect(chain, controller.signal)).rejects.toThrow('aborted')
    expect(second).not.toHaveBeenCalled()
  })
})

import type { ChatStreamChunk } from '@shared/types'
import type { ModelProvider, ProviderChatParams } from './base'

export interface FallbackEntry {
  /** Display label used in the fallback notice (provider name · model). */
  label: string
  provider: ModelProvider
}

export interface FallbackNotice {
  from: string
  to: string
  reason: string
}

/**
 * Tries providers in order. A provider is skipped only when it fails before
 * producing any output (throws, or yields an `error` chunk first) — once text,
 * reasoning, or a tool call has streamed, its later errors pass through, since
 * replaying a half-finished turn on another model would duplicate output.
 *
 * Aborts never fall through: a user Stop must stop the whole chain.
 */
export class FallbackProvider implements ModelProvider {
  readonly kind: string

  constructor(
    private readonly entries: FallbackEntry[],
    private readonly onFallback?: (notice: FallbackNotice) => void
  ) {
    if (entries.length === 0) throw new Error('FallbackProvider needs at least one provider')
    this.kind = entries[0]!.provider.kind
  }

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    let lastError = 'All providers failed'
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]!
      const next = this.entries[i + 1]
      let started = false
      let failure: string | null = null
      try {
        for await (const chunk of entry.provider.chat(params)) {
          if (!started && chunk.type === 'error') {
            failure = chunk.message
            break
          }
          if (chunk.type === 'text' || chunk.type === 'reasoning' || chunk.type === 'tool_call') {
            started = true
          }
          yield chunk
        }
      } catch (err) {
        if (started || params.signal?.aborted) throw err
        failure = err instanceof Error ? err.message : String(err)
      }
      if (failure === null) return
      lastError = `${entry.label}: ${failure}`
      if (params.signal?.aborted || !next) break
      this.onFallback?.({ from: entry.label, to: next.label, reason: failure })
    }
    yield { type: 'error', message: lastError }
  }

  listModels(): Promise<string[]> {
    return this.entries[0]!.provider.listModels()
  }

  testConnection(): ReturnType<ModelProvider['testConnection']> {
    return this.entries[0]!.provider.testConnection()
  }
}

import type { ChatStreamChunk } from '@shared/types'
import {
  createToolCallId,
  parseToolArguments,
  type ModelProvider,
  type ProviderChatMessage,
  type ProviderChatParams,
  type ProviderConnectionInfo
} from './base'
import { joinUrl, OpenAICompatProvider, redactSecrets } from './openaiCompat'

interface OllamaChatResponse {
  message?: {
    role?: string
    content?: string
    tool_calls?: Array<{
      function?: { name?: string; arguments?: Record<string, unknown> | string }
    }>
  }
  done?: boolean
  error?: string
}

interface OllamaTagsResponse {
  models?: Array<{ name: string }>
}

/**
 * Ollama native /api/chat streaming provider.
 * Falls back to OpenAI-compatible /v1 if the user points baseUrl at that path.
 */
export class OllamaProvider implements ModelProvider {
  readonly kind = 'ollama'

  constructor(private readonly info: ProviderConnectionInfo) {}

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    // If user configured an OpenAI-compat base (…/v1), delegate
    if (this.info.baseUrl.includes('/v1')) {
      const compat = new OpenAICompatProvider(this.info)
      yield* compat.chat(params)
      return
    }

    const url = joinUrl(this.info.baseUrl, '/api/chat')
    const body = {
      model: this.info.model,
      stream: true,
      messages: params.messages.map(toOllamaMessage),
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools.map((t) => ({ type: 'function', function: t })) }
        : {})
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: params.signal
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Ollama request failed: ${message}` }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield {
        type: 'error',
        message: `Ollama HTTP ${response.status}: ${redactSecrets(text || response.statusText)}`
      }
      return
    }

    if (!response.body) {
      yield { type: 'error', message: 'Empty response body from Ollama' }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (params.signal?.aborted) break
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let parsed: OllamaChatResponse
          try {
            parsed = JSON.parse(trimmed) as OllamaChatResponse
          } catch {
            continue
          }
          if (parsed.error) {
            yield { type: 'error', message: redactSecrets(parsed.error) }
            return
          }
          const content = parsed.message?.content
          if (content) {
            yield { type: 'text', text: content }
          }
          const toolCalls = parsed.message?.tool_calls
          if (toolCalls) {
            for (const tc of toolCalls) {
              const name = tc.function?.name
              if (!name) continue
              const args = tc.function?.arguments
              yield {
                type: 'tool_call',
                toolCall: {
                  id: createToolCallId(),
                  name,
                  arguments:
                    typeof args === 'string'
                      ? parseToolArguments(args)
                      : ((args ?? {}) as Record<string, unknown>)
                }
              }
            }
          }
          if (parsed.done) {
            yield { type: 'done', finishReason: 'stop' }
            return
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { type: 'done', finishReason: 'stop' }
  }

  async listModels(): Promise<string[]> {
    const url = joinUrl(this.info.baseUrl.replace(/\/v1\/?$/, ''), '/api/tags')
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to list Ollama models: HTTP ${response.status}`)
    }
    const data = (await response.json()) as OllamaTagsResponse
    return (data.models ?? []).map((m) => m.name).sort()
  }

  async testConnection(): Promise<{
    ok: boolean
    message: string
    models?: string[]
    latencyMs?: number
  }> {
    const started = Date.now()
    try {
      const models = await this.listModels()
      return {
        ok: true,
        message: models.length
          ? `Ollama connected. ${models.length} model(s).`
          : 'Ollama connected (no models pulled yet).',
        models,
        latencyMs: Date.now() - started
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started
      }
    }
  }
}

function toOllamaMessage(msg: ProviderChatMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { role: msg.role, content: msg.content }
  if (msg.images && msg.images.length > 0) {
    base.images = msg.images.map((i) => i.data)
  }
  return base
}

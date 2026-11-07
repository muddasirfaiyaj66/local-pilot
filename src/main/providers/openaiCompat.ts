import type { ChatStreamChunk, ToolDefinition } from '@shared/types'
import {
  createToolCallId,
  parseToolArguments,
  type ModelProvider,
  type ProviderChatMessage,
  type ProviderChatParams,
  type ProviderConnectionInfo
} from './base'
import { fetchWithRetry } from './retry'
import { readSseLines } from './sse'

interface OpenAIChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
  }
  error?: { message?: string }
}

interface OpenAIModelsResponse {
  data?: Array<{ id: string }>
}

/**
 * OpenAI-compatible chat completions (OpenAI, OpenRouter, LM Studio, llama.cpp server, etc.)
 */
export class OpenAICompatProvider implements ModelProvider {
  readonly kind = 'openai-compat'

  constructor(private readonly info: ProviderConnectionInfo) {}

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const url = joinUrl(this.info.baseUrl, '/chat/completions')
    const body = {
      model: this.info.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: params.messages.map(toOpenAIMessage),
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools.map(toOpenAITool), tool_choice: 'auto' }
        : {}),
      ...(this.info.maxTokens ? { max_tokens: this.info.maxTokens } : {})
    }

    let response: Response
    try {
      response = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.info.headers ?? {}),
            ...(this.info.apiKey ? { Authorization: `Bearer ${this.info.apiKey}` } : {})
          },
          body: JSON.stringify(body),
          signal: params.signal
        },
        { signal: params.signal }
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Request failed: ${message}` }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield {
        type: 'error',
        message: `HTTP ${response.status}: ${redactSecrets(text || response.statusText)}`
      }
      return
    }

    if (!response.body) {
      yield { type: 'error', message: 'Empty response body from provider' }
      return
    }

    const pendingTools = new Map<number, { id: string; name: string; arguments: string }>()
    let finishReason: string | undefined

    for await (const line of readSseLines(response.body, params.signal)) {
      if (line === '[DONE]') break
      let parsed: OpenAIChatCompletionChunk
      try {
        parsed = JSON.parse(line) as OpenAIChatCompletionChunk
      } catch {
        continue
      }
      if (parsed.error?.message) {
        yield { type: 'error', message: redactSecrets(parsed.error.message) }
        return
      }

      if (parsed.usage) {
        yield {
          type: 'usage',
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
          totalTokens: parsed.usage.total_tokens,
          cachedTokens: parsed.usage.prompt_tokens_details?.cached_tokens,
          reasoningTokens: parsed.usage.completion_tokens_details?.reasoning_tokens
        }
      }

      const choice = parsed.choices?.[0]
      if (!choice) continue

      const delta = choice.delta
      if (delta?.content) {
        yield { type: 'text', text: delta.content }
      }
      const reasoning = delta?.reasoning_content ?? delta?.reasoning
      if (reasoning) {
        yield { type: 'reasoning', text: reasoning }
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0
          const existing = pendingTools.get(index)
          if (!existing) {
            pendingTools.set(index, {
              id: tc.id ?? createToolCallId(),
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? ''
            })
          } else {
            if (tc.id) existing.id = tc.id
            // Providers either stream the name in pieces or resend the full name.
            const nameDelta = tc.function?.name
            if (nameDelta) {
              if (!existing.name) existing.name = nameDelta
              else if (!existing.name.endsWith(nameDelta)) existing.name += nameDelta
            }
            if (tc.function?.arguments) existing.arguments += tc.function.arguments
          }
        }
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason
      }
    }

    for (const tool of pendingTools.values()) {
      if (!tool.name) continue
      yield {
        type: 'tool_call',
        toolCall: {
          id: tool.id,
          name: tool.name,
          arguments: parseToolArguments(tool.arguments)
        }
      }
    }

    yield { type: 'done', finishReason }
  }

  async listModels(): Promise<string[]> {
    const url = joinUrl(this.info.baseUrl, '/models')
    const response = await fetchWithRetry(url, {
      headers: {
        ...(this.info.headers ?? {}),
        ...(this.info.apiKey ? { Authorization: `Bearer ${this.info.apiKey}` } : {})
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) {
      throw new Error(`Failed to list models: HTTP ${response.status}`)
    }
    const data = (await response.json()) as OpenAIModelsResponse
    return (data.data ?? []).map((m) => m.id).sort()
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
          ? `Connected. ${models.length} model(s) available.`
          : 'Connected (no models listed).',
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

function toOpenAIMessage(msg: ProviderChatMessage): Record<string, unknown> {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      content: msg.content,
      tool_call_id: msg.toolCallId ?? 'tool_call'
    }
  }
  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: msg.content || null,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments ?? {})
        }
      }))
    }
  }
  if (msg.images && msg.images.length > 0 && msg.role === 'user') {
    return {
      role: 'user',
      content: [
        { type: 'text', text: msg.content },
        ...msg.images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        }))
      ]
    }
  }
  return { role: msg.role, content: msg.content }
}

function toOpenAITool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }
}

export function joinUrl(base: string, path: string): string {
  const normalized = base.replace(/\/+$/, '')
  // Some providers use .../v1 already; others need /v1 appended by the user in settings
  return `${normalized}${path.startsWith('/') ? path : `/${path}`}`
}

export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
    .replace(/api[_-]?key["\s:=]+[a-zA-Z0-9._-]+/gi, 'api_key=***')
}

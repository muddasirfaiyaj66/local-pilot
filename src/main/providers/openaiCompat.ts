import type { ChatStreamChunk, ToolDefinition } from '@shared/types'
import {
  createToolCallId,
  parseToolArguments,
  type ModelProvider,
  type ProviderChatMessage,
  type ProviderChatParams,
  type ProviderConnectionInfo
} from './base'

interface OpenAIChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
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
      messages: params.messages.map(toOpenAIMessage),
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools.map(toOpenAITool), tool_choice: 'auto' }
        : {})
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.info.apiKey ? { Authorization: `Bearer ${this.info.apiKey}` } : {})
        },
        body: JSON.stringify(body),
        signal: params.signal
      })
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

    const pendingTools = new Map<
      number,
      { id: string; name: string; arguments: string }
    >()
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
      const choice = parsed.choices?.[0]
      if (!choice) continue

      const delta = choice.delta
      if (delta?.content) {
        yield { type: 'text', text: delta.content }
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
            if (tc.function?.name) existing.name += tc.function.name
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
    const response = await fetch(url, {
      headers: this.info.apiKey ? { Authorization: `Bearer ${this.info.apiKey}` } : {}
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

async function* readSseLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const raw of parts) {
        const line = raw.trimEnd()
        if (!line || line.startsWith(':')) continue
        if (line.startsWith('data:')) {
          yield line.slice(5).trimStart()
        }
      }
    }
    if (buffer.trim().startsWith('data:')) {
      yield buffer.trim().slice(5).trimStart()
    }
  } finally {
    reader.releaseLock()
  }
}

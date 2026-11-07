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

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 8192

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicBlock[]
}

/** Native Anthropic Messages API (streaming). */
export class AnthropicProvider implements ModelProvider {
  readonly kind = 'anthropic'

  constructor(private readonly info: ProviderConnectionInfo) {}

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const url = messagesUrl(this.info.baseUrl)
    const maxTokens = this.info.maxTokens ?? DEFAULT_MAX_TOKENS
    const { system, messages } = toAnthropicMessages(params.messages)

    const body: Record<string, unknown> = {
      model: this.info.model,
      max_tokens: maxTokens,
      stream: true,
      messages,
      ...(system ? { system } : {}),
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools.map(toAnthropicTool) }
        : {}),
      ...(this.info.reasoningEnabled
        ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget(maxTokens) } }
        : {})
    }

    let response: Response
    try {
      response = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': ANTHROPIC_VERSION,
            ...(this.info.headers ?? {}),
            ...(this.info.apiKey ? { 'x-api-key': this.info.apiKey } : {})
          },
          body: JSON.stringify(body),
          signal: params.signal
        },
        { signal: params.signal }
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Anthropic request failed: ${message}` }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield { type: 'error', message: `Anthropic HTTP ${response.status}: ${text || response.statusText}` }
      return
    }

    if (!response.body) {
      yield { type: 'error', message: 'Empty response body from Anthropic' }
      return
    }

    const pendingTools = new Map<number, { id: string; name: string; json: string }>()
    let inputTokens: number | undefined
    let cachedTokens: number | undefined
    let finishReason: string | undefined

    for await (const payload of readSseLines(response.body, params.signal)) {
      let event: Record<string, unknown>
      try {
        event = JSON.parse(payload) as Record<string, unknown>
      } catch {
        continue
      }
      const type = event.type as string | undefined

      if (type === 'error') {
        const errObj = event.error as { message?: string } | undefined
        yield { type: 'error', message: `Anthropic error: ${errObj?.message ?? 'unknown'}` }
        return
      }

      if (type === 'message_start') {
        const message = event.message as
          | { usage?: { input_tokens?: number; cache_read_input_tokens?: number } }
          | undefined
        inputTokens = message?.usage?.input_tokens
        cachedTokens = message?.usage?.cache_read_input_tokens
        continue
      }

      if (type === 'content_block_start') {
        const index = Number(event.index ?? 0)
        const block = event.content_block as { type?: string; id?: string; name?: string } | undefined
        if (block?.type === 'tool_use') {
          pendingTools.set(index, {
            id: block.id ?? createToolCallId(),
            name: block.name ?? '',
            json: ''
          })
        }
        continue
      }

      if (type === 'content_block_delta') {
        const index = Number(event.index ?? 0)
        const delta = event.delta as
          | { type?: string; text?: string; partial_json?: string; thinking?: string }
          | undefined
        if (delta?.type === 'text_delta' && delta.text) {
          yield { type: 'text', text: delta.text }
        } else if (delta?.type === 'thinking_delta' && delta.thinking) {
          yield { type: 'reasoning', text: delta.thinking }
        } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
          const tool = pendingTools.get(index)
          if (tool) tool.json += delta.partial_json
        }
        continue
      }

      if (type === 'content_block_stop') {
        const index = Number(event.index ?? 0)
        const tool = pendingTools.get(index)
        if (tool) {
          pendingTools.delete(index)
          yield {
            type: 'tool_call',
            toolCall: {
              id: tool.id,
              name: tool.name,
              arguments: parseToolArguments(tool.json)
            }
          }
        }
        continue
      }

      if (type === 'message_delta') {
        const usage = event.usage as { output_tokens?: number } | undefined
        const delta = event.delta as { stop_reason?: string } | undefined
        if (delta?.stop_reason) finishReason = delta.stop_reason
        yield {
          type: 'usage',
          promptTokens: inputTokens,
          completionTokens: usage?.output_tokens,
          totalTokens:
            inputTokens != null || usage?.output_tokens != null
              ? (inputTokens ?? 0) + (usage?.output_tokens ?? 0)
              : undefined,
          cachedTokens
        }
        continue
      }

      if (type === 'message_stop') break
    }

    yield { type: 'done', finishReason }
  }

  async listModels(): Promise<string[]> {
    const url = modelsUrl(this.info.baseUrl)
    const response = await fetchWithRetry(url, {
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        ...(this.info.headers ?? {}),
        ...(this.info.apiKey ? { 'x-api-key': this.info.apiKey } : {})
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) {
      throw new Error(`Failed to list Anthropic models: HTTP ${response.status}`)
    }
    const data = (await response.json()) as { data?: Array<{ id: string }> }
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
          ? `Anthropic connected. ${models.length} model(s).`
          : 'Anthropic connected (no models listed).',
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

function thinkingBudget(maxTokens: number): number {
  // Anthropic requires budget_tokens >= 1024 and < max_tokens.
  return Math.max(1024, Math.min(maxTokens - 1, Math.floor(maxTokens * 0.5)))
}

function toAnthropicMessages(messages: ProviderChatMessage[]): {
  system: string
  messages: AnthropicMessage[]
} {
  const systemParts: string[] = []
  const out: AnthropicMessage[] = []
  let toolResults: AnthropicBlock[] = []

  const flushToolResults = (): void => {
    if (toolResults.length > 0) {
      out.push({ role: 'user', content: toolResults })
      toolResults = []
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: msg.toolCallId ?? '',
        content: msg.content
      })
      continue
    }
    flushToolResults()

    if (msg.role === 'system') {
      if (msg.content) systemParts.push(msg.content)
      continue
    }

    if (msg.role === 'assistant') {
      const blocks: AnthropicBlock[] = []
      if (msg.content) blocks.push({ type: 'text', text: msg.content })
      for (const tc of msg.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments ?? {} })
      }
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks })
      continue
    }

    // user
    const blocks: AnthropicBlock[] = []
    if (msg.content) blocks.push({ type: 'text', text: msg.content })
    for (const img of msg.images ?? []) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.data }
      })
    }
    out.push({ role: 'user', content: blocks.length > 0 ? blocks : [{ type: 'text', text: '' }] })
  }

  flushToolResults()
  return { system: systemParts.join('\n\n'), messages: out }
}

function toAnthropicTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }
}

function messagesUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
}

function modelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`
}

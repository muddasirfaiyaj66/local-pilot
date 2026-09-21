import type { ChatImage, ChatStreamChunk, ToolCall, ToolDefinition } from '@shared/types'

export interface ProviderChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: ChatImage[]
  toolCallId?: string
  /** Present on assistant turns that requested tools (needed for multi-turn tool use). */
  toolCalls?: ToolCall[]
  /** Optional tool name for role=tool (some providers expect it). */
  toolName?: string
}

export interface ProviderChatParams {
  messages: ProviderChatMessage[]
  tools?: ToolDefinition[]
  images?: ChatImage[]
  stream?: boolean
  signal?: AbortSignal
}

export interface ProviderConnectionInfo {
  baseUrl: string
  apiKey?: string
  model: string
}

/**
 * Common interface for all model providers.
 * Implementations yield text deltas, tool calls, then a final `done` chunk.
 */
export interface ModelProvider {
  readonly kind: string
  chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown>
  listModels(): Promise<string[]>
  testConnection(): Promise<{ ok: boolean; message: string; models?: string[]; latencyMs?: number }>
}

export function createToolCallId(): string {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/** Best-effort parse of JSON tool arguments from model output */
export function parseToolArguments(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    // Attempt repair: extract first {...} block
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        // fall through
      }
    }
    return { _raw: trimmed }
  }
}

export type { ToolCall }

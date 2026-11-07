import type { ChatStreamChunk, ToolDefinition } from '@shared/types'
import {
  createToolCallId,
  type ModelProvider,
  type ProviderChatMessage,
  type ProviderChatParams,
  type ProviderConnectionInfo
} from './base'
import { fetchWithRetry } from './retry'
import { readSseLines } from './sse'

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { role?: string; parts?: Array<Record<string, unknown>> }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
    cachedContentTokenCount?: number
    thoughtsTokenCount?: number
  }
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/** Native Google Gemini generateContent provider (streaming). */
export class GeminiProvider implements ModelProvider {
  readonly kind = 'gemini'

  constructor(private readonly info: ProviderConnectionInfo) {}

  async *chat(params: ProviderChatParams): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { systemInstruction, contents } = toGeminiContents(params.messages)
    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      ...(params.tools && params.tools.length > 0
        ? { tools: [{ functionDeclarations: params.tools.map(toGeminiTool) }] }
        : {}),
      ...(this.info.maxTokens || this.info.reasoningEnabled
        ? {
            generationConfig: {
              ...(this.info.maxTokens ? { maxOutputTokens: this.info.maxTokens } : {}),
              ...(this.info.reasoningEnabled ? { thinkingConfig: { includeThoughts: true } } : {})
            }
          }
        : {})
    }

    const url = streamUrl(this.info.baseUrl, this.info.model, this.info.apiKey)
    let response: Response
    try {
      response = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.info.headers ?? {}),
            ...(this.info.apiKey ? { 'x-goog-api-key': this.info.apiKey } : {})
          },
          body: JSON.stringify(body),
          signal: params.signal
        },
        { signal: params.signal }
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Gemini request failed: ${message}` }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield { type: 'error', message: `Gemini HTTP ${response.status}: ${text || response.statusText}` }
      return
    }

    if (!response.body) {
      yield { type: 'error', message: 'Empty response body from Gemini' }
      return
    }

    let finishReason: string | undefined
    for await (const payload of readSseLines(response.body, params.signal)) {
      let chunk: GeminiStreamChunk
      try {
        chunk = JSON.parse(payload) as GeminiStreamChunk
      } catch {
        continue
      }
      if (chunk.error?.message) {
        yield { type: 'error', message: `Gemini error: ${chunk.error.message}` }
        return
      }
      if (chunk.promptFeedback?.blockReason) {
        yield { type: 'error', message: `Gemini blocked the request: ${chunk.promptFeedback.blockReason}` }
        return
      }

      const candidate = chunk.candidates?.[0]
      if (candidate) {
        for (const part of candidate.content?.parts ?? []) {
          const text = part.text
          if (typeof text === 'string' && text.length > 0) {
            if (part.thought === true) yield { type: 'reasoning', text }
            else yield { type: 'text', text }
          }
          const call = part.functionCall as
            | { name?: string; args?: Record<string, unknown> }
            | undefined
          if (call?.name) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: createToolCallId(),
                name: call.name,
                arguments: call.args ?? {}
              }
            }
          }
        }
        if (candidate.finishReason) finishReason = candidate.finishReason.toLowerCase()
      }

      const usage = chunk.usageMetadata
      if (usage) {
        yield {
          type: 'usage',
          promptTokens: usage.promptTokenCount,
          completionTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
          cachedTokens: usage.cachedContentTokenCount,
          reasoningTokens: usage.thoughtsTokenCount
        }
      }
    }

    yield { type: 'done', finishReason }
  }

  async listModels(): Promise<string[]> {
    const url = modelsUrl(this.info.baseUrl, this.info.apiKey)
    const response = await fetchWithRetry(url, {
      headers: {
        ...(this.info.headers ?? {}),
        ...(this.info.apiKey ? { 'x-goog-api-key': this.info.apiKey } : {})
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) {
      throw new Error(`Failed to list Gemini models: HTTP ${response.status}`)
    }
    const data = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
    }
    return (data.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort()
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
          ? `Gemini connected. ${models.length} model(s).`
          : 'Gemini connected (no models listed).',
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

function toGeminiContents(messages: ProviderChatMessage[]): {
  systemInstruction: string
  contents: GeminiContent[]
} {
  const systemParts: string[] = []
  const contents: GeminiContent[] = []

  const append = (role: 'user' | 'model', parts: GeminiPart[]): void => {
    if (parts.length === 0) return
    const last = contents[contents.length - 1]
    if (last && last.role === role) last.parts.push(...parts)
    else contents.push({ role, parts })
  }

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (msg.content) systemParts.push(msg.content)
      continue
    }
    if (msg.role === 'assistant') {
      const parts: GeminiPart[] = []
      if (msg.content) parts.push({ text: msg.content })
      for (const tc of msg.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.arguments ?? {} } })
      }
      append('model', parts)
      continue
    }
    if (msg.role === 'tool') {
      // Gemini models function responses as parts of a user turn.
      append('user', [
        {
          functionResponse: {
            name: msg.toolName ?? 'tool',
            response: { result: msg.content }
          }
        }
      ])
      continue
    }
    // user
    const parts: GeminiPart[] = []
    if (msg.content) parts.push({ text: msg.content })
    for (const img of msg.images ?? []) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
    }
    append('user', parts)
  }

  return { systemInstruction: systemParts.join('\n\n'), contents }
}

function toGeminiTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }
}

function apiBase(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return base.endsWith('/v1beta') ? base : `${base}/v1beta`
}

function stripModelPrefix(model: string): string {
  return model.replace(/^models\//, '')
}

function streamUrl(baseUrl: string, model: string, apiKey?: string): string {
  const url = `${apiBase(baseUrl)}/models/${stripModelPrefix(model)}:streamGenerateContent?alt=sse`
  return apiKey ? `${url}&key=${encodeURIComponent(apiKey)}` : url
}

function modelsUrl(baseUrl: string, apiKey?: string): string {
  const url = `${apiBase(baseUrl)}/models`
  return apiKey ? `${url}?key=${encodeURIComponent(apiKey)}` : url
}

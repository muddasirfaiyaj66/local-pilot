import type { ProviderConfig } from '@shared/types'
import type { ModelProvider } from './base'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OllamaProvider } from './ollama'
import { OpenAICompatProvider } from './openaiCompat'

export function createProvider(
  config: ProviderConfig,
  apiKey?: string
): ModelProvider {
  const info = {
    baseUrl: config.baseUrl,
    apiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    headers: config.headers,
    reasoningEnabled: config.reasoningEnabled
  }

  switch (config.kind) {
    case 'ollama':
      return new OllamaProvider(info)
    case 'anthropic':
      return new AnthropicProvider(info)
    case 'gemini':
      return new GeminiProvider(info)
    case 'openai-compat':
      return new OpenAICompatProvider(info)
    default: {
      throw new Error(`Unknown provider kind: ${String(config.kind)}`)
    }
  }
}

export const DEFAULT_PROVIDERS: Array<Omit<ProviderConfig, 'hasApiKey'> & { hasApiKey?: boolean }> =
  [
    {
      id: 'ollama-gemma',
      kind: 'ollama',
      name: 'Gemma 4 (cloud)',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'gemma4:31b-cloud',
      visionEnabled: true,
      enabled: true,
      reasoningEnabled: false
    },
    {
      id: 'ollama-kimi',
      kind: 'ollama',
      name: 'Kimi K3 (cloud)',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'kimi-k3:cloud',
      visionEnabled: false,
      enabled: true,
      reasoningEnabled: false
    },
    {
      id: 'openai-compat',
      kind: 'openai-compat',
      name: 'OpenAI-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      visionEnabled: true,
      enabled: true,
      reasoningEnabled: false
    },
    {
      id: 'anthropic',
      kind: 'anthropic',
      name: 'Anthropic Claude',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      visionEnabled: true,
      enabled: false,
      reasoningEnabled: false
    },
    {
      id: 'gemini',
      kind: 'gemini',
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.0-flash',
      visionEnabled: true,
      enabled: false,
      reasoningEnabled: false
    }
  ]

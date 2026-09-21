import type { ProviderConfig } from '@shared/types'
import type { ModelProvider } from './base'
import { OllamaProvider } from './ollama'
import { OpenAICompatProvider } from './openaiCompat'

export function createProvider(
  config: ProviderConfig,
  apiKey?: string
): ModelProvider {
  const info = {
    baseUrl: config.baseUrl,
    apiKey,
    model: config.model
  }

  switch (config.kind) {
    case 'ollama':
      return new OllamaProvider(info)
    case 'openai-compat':
    case 'anthropic':
    case 'gemini':
      // Phase 1: Anthropic/Gemini route through OpenAI-compat gateways
      // (OpenRouter / proxies). Native SDKs land in later phases.
      return new OpenAICompatProvider(info)
    default: {
      throw new Error(`Unknown provider kind: ${String(config.kind)}`)
    }
  }
}

export const DEFAULT_PROVIDERS: Array<Omit<ProviderConfig, 'hasApiKey'> & { hasApiKey?: boolean }> =
  [
    {
      id: 'ollama-local',
      kind: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'gemma4:31b-cloud',
      visionEnabled: true,
      enabled: true
    },
    {
      id: 'openai-compat',
      kind: 'openai-compat',
      name: 'OpenAI-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      visionEnabled: true,
      enabled: true
    }
  ]

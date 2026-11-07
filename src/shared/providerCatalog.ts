import type { ProviderConfig, ProviderKind } from './schemas'

/**
 * Pricing tier shown in the provider gallery.
 * - free:  a no-cost API key (rate-limited free tier or free models)
 * - local: runs on this machine, no key needed
 * - paid:  pay-as-you-go API key
 */
export type ProviderTier = 'free' | 'local' | 'paid'

export interface ProviderPreset {
  /** Stable preset id; also used as the provider id when added. */
  id: string
  name: string
  kind: ProviderKind
  tier: ProviderTier
  baseUrl: string
  /** Default model — "List models" in Settings can replace it. */
  model: string
  /** Other well-known models offered as quick picks. */
  models: string[]
  vision: boolean
  /** Whether an API key is required for requests. */
  needsKey: boolean
  /** Where the user creates a key (or downloads the runtime for local tiers). */
  keyUrl: string
  /** One line on what the free tier or pricing looks like. */
  blurb: string
  /** Optional placeholder shown in the key field. */
  keyHint?: string
  maxTokens?: number
}

export const PROVIDER_CATALOG: ProviderPreset[] = [
  // ── Free API keys ────────────────────────────────────────────────
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3-32b', 'openai/gpt-oss-120b'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    blurb: 'Free tier with very fast LPU inference for open models.',
    keyHint: 'gsk_…'
  },
  {
    id: 'google-ai-studio',
    name: 'Google AI Studio (Gemini)',
    kind: 'gemini',
    tier: 'free',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    vision: true,
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    blurb: 'Generous free tier for Gemini Flash with vision and long context.',
    keyHint: 'AIza…',
    maxTokens: 8192
  },
  {
    id: 'openrouter-free',
    name: 'OpenRouter (free models)',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
      'mistralai/mistral-small-3.2-24b-instruct:free'
    ],
    vision: false,
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    blurb: 'One key for hundreds of models; ":free" variants cost nothing.',
    keyHint: 'sk-or-…'
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
    models: ['llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b', 'gpt-oss-120b'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://cloud.cerebras.ai/',
    blurb: 'Free tier with wafer-scale speed on open models.',
    keyHint: 'csk-…'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    models: ['mistral-small-latest', 'codestral-latest', 'mistral-large-latest', 'pixtral-12b-2409'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    blurb: 'Free "Experiment" plan including Codestral for code.'
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://models.github.ai/inference',
    model: 'openai/gpt-4.1-mini',
    models: ['openai/gpt-4.1-mini', 'openai/gpt-4.1', 'meta/llama-3.3-70b-instruct', 'deepseek/deepseek-v3-0324'],
    vision: true,
    needsKey: true,
    keyUrl: 'https://github.com/settings/personal-access-tokens',
    blurb: 'Free prototyping quota with a GitHub token (models: read scope).',
    keyHint: 'github_pat_…'
  },
  {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.3-70b-instruct',
    models: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1', 'qwen/qwen2.5-coder-32b-instruct'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://build.nvidia.com/',
    blurb: 'Free developer credits for hosted NIM endpoints.',
    keyHint: 'nvapi-…'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Inference',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    models: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://huggingface.co/settings/tokens',
    blurb: 'Monthly free credits routed across inference providers.',
    keyHint: 'hf_…'
  },
  {
    id: 'sambanova',
    name: 'SambaNova Cloud',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://api.sambanova.ai/v1',
    model: 'Meta-Llama-3.3-70B-Instruct',
    models: ['Meta-Llama-3.3-70B-Instruct', 'DeepSeek-V3-0324', 'Qwen3-32B'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://cloud.sambanova.ai/apis',
    blurb: 'Free tier on fast dataflow hardware.'
  },
  {
    id: 'cohere',
    name: 'Cohere',
    kind: 'openai-compat',
    tier: 'free',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    model: 'command-a-03-2025',
    models: ['command-a-03-2025', 'command-r-plus', 'command-r'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    blurb: 'Free trial keys for Command models.'
  },

  // ── Local, no key ────────────────────────────────────────────────
  {
    // Not 'ollama-local': settings.ts migrates that legacy id to 'ollama-gemma'.
    id: 'ollama',
    name: 'Ollama (local)',
    kind: 'ollama',
    tier: 'local',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5-coder:7b',
    models: ['qwen2.5-coder:7b', 'llama3.2', 'gemma3:12b', 'deepseek-r1:8b'],
    vision: false,
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    blurb: 'Run open models offline. Pull a model with `ollama pull`.'
  },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    kind: 'openai-compat',
    tier: 'local',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model',
    models: [],
    vision: false,
    needsKey: false,
    keyUrl: 'https://lmstudio.ai/',
    blurb: 'Desktop app with a local OpenAI-compatible server.'
  },
  {
    id: 'llama-cpp',
    name: 'llama.cpp server',
    kind: 'openai-compat',
    tier: 'local',
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'default',
    models: [],
    vision: false,
    needsKey: false,
    keyUrl: 'https://github.com/ggml-org/llama.cpp',
    blurb: 'Bare-metal GGUF inference via `llama-server`.'
  },
  {
    id: 'jan',
    name: 'Jan',
    kind: 'openai-compat',
    tier: 'local',
    baseUrl: 'http://127.0.0.1:1337/v1',
    model: 'default',
    models: [],
    vision: false,
    needsKey: false,
    keyUrl: 'https://jan.ai/',
    blurb: 'Open-source offline assistant with a local API server.'
  },

  // ── Paid API keys ────────────────────────────────────────────────
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai-compat',
    tier: 'paid',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini'],
    vision: true,
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    blurb: 'GPT and o-series reasoning models.',
    keyHint: 'sk-…'
  },
  {
    id: 'anthropic-claude',
    name: 'Anthropic Claude',
    kind: 'anthropic',
    tier: 'paid',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
    vision: true,
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    blurb: 'Claude models with native tool use and extended thinking.',
    keyHint: 'sk-ant-…',
    maxTokens: 8192
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai-compat',
    tier: 'paid',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    blurb: 'Low-cost strong coding and reasoning models.'
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    kind: 'openai-compat',
    tier: 'paid',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4',
    models: ['grok-4', 'grok-3-mini'],
    vision: true,
    needsKey: true,
    keyUrl: 'https://console.x.ai/',
    blurb: 'Grok models over an OpenAI-compatible API.',
    keyHint: 'xai-…'
  },
  {
    id: 'together',
    name: 'Together AI',
    kind: 'openai-compat',
    tier: 'paid',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    blurb: 'Fast hosting for the major open-weight models.'
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    kind: 'openai-compat',
    tier: 'paid',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    models: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/deepseek-v3'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://fireworks.ai/account/api-keys',
    blurb: 'Low-latency serving with function calling.',
    keyHint: 'fw_…'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    kind: 'openai-compat',
    tier: 'paid',
    baseUrl: 'https://api.perplexity.ai',
    model: 'sonar-pro',
    models: ['sonar-pro', 'sonar', 'sonar-reasoning-pro'],
    vision: false,
    needsKey: true,
    keyUrl: 'https://www.perplexity.ai/settings/api',
    blurb: 'Search-grounded answers with citations.',
    keyHint: 'pplx-…'
  }
]

export const TIER_LABEL: Record<ProviderTier, string> = {
  free: 'Free key',
  local: 'Local',
  paid: 'Paid'
}

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_CATALOG.find((preset) => preset.id === id)
}

/** Look up which preset a configured provider came from (by id, then by base URL). */
export function presetForProvider(provider: Pick<ProviderConfig, 'id' | 'baseUrl'>): ProviderPreset | undefined {
  const byId = findPreset(provider.id)
  if (byId) return byId
  const base = provider.baseUrl.replace(/\/+$/, '')
  return PROVIDER_CATALOG.find((preset) => preset.baseUrl.replace(/\/+$/, '') === base)
}

/**
 * Build a provider config from a preset. When the preset id is already taken
 * (the user adds the same service twice, e.g. two OpenRouter models), a
 * numbered suffix keeps ids unique.
 */
export function providerFromPreset(
  preset: ProviderPreset,
  takenIds: ReadonlySet<string>
): Omit<ProviderConfig, 'hasApiKey'> {
  let id = preset.id
  for (let n = 2; takenIds.has(id); n++) id = `${preset.id}-${n}`
  return {
    id,
    kind: preset.kind,
    name: id === preset.id ? preset.name : `${preset.name} ${id.slice(preset.id.length + 1)}`,
    baseUrl: preset.baseUrl,
    model: preset.model,
    visionEnabled: preset.vision,
    enabled: true,
    reasoningEnabled: false,
    ...(preset.maxTokens ? { maxTokens: preset.maxTokens } : {})
  }
}

export function searchCatalog(query: string, tier: ProviderTier | 'all'): ProviderPreset[] {
  const needle = query.trim().toLowerCase()
  return PROVIDER_CATALOG.filter((preset) => {
    if (tier !== 'all' && preset.tier !== tier) return false
    if (!needle) return true
    return (
      preset.name.toLowerCase().includes(needle) ||
      preset.blurb.toLowerCase().includes(needle) ||
      preset.models.some((model) => model.toLowerCase().includes(needle))
    )
  })
}

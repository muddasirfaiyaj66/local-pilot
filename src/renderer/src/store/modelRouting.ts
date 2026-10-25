import type { AppSettings, ProviderConfig } from '@shared/types'

export function routedProviderId(
  settings: AppSettings | null,
  providers: ProviderConfig[],
  prompt: string,
  hasImage: boolean,
  mode: 'chat' | 'plan' | 'agent'
): string | null {
  const fallback = settings?.activeProviderId ?? providers.find((p) => p.enabled)?.id ?? null
  if (!settings?.modelRouting.enabled) return fallback

  const complex = mode !== 'chat' ||
    /\b(build|implement|refactor|debug|fix|research|plan|analy[sz]e|compare|design)\b/i.test(prompt) ||
    prompt.length > 700
  const route = hasImage
    ? settings.modelRouting.visionProviderId
    : complex
      ? settings.modelRouting.strongProviderId
      : settings.modelRouting.fastProviderId
  const configured = providers.find((p) => p.id === route && p.enabled && (!hasImage || p.visionEnabled))
  if (configured) return configured.id
  if (hasImage) return providers.find((p) => p.id === fallback && p.enabled && p.visionEnabled)?.id ??
    providers.find((p) => p.enabled && p.visionEnabled)?.id ?? null
  return fallback
}

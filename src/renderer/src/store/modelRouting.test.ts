import { describe, expect, it } from 'vitest'
import { AppSettingsSchema, type ProviderConfig } from '@shared/schemas'
import { routedProviderId } from './modelRouting'

const providers: ProviderConfig[] = [
  { id: 'fast', kind: 'ollama', name: 'Fast', baseUrl: 'http://localhost:11434', model: 'small', enabled: true, visionEnabled: false, hasApiKey: false },
  { id: 'strong', kind: 'ollama', name: 'Strong', baseUrl: 'http://localhost:11434', model: 'large', enabled: true, visionEnabled: false, hasApiKey: false },
  { id: 'vision', kind: 'ollama', name: 'Vision', baseUrl: 'http://localhost:11434', model: 'vision', enabled: true, visionEnabled: true, hasApiKey: false }
]
const settings = AppSettingsSchema.parse({
  activeProviderId: 'strong',
  modelRouting: { enabled: true, fastProviderId: 'fast', strongProviderId: 'strong', visionProviderId: 'vision' }
})

describe('model routing', () => {
  it('routes short chat, complex work, and images', () => {
    expect(routedProviderId(settings, providers, 'hello', false, 'chat')).toBe('fast')
    expect(routedProviderId(settings, providers, 'fix the build', false, 'chat')).toBe('strong')
    expect(routedProviderId(settings, providers, 'hello', false, 'agent')).toBe('strong')
    expect(routedProviderId(settings, providers, 'what is this?', true, 'chat')).toBe('vision')
  })

  it('falls back when a configured route is unavailable', () => {
    expect(routedProviderId(settings, providers.filter((p) => p.id !== 'fast'), 'hello', false, 'chat')).toBe('strong')
    expect(routedProviderId(settings, providers.filter((p) => p.id !== 'vision'), 'look', true, 'chat')).toBeNull()
  })
})

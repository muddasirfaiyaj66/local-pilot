import { describe, expect, it } from 'vitest'
import { ProviderConfigSchema } from './schemas'
import { PROVIDER_CATALOG, presetForProvider, providerFromPreset, searchCatalog } from './providerCatalog'

describe('provider catalog', () => {
  it('has unique ids and offers free, local, and paid options', () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const tier of ['free', 'local', 'paid'] as const) {
      expect(PROVIDER_CATALOG.some((p) => p.tier === tier)).toBe(true)
    }
  })

  it('never reuses the legacy id settings.ts migrates away', () => {
    expect(PROVIDER_CATALOG.some((p) => p.id === 'ollama-local')).toBe(false)
  })

  it('every preset produces a valid provider config with https/local URLs', () => {
    for (const preset of PROVIDER_CATALOG) {
      const config = providerFromPreset(preset, new Set())
      expect(() => ProviderConfigSchema.parse({ ...config, hasApiKey: false }), preset.id).not.toThrow()
      if (preset.tier === 'local') expect(preset.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/)
      else expect(preset.baseUrl).toMatch(/^https:\/\//)
      expect(preset.keyUrl).toMatch(/^https:\/\//)
    }
  })

  it('numbers the id when the preset is added twice', () => {
    const groq = PROVIDER_CATALOG.find((p) => p.id === 'groq')!
    const second = providerFromPreset(groq, new Set(['groq']))
    expect(second.id).toBe('groq-2')
    expect(second.name).toBe('Groq 2')
    expect(providerFromPreset(groq, new Set(['groq', 'groq-2'])).id).toBe('groq-3')
  })

  it('matches a configured provider back to its preset by id or base URL', () => {
    expect(presetForProvider({ id: 'groq', baseUrl: 'x' })?.id).toBe('groq')
    expect(presetForProvider({ id: 'mine', baseUrl: 'https://api.groq.com/openai/v1/' })?.id).toBe('groq')
    expect(presetForProvider({ id: 'mine', baseUrl: 'https://example.com' })).toBeUndefined()
  })

  it('filters by tier and searches names, blurbs, and models', () => {
    expect(searchCatalog('', 'local').every((p) => p.tier === 'local')).toBe(true)
    expect(searchCatalog('codestral', 'all').map((p) => p.id)).toContain('mistral')
    expect(searchCatalog('zzz-no-match', 'all')).toEqual([])
  })
})

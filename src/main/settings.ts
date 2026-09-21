import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppSettingsSchema, type AppSettings, type ProviderConfig } from '@shared/schemas'
import { DEFAULT_PROVIDERS } from './providers/registry'

interface EncryptedSecrets {
  apiKeys: Record<string, string>
}

/**
 * Lightweight JSON settings + Electron safeStorage for API keys.
 * (better-sqlite3 arrives in Phase 5 for agent memory/history.)
 */
export class SettingsStore {
  private settingsPath: string
  private secretsPath: string
  private settings: AppSettings
  private secrets: EncryptedSecrets

  constructor() {
    const userData = app.getPath('userData')
    if (!existsSync(userData)) {
      mkdirSync(userData, { recursive: true })
    }
    this.settingsPath = join(userData, 'settings.json')
    this.secretsPath = join(userData, 'secrets.bin')
    this.settings = this.loadSettings()
    this.secrets = this.loadSecrets()
    this.ensureDefaults()
  }

  getSettings(): AppSettings {
    return structuredClone(this.settings)
  }

  setSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = AppSettingsSchema.parse({ ...this.settings, ...partial })
    this.persistSettings()
    return this.getSettings()
  }

  listProviders(): ProviderConfig[] {
    return this.settings.providers.map((p) => ({
      ...p,
      hasApiKey: Boolean(this.secrets.apiKeys[p.id])
    }))
  }

  upsertProvider(
    config: Omit<ProviderConfig, 'hasApiKey'> & { hasApiKey?: boolean },
    apiKey?: string
  ): ProviderConfig {
    const existing = this.settings.providers.findIndex((p) => p.id === config.id)
    const next: ProviderConfig = {
      ...config,
      hasApiKey: Boolean(apiKey) || Boolean(this.secrets.apiKeys[config.id])
    }
    if (existing >= 0) {
      this.settings.providers[existing] = next
    } else {
      this.settings.providers.push(next)
    }
    if (!this.settings.activeProviderId) {
      this.settings.activeProviderId = next.id
    }
    if (apiKey !== undefined) {
      if (apiKey.length === 0) {
        delete this.secrets.apiKeys[config.id]
      } else {
        this.secrets.apiKeys[config.id] = apiKey
      }
      this.persistSecrets()
    }
    next.hasApiKey = Boolean(this.secrets.apiKeys[config.id])
    this.persistSettings()
    return { ...next }
  }

  deleteProvider(id: string): void {
    this.settings.providers = this.settings.providers.filter((p) => p.id !== id)
    delete this.secrets.apiKeys[id]
    if (this.settings.activeProviderId === id) {
      this.settings.activeProviderId = this.settings.providers[0]?.id ?? null
    }
    this.persistSettings()
    this.persistSecrets()
  }

  setApiKey(id: string, apiKey: string): void {
    if (apiKey.length === 0) {
      delete this.secrets.apiKeys[id]
    } else {
      this.secrets.apiKeys[id] = apiKey
    }
    const provider = this.settings.providers.find((p) => p.id === id)
    if (provider) {
      provider.hasApiKey = apiKey.length > 0
    }
    this.persistSecrets()
    this.persistSettings()
  }

  getApiKey(id: string): string | undefined {
    return this.secrets.apiKeys[id]
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this.listProviders().find((p) => p.id === id)
  }

  private ensureDefaults(): void {
    if (this.settings.providers.length === 0) {
      this.settings.providers = DEFAULT_PROVIDERS.map((p) => ({
        ...p,
        hasApiKey: false
      }))
      this.settings.activeProviderId = this.settings.providers[0]?.id ?? null
      this.persistSettings()
      return
    }

    // Prefer cloud Gemma as the default Ollama model for new sessions
    let changed = false
    for (const p of this.settings.providers) {
      if (p.id === 'ollama-local' && p.kind === 'ollama') {
        if (p.model === 'llama3.2' || p.model === 'llama3.2:latest') {
          p.model = 'gemma4:31b-cloud'
          p.visionEnabled = true
          p.name = 'Ollama'
          changed = true
        }
      }
    }
    if (!this.settings.activeProviderId) {
      this.settings.activeProviderId =
        this.settings.providers.find((p) => p.id === 'ollama-local')?.id ??
        this.settings.providers[0]?.id ??
        null
      changed = true
    }
    if (changed) this.persistSettings()
  }

  private loadSettings(): AppSettings {
    try {
      if (!existsSync(this.settingsPath)) {
        return AppSettingsSchema.parse({})
      }
      const raw = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as unknown
      return AppSettingsSchema.parse(raw)
    } catch {
      return AppSettingsSchema.parse({})
    }
  }

  private persistSettings(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8')
  }

  private loadSecrets(): EncryptedSecrets {
    try {
      if (!existsSync(this.secretsPath)) {
        return { apiKeys: {} }
      }
      if (!safeStorage.isEncryptionAvailable()) {
        const raw = JSON.parse(readFileSync(this.secretsPath, 'utf8')) as EncryptedSecrets
        return { apiKeys: raw.apiKeys ?? {} }
      }
      const encrypted = readFileSync(this.secretsPath)
      const decrypted = safeStorage.decryptString(encrypted)
      const raw = JSON.parse(decrypted) as EncryptedSecrets
      return { apiKeys: raw.apiKeys ?? {} }
    } catch {
      return { apiKeys: {} }
    }
  }

  private persistSecrets(): void {
    const payload = JSON.stringify(this.secrets)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(payload)
      writeFileSync(this.secretsPath, encrypted)
    } else {
      // Fallback for headless/CI — still never log the contents
      writeFileSync(this.secretsPath, payload, 'utf8')
    }
  }
}

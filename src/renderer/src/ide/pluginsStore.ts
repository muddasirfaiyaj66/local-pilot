import { create } from 'zustand'
import type { InstalledPlugin, PluginCommand, PluginManifest } from '@shared/plugins'

interface PluginsState {
  plugins: InstalledPlugin[]
  loaded: boolean
  error: string | null
  refresh: () => Promise<void>
  install: (manifest: unknown) => Promise<boolean>
  uninstall: (id: string) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  importFromFile: () => Promise<void>
}

export const usePluginsStore = create<PluginsState>((set, get) => ({
  plugins: [],
  loaded: false,
  error: null,
  refresh: async () => {
    try {
      set({ plugins: await window.localpilot.listPlugins(), loaded: true, error: null })
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : String(err) })
    }
  },
  install: async (manifest) => {
    const result = await window.localpilot.installPlugin(manifest)
    set({ error: result.ok ? null : (result.error ?? 'Install failed') })
    await get().refresh()
    return result.ok
  },
  uninstall: async (id) => {
    const result = await window.localpilot.uninstallPlugin(id)
    set({ error: result.ok ? null : (result.error ?? 'Uninstall failed') })
    await get().refresh()
  },
  setEnabled: async (id, enabled) => {
    // Optimistic: the toggle should feel instant even while MCP servers reconnect.
    set({ plugins: get().plugins.map((p) => (p.manifest.id === id ? { ...p, enabled } : p)) })
    const result = await window.localpilot.setPluginEnabled(id, enabled)
    set({ error: result.ok ? null : (result.error ?? 'Update failed') })
    await get().refresh()
  },
  importFromFile: async () => {
    const result = await window.localpilot.importPlugin()
    if (result.canceled) return
    set({ error: result.ok ? null : (result.error ?? 'Import failed') })
    await get().refresh()
  }
}))

export function enabledManifests(plugins: InstalledPlugin[]): PluginManifest[] {
  return plugins.filter((p) => p.enabled).map((p) => p.manifest)
}

export interface ResolvedCommand extends PluginCommand {
  /** Globally unique: `<pluginId>.<commandId>`. */
  key: string
  pluginName: string
}

export function enabledCommands(plugins: InstalledPlugin[]): ResolvedCommand[] {
  return plugins
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.manifest.contributes.commands.map((c) => ({
        ...c,
        key: `${p.manifest.id}.${c.id}`,
        pluginName: p.manifest.name
      }))
    )
}

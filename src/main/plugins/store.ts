import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILTIN_PLUGINS,
  PluginManifestSchema,
  type InstalledPlugin,
  type PluginManifest
} from '@shared/plugins'

export interface McpServerEntry {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpBridge {
  read: () => { servers: McpServerEntry[] }
  /** Persist and reconnect. */
  write: (config: { servers: McpServerEntry[] }) => Promise<void>
  workspace: () => string
}

interface PluginState {
  enabled: Record<string, boolean>
  /** MCP server names each plugin added, so disable removes only its own. */
  mcpOwned: Record<string, string[]>
}

const BUILTIN_IDS = new Set(BUILTIN_PLUGINS.map((p) => p.id))

/**
 * Installed plugins live as `<id>.json` (or `<id>/plugin.json` for hand-made
 * folders) in the plugins directory. Enabled state is kept separately so a
 * reinstall or manual edit keeps the user's choice.
 */
export class PluginStore {
  private readonly statePath: string

  constructor(
    private readonly dir: string,
    private readonly mcp: McpBridge
  ) {
    mkdirSync(dir, { recursive: true })
    this.statePath = join(dir, 'state.json')
  }

  list(): InstalledPlugin[] {
    const state = this.readState()
    const out: InstalledPlugin[] = []
    const seen = new Set<string>()
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      let file: string | null = null
      if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'state.json') {
        file = join(this.dir, entry.name)
      } else if (entry.isDirectory() && existsSync(join(this.dir, entry.name, 'plugin.json'))) {
        file = join(this.dir, entry.name, 'plugin.json')
      }
      if (!file) continue
      const manifest = this.readManifest(file)
      if (!manifest || seen.has(manifest.id)) continue
      seen.add(manifest.id)
      out.push({
        manifest,
        enabled: state.enabled[manifest.id] ?? true,
        builtin: BUILTIN_IDS.has(manifest.id)
      })
    }
    return out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  }

  async install(raw: unknown): Promise<InstalledPlugin> {
    const manifest = PluginManifestSchema.parse(raw)
    writeFileSync(this.fileFor(manifest.id), JSON.stringify(manifest, null, 2), 'utf8')
    const state = this.readState()
    const enabled = state.enabled[manifest.id] ?? true
    state.enabled[manifest.id] = enabled
    this.writeState(state)
    if (enabled) await this.syncMcp(manifest, true)
    return { manifest, enabled, builtin: BUILTIN_IDS.has(manifest.id) }
  }

  async uninstall(id: string): Promise<void> {
    const plugin = this.list().find((p) => p.manifest.id === id)
    if (!plugin) return
    await this.syncMcp(plugin.manifest, false)
    rmSync(this.fileFor(id), { force: true })
    const folder = join(this.dir, id)
    if (existsSync(join(folder, 'plugin.json'))) rmSync(folder, { recursive: true, force: true })
    const state = this.readState()
    delete state.enabled[id]
    delete state.mcpOwned[id]
    this.writeState(state)
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const plugin = this.list().find((p) => p.manifest.id === id)
    if (!plugin) throw new Error(`Plugin not installed: ${id}`)
    const state = this.readState()
    state.enabled[id] = enabled
    this.writeState(state)
    await this.syncMcp(plugin.manifest, enabled)
  }

  /** Add (enable) or remove (disable) this plugin's MCP servers in mcp.json. */
  private async syncMcp(manifest: PluginManifest, enable: boolean): Promise<void> {
    const servers = manifest.contributes.mcpServers
    if (servers.length === 0) return
    const state = this.readState()
    const config = this.mcp.read()
    const owned = new Set(state.mcpOwned[manifest.id] ?? [])
    let next = config.servers

    if (enable) {
      const workspace = this.mcp.workspace()
      for (const server of servers) {
        if (next.some((s) => s.name === server.name)) continue // user already has one
        next = [
          ...next,
          {
            name: server.name,
            command: server.command,
            args: server.args.map((arg) => arg.replaceAll('${workspace}', workspace || '.')),
            ...(server.env ? { env: server.env } : {})
          }
        ]
        owned.add(server.name)
      }
    } else {
      next = next.filter((s) => !owned.has(s.name))
      owned.clear()
    }

    if (next !== config.servers) await this.mcp.write({ servers: next })
    state.mcpOwned[manifest.id] = [...owned]
    this.writeState(state)
  }

  private fileFor(id: string): string {
    // ids are validated by the schema (no path separators); guard anyway.
    if (!/^[a-z0-9][a-z0-9-.]{1,63}$/.test(id) || id.includes('..')) {
      throw new Error(`Invalid plugin id: ${id}`)
    }
    return join(this.dir, `${id}.json`)
  }

  private readManifest(file: string): PluginManifest | null {
    try {
      return PluginManifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      return null
    }
  }

  private readState(): PluginState {
    try {
      const raw = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<PluginState>
      return { enabled: raw.enabled ?? {}, mcpOwned: raw.mcpOwned ?? {} }
    } catch {
      return { enabled: {}, mcpOwned: {} }
    }
  }

  private writeState(state: PluginState): void {
    writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8')
  }
}

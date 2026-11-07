import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_PLUGINS, PluginManifestSchema, renderPluginPrompt } from '@shared/plugins'
import { PluginStore, type McpServerEntry } from './store'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function setup(initial: McpServerEntry[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'lp-plugins-'))
  dirs.push(dir)
  let servers = initial
  const store = new PluginStore(dir, {
    read: () => ({ servers }),
    write: async (config) => {
      servers = config.servers
    },
    workspace: () => '/work/repo'
  })
  return { dir, store, servers: () => servers }
}

const gitPlugin = BUILTIN_PLUGINS.find((p) => p.id === 'lp.mcp-git')!

describe('built-in plugin catalog', () => {
  it('every built-in manifest validates', () => {
    for (const plugin of BUILTIN_PLUGINS) {
      expect(() => PluginManifestSchema.parse(plugin), plugin.id).not.toThrow()
    }
  })

  it('renders prompt placeholders', () => {
    expect(
      renderPluginPrompt('{{file}} ({{language}}): {{selection}} {{selection}}', {
        file: 'a.ts',
        language: 'typescript',
        selection: 'x'
      })
    ).toBe('a.ts (typescript): x x')
  })
})

describe('PluginStore', () => {
  it('installs, lists enabled, and uninstalls', async () => {
    const { store } = setup()
    await store.install(BUILTIN_PLUGINS[0])
    const listed = store.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ enabled: true, builtin: true })
    await store.uninstall(listed[0]!.manifest.id)
    expect(store.list()).toHaveLength(0)
  })

  it('rejects invalid manifests', async () => {
    const { store } = setup()
    await expect(store.install({ id: '../evil', name: 'x' })).rejects.toThrow()
  })

  it('ignores unreadable files in the plugins folder', () => {
    const { dir, store } = setup()
    writeFileSync(join(dir, 'broken.json'), '{nope', 'utf8')
    expect(store.list()).toEqual([])
  })

  it('adds MCP servers on enable with ${workspace} filled, removes them on disable', async () => {
    const { store, servers } = setup()
    await store.install(gitPlugin)
    expect(servers()).toEqual([
      { name: 'git', command: 'uvx', args: ['mcp-server-git', '--repository', '/work/repo'] }
    ])
    await store.setEnabled('lp.mcp-git', false)
    expect(servers()).toEqual([])
    expect(store.list()[0]?.enabled).toBe(false)
  })

  it('never removes a user server that shares the plugin server name', async () => {
    const mine = { name: 'git', command: 'my-git-mcp', args: [] }
    const { store, servers } = setup([mine])
    await store.install(gitPlugin)
    expect(servers()).toEqual([mine])
    await store.uninstall('lp.mcp-git')
    expect(servers()).toEqual([mine])
  })
})

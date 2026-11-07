import { create } from 'zustand'
import { languageForPath } from './codeUtils'

export interface EditorTab {
  path: string
  name: string
  language: string
  /** Content on disk as of the last load/save. */
  original: string
  value: string
  /** Truncated or binary files open read-only so a save can't corrupt them. */
  readOnly: boolean
  note?: string
}

export type SideView = 'explorer' | 'search' | 'extensions'

export interface CursorInfo {
  line: number
  column: number
  selected: number
}

const MAX_EDIT_CHARS = 2_000_000

interface IdeState {
  workspace: string
  tabs: EditorTab[]
  activePath: string | null
  sideView: SideView
  cursor: CursorInfo
  /** Line to reveal once the editor shows `path`. */
  reveal: { path: string; line: number; nonce: number } | null
  message: { text: string; tone: 'ok' | 'error' | 'info' } | null
  syncWorkspace: (workspace: string) => void
  setSideView: (view: SideView) => void
  setCursor: (cursor: CursorInfo) => void
  setMessage: (text: string, tone?: 'ok' | 'error' | 'info') => void
  openFile: (path: string, line?: number) => Promise<void>
  activate: (path: string) => void
  closeTab: (path: string) => void
  closeOthers: (path: string) => void
  closeAll: () => void
  setValue: (path: string, value: string) => void
  save: (path: string, valueOverride?: string) => Promise<boolean>
  saveAll: () => Promise<void>
  /** Re-read clean tabs whose file changed on disk (agent edits, git checkout). */
  refreshClean: () => Promise<void>
  onRenamed: (from: string, to: string) => void
  onDeleted: (path: string) => void
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

export const useIdeStore = create<IdeState>((set, get) => ({
  workspace: '',
  tabs: [],
  activePath: null,
  sideView: 'explorer',
  cursor: { line: 1, column: 1, selected: 0 },
  reveal: null,
  message: null,

  syncWorkspace: (workspace) => {
    if (workspace === get().workspace) return
    set({ workspace, tabs: [], activePath: null, reveal: null, message: null })
  },
  setSideView: (sideView) => set({ sideView }),
  setCursor: (cursor) => set({ cursor }),
  setMessage: (text, tone = 'info') => set({ message: { text, tone } }),

  openFile: async (path, line) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (!existing) {
      const result = await window.localpilot.readWorkspaceFile(path, MAX_EDIT_CHARS)
      if (!result.ok || result.text == null) {
        get().setMessage(result.error ?? `Could not open ${path}`, 'error')
        return
      }
      const readOnly = Boolean(result.truncated || result.binary)
      const tab: EditorTab = {
        path,
        name: basename(path),
        language: result.binary ? 'plaintext' : languageForPath(path),
        original: result.text,
        value: result.binary ? '' : result.text,
        readOnly,
        note: result.binary
          ? 'Binary file — not shown.'
          : result.truncated
            ? 'File is over 2M characters; showing the start read-only.'
            : undefined
      }
      // Re-check: another open may have raced us while reading.
      if (!get().tabs.some((t) => t.path === path)) set({ tabs: [...get().tabs, tab] })
    }
    set({
      activePath: path,
      reveal: line ? { path, line, nonce: Date.now() } : get().reveal
    })
  },

  activate: (path) => set({ activePath: path }),

  closeTab: (path) => {
    const { tabs, activePath } = get()
    const index = tabs.findIndex((t) => t.path === path)
    if (index < 0) return
    const next = tabs.filter((t) => t.path !== path)
    const neighbour = next[Math.min(index, next.length - 1)]
    set({ tabs: next, activePath: activePath === path ? (neighbour?.path ?? null) : activePath })
  },
  closeOthers: (path) => set({ tabs: get().tabs.filter((t) => t.path === path), activePath: path }),
  closeAll: () => set({ tabs: [], activePath: null }),

  setValue: (path, value) =>
    set({ tabs: get().tabs.map((t) => (t.path === path && !t.readOnly ? { ...t, value } : t)) }),

  save: async (path, valueOverride) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || tab.readOnly) return false
    const value = valueOverride ?? tab.value
    const result = await window.localpilot.writeWorkspaceFile(path, value)
    if (!result.ok) {
      get().setMessage(result.error ?? `Save failed: ${path}`, 'error')
      return false
    }
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, value, original: value } : t))
    })
    get().setMessage(`Saved ${tab.name}`, 'ok')
    return true
  },

  saveAll: async () => {
    for (const tab of get().tabs) {
      if (!tab.readOnly && tab.value !== tab.original) await get().save(tab.path)
    }
  },

  refreshClean: async () => {
    for (const tab of get().tabs) {
      if (tab.readOnly || tab.value !== tab.original) continue
      const result = await window.localpilot.readWorkspaceFile(tab.path, MAX_EDIT_CHARS)
      if (!result.ok || result.text == null || result.truncated || result.binary) continue
      if (result.text === tab.original) continue
      const fresh = get().tabs.find((t) => t.path === tab.path)
      // Skip if the user started typing while we read.
      if (!fresh || fresh.value !== fresh.original) continue
      set({
        tabs: get().tabs.map((t) =>
          t.path === tab.path ? { ...t, original: result.text!, value: result.text! } : t
        )
      })
    }
  },

  onRenamed: (from, to) => {
    const remap = (p: string): string =>
      p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p
    set({
      tabs: get().tabs.map((t) => {
        const path = remap(t.path)
        return path === t.path ? t : { ...t, path, name: basename(path), language: languageForPath(path) }
      }),
      activePath: get().activePath ? remap(get().activePath!) : null
    })
  },

  onDeleted: (path) => {
    const gone = (p: string): boolean => p === path || p.startsWith(`${path}/`)
    const tabs = get().tabs.filter((t) => !gone(t.path))
    const active = get().activePath
    set({ tabs, activePath: active && gone(active) ? (tabs[0]?.path ?? null) : active })
  }
}))

export function isDirty(tab: EditorTab): boolean {
  return !tab.readOnly && tab.value !== tab.original
}

import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Minimal Electron stub for Vitest (main-process APIs used by tools). */
export const app = {
  getPath: (name: string): string => {
    if (name === 'userData') return join(tmpdir(), 'localpilot-vitest-userdata')
    return tmpdir()
  },
  getVersion: (): string => '0.0.0-test',
  isPackaged: false
}

export const screen = {
  getPrimaryDisplay: () => ({
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    size: { width: 1920, height: 1080 }
  }),
  getAllDisplays: () => [screen.getPrimaryDisplay()]
}

export const desktopCapturer = {
  getSources: async () => [] as Array<{ id: string; name: string; thumbnail: { toDataURL: () => string } }>
}

export const BrowserWindow = class {
  static getAllWindows(): unknown[] {
    return []
  }
}

export const ipcMain = {
  handle: (): void => undefined,
  on: (): void => undefined
}

export const dialog = {
  showMessageBox: async () => ({ response: 0 })
}

export const shell = {
  openExternal: async (): Promise<void> => undefined
}

export default { app, screen, desktopCapturer, BrowserWindow, ipcMain, dialog, shell }

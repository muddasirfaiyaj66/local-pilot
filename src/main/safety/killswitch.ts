import { globalShortcut, BrowserWindow } from 'electron'

const ACCELERATOR = 'CommandOrControl+Shift+Escape'

let registered = false

export function registerKillSwitch(onKill: () => void): void {
  if (registered) return
  const ok = globalShortcut.register(ACCELERATOR, () => {
    onKill()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('agent:kill')
      }
    }
  })
  registered = ok
  if (!ok) {
    console.warn(`[LocalPilot] Failed to register kill switch ${ACCELERATOR}`)
  }
}

export function unregisterKillSwitch(): void {
  if (!registered) return
  globalShortcut.unregister(ACCELERATOR)
  registered = false
}

export function getKillSwitchAccelerator(): string {
  return ACCELERATOR
}

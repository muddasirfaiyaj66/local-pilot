import { globalShortcut, BrowserWindow } from 'electron'

/**
 * Ctrl/Cmd+Shift+Escape is reserved on Windows (Task Manager) and cannot be
 * registered via Electron globalShortcut. Prefer a free chord; keep Escape as
 * a non-Windows candidate for familiarity.
 */
const CANDIDATES =
  process.platform === 'win32'
    ? (['CommandOrControl+Shift+Period', 'CommandOrControl+Alt+Period', 'CommandOrControl+Shift+K'] as const)
    : ([
        'CommandOrControl+Shift+Escape',
        'CommandOrControl+Shift+Period',
        'CommandOrControl+Alt+Period'
      ] as const)

let registeredAccelerator: string | null = null

function labelFor(accelerator: string): string {
  const isMac = process.platform === 'darwin'
  return accelerator
    .replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
    .replace('Period', '.')
    .replace(/\+/g, '+')
}

export function registerKillSwitch(onKill: () => void): void {
  if (registeredAccelerator) return

  const handler = (): void => {
    onKill()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('agent:kill')
      }
    }
  }

  for (const accelerator of CANDIDATES) {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) {
      registeredAccelerator = accelerator
      console.log(`[LocalPilot] Kill switch registered: ${labelFor(accelerator)}`)
      return
    }
  }

  console.warn(
    `[LocalPilot] Failed to register kill switch (tried ${CANDIDATES.map(labelFor).join(', ')})`
  )
}

export function unregisterKillSwitch(): void {
  if (!registeredAccelerator) return
  globalShortcut.unregister(registeredAccelerator)
  registeredAccelerator = null
}

export function getKillSwitchAccelerator(): string {
  return registeredAccelerator ?? CANDIDATES[0]!
}

export function getKillSwitchLabel(): string {
  return labelFor(getKillSwitchAccelerator())
}

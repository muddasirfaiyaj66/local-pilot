import { globalShortcut, BrowserWindow } from 'electron'

/**
 * Ctrl/Cmd+Shift+Escape is reserved on Windows (Task Manager).
 * Electron accelerators use `.` for the period key — not the word "Period".
 */
const CANDIDATES =
  process.platform === 'win32'
    ? (['CommandOrControl+Shift+.', 'CommandOrControl+Alt+.', 'CommandOrControl+Shift+K'] as const)
    : ([
        'CommandOrControl+Shift+Escape',
        'CommandOrControl+Shift+.',
        'CommandOrControl+Alt+.'
      ] as const)

let registeredAccelerator: string | null = null

function labelFor(accelerator: string): string {
  const isMac = process.platform === 'darwin'
  return accelerator
    .replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
    .replace('Escape', 'Esc')
}

function tryRegister(accelerator: string, handler: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, handler)
  } catch (err) {
    console.warn(
      `[LocalPilot] Kill switch rejected ${labelFor(accelerator)}:`,
      err instanceof Error ? err.message : err
    )
    return false
  }
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
    if (tryRegister(accelerator, handler)) {
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
  try {
    globalShortcut.unregister(registeredAccelerator)
  } catch {
    /* ignore */
  }
  registeredAccelerator = null
}

export function getKillSwitchAccelerator(): string {
  return registeredAccelerator ?? CANDIDATES[0]!
}

export function getKillSwitchLabel(): string {
  return labelFor(getKillSwitchAccelerator())
}

import { app, dialog, type BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

let configured = false

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (configured || is.dev) return
  configured = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow()
    const opts = {
      type: 'info' as const,
      title: 'Update available',
      message: `LocalPilot ${info.version} is available and will download in the background.`,
      buttons: ['OK']
    }
    void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow()
    const opts = {
      type: 'info' as const,
      title: 'Update ready',
      message: `LocalPilot ${info.version} downloaded. Restart to install?`,
      buttons: ['Restart', 'Later'],
      defaultId: 0,
      cancelId: 1
    }
    void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    console.warn('[LocalPilot] auto-updater error', err.message)
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.warn('[LocalPilot] update check skipped', err)
    })
  }, 8_000)
}

export async function checkForUpdatesNow(): Promise<{
  status: 'dev' | 'checking' | 'available' | 'not-available' | 'error'
  version?: string
  message?: string
}> {
  if (is.dev) {
    return { status: 'dev', message: 'Updates are disabled in development builds.' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo?.version) {
      return { status: 'not-available' }
    }
    const latest = result.updateInfo.version
    if (latest === app.getVersion()) {
      return { status: 'not-available', version: latest }
    }
    return { status: 'available', version: latest }
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

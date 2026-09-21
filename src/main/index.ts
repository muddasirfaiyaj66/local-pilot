import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { SettingsStore } from './settings'
import { abortAllStreams, registerIpcHandlers } from './ipc/handlers'
import { registerKillSwitch, unregisterKillSwitch } from './safety/killswitch'

let mainWindow: BrowserWindow | null = null

function resolveIconPath(): string {
  if (is.dev) {
    return join(app.getAppPath(), 'build', 'icon.png')
  }
  return join(process.resourcesPath, 'icon.png')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: 'LocalPilot',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    icon: resolveIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.localpilot.app')

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const settingsStore = new SettingsStore()
  registerIpcHandlers(settingsStore)
  registerKillSwitch(() => {
    abortAllStreams()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  void import('./tools/mcp').then(async ({ loadMcpTools }) => {
    const { refreshDynamicTools } = await import('./tools/registry')
    try {
      const tools = await loadMcpTools()
      refreshDynamicTools(tools)
      if (tools.length > 0) console.log(`[LocalPilot] MCP: ${tools.length} tool(s)`)
    } catch (err) {
      console.warn('[LocalPilot] MCP load skipped', err)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  abortAllStreams()
  unregisterKillSwitch()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  abortAllStreams()
  unregisterKillSwitch()
  void import('./tools/browserSession').then(({ browserSession }) => browserSession.close())
  void import('./tools/mcp').then(({ closeMcpConnections }) => closeMcpConnections())
})

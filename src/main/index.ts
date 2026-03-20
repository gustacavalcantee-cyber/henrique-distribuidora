import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerAllHandlers } from './handlers'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // In dev, don't check for updates
  if (is.dev) return

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send(IPC.UPDATE_PROGRESS, { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send(IPC.UPDATE_ERROR, { message: err.message })
  })

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register IPC handlers before app is ready
registerAllHandlers()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.henrique.vendas')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  runMigrations()
  seedIfEmpty()
  createWindow()
  setupAutoUpdater()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

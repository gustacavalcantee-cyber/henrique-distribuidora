import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { config as loadEnv } from 'dotenv'
import { registerAllHandlers } from './handlers'
import { setDownloadedUpdatePath } from './handlers/atualizacao'
import { closeDb } from './db/client-local'
import { seedFromSupabase } from './db/seed-from-supabase'
import { startSync, setSyncWindow } from './sync/sync.service'
import { IPC } from '../shared/ipc-channels'

// Load .env.local in dev mode
if (process.env['NODE_ENV'] !== 'production') {
  loadEnv({ path: join(__dirname, '../../src/main/db/.env.local') })
}

let mainWindow: BrowserWindow | null = null

function removeQuarentena(): void {
  if (process.platform !== 'darwin') return
  try {
    const exePath = app.getPath('exe')
    const match = exePath.match(/^(.+\.app)/)
    if (!match) return
    const appBundle = match[1]
    execSync(`xattr -dr com.apple.quarantine "${appBundle}"`, { stdio: 'pipe' })
  } catch { /* ignora erros — não crítico */ }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin'

  if (is.dev) return

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send(IPC.UPDATE_PROGRESS, { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    const filePath = (info as unknown as { downloadedFile?: string }).downloadedFile ?? null
    setDownloadedUpdatePath(filePath)
    mainWindow?.webContents.send(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send(IPC.UPDATE_ERROR, { message: err.message })
  })

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
    setSyncWindow(mainWindow!)
    // Seed first (no-op if already seeded), then start bidirectional sync + Realtime
    seedFromSupabase()
      .then(() => startSync(mainWindow!))
      .catch((err: Error) => console.error('[sync] startup failed:', err.message))
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

ipcMain.on('get:version', (event) => {
  event.returnValue = app.getVersion()
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.henrique.vendas')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  removeQuarentena()
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

app.on('before-quit', () => {
  closeDb()
})

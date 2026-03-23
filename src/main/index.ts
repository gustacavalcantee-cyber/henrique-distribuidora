import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerAllHandlers } from './handlers'
import { setDownloadedUpdatePath } from './handlers/atualizacao'
import { getDbPath, reloadDb, closeDb } from './db/client'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null

/**
 * Remove o atributo de quarentena do macOS (Gatekeeper) do próprio app.
 * Isso evita o aviso "A Apple não pôde verificar..." em apps não assinados com Developer ID.
 * Roda silenciosamente — não faz nada em Windows/Linux ou se já removido.
 */
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

function startDbWatcher(): void {
  const dbPath = getDbPath()
  let lastMtime = 0
  try {
    lastMtime = statSync(dbPath).mtimeMs
  } catch { /* arquivo ainda não existe */ }

  // Poll every 8 s — fast enough to catch Google Drive sync within seconds
  setInterval(() => {
    try {
      const mtime = statSync(dbPath).mtimeMs
      if (mtime !== lastMtime && lastMtime !== 0) {
        lastMtime = mtime
        reloadDb()
        mainWindow?.webContents.send(IPC.DB_SYNCED)
      } else {
        lastMtime = mtime
      }
    } catch { /* ignora — arquivo temporariamente inacessível durante sync */ }
  }, 8_000)
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  // No macOS, não usamos quitAndInstall (Squirrel.Mac requer Apple Developer ID)
  // O DMG baixado é aberto no Finder para instalação manual
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

  // Verifica ao abrir e a cada 4 horas
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

// Sync IPC so preload can read the real app version in packaged builds
ipcMain.on('get:version', (event) => {
  event.returnValue = app.getVersion()
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.henrique.vendas')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  removeQuarentena()
  runMigrations()
  seedIfEmpty()
  createWindow()
  setupAutoUpdater()
  startDbWatcher()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Flush DB to disk before the process exits so Google Drive syncs the latest data
app.on('before-quit', () => {
  closeDb()
})

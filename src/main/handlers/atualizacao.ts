import { ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../shared/ipc-channels'

// Caminho do arquivo baixado — definido por index.ts quando o download completa
let _downloadedUpdatePath: string | null = null
export function setDownloadedUpdatePath(p: string | null) { _downloadedUpdatePath = p }

export function registerAtualizacaoHandlers(): void {
  // Trigger install:
  // - macOS: abre o DMG baixado no Finder (Squirrel.Mac requer Apple Developer ID — evitado)
  // - Windows: quitAndInstall normal
  ipcMain.handle(IPC.UPDATE_INSTALL, async () => {
    if (process.platform === 'darwin') {
      if (_downloadedUpdatePath) {
        await shell.openPath(_downloadedUpdatePath)
      } else {
        shell.openExternal('https://github.com/gustacavalcantee-cyber/henrique-distribuidora/releases/latest')
      }
      return { ok: true }
    }
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  // Manual check trigger from renderer
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, erro: String(err) }
    }
  })
}

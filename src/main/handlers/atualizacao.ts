import { ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../shared/ipc-channels'

export function registerAtualizacaoHandlers(): void {
  // Trigger install: on Windows quits and installs; on Mac opens the downloaded DMG
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
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

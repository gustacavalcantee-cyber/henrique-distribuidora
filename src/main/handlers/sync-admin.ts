import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { forcePullAndNotify, getMainWindow } from '../sync/sync.service'

export function registerSyncAdminHandlers(): void {
  ipcMain.handle(IPC.SYNC_FORCE_PULL, async () => {
    const win = getMainWindow()
    if (!win) return { ok: false, error: 'Janela não disponível' }
    try {
      await forcePullAndNotify(win)
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

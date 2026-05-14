import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { forcePullAndNotify, triggerSync, getMainWindow } from '../sync/sync.service'
import { getRawSqlite } from '../db/client-local'

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

  // Force re-push all pedidos: marks every pedido as synced=0 so the next sync
  // cycle re-sends all local items to Supabase. Use on the machine that has the
  // correct quantities to recover from a data-loss scenario.
  ipcMain.handle(IPC.SYNC_FORCE_REPUSH, () => {
    const sqlite = getRawSqlite()
    sqlite.prepare('UPDATE pedidos SET synced = 0 WHERE synced = 1').run()
    triggerSync(getMainWindow() ?? undefined)
    return { ok: true }
  })
}

/**
 * rede_col_order — single source of truth for column display order per rede.
 *
 * One row per rede. Stores the ordered list of produto IDs that defines the
 * column sequence shown in the Lançamentos grid AND printed on notes. Every
 * time the user reorders, adds, or removes a column this record is updated so
 * both the grid and the print always stay in sync.
 */
import { ipcMain } from 'electron'
import { getRawSqlite } from '../db/client-local'
import { IPC } from '../../shared/ipc-channels'
import { triggerSync, getMainWindow } from '../sync/sync.service'

export function registerRedeColOrderHandlers() {
  ipcMain.handle(IPC.REDE_COL_ORDER_GET, (_event, redeId: number) => {
    const row = getRawSqlite()
      .prepare('SELECT produto_ids FROM rede_col_order WHERE rede_id = ?')
      .get(redeId) as { produto_ids: string } | undefined
    return row?.produto_ids ?? null
  })

  ipcMain.handle(IPC.REDE_COL_ORDER_SET, (_event, redeId: number, produtoIds: number[]) => {
    getRawSqlite().prepare(
      `INSERT INTO rede_col_order (rede_id, produto_ids, synced, updated_at)
       VALUES (?, ?, 0, datetime('now'))
       ON CONFLICT(rede_id) DO UPDATE SET
         produto_ids = excluded.produto_ids,
         synced = 0,
         updated_at = datetime('now')`
    ).run(redeId, JSON.stringify(produtoIds))
    triggerSync(getMainWindow() ?? undefined)
    return { redeId }
  })
}

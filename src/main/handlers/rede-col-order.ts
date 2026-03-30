/**
 * rede_col_order — single source of truth for column display order per rede.
 *
 * One row per rede. Stores the ordered list of produto IDs that defines the
 * column sequence shown in the Lançamentos grid AND printed on notes. Every
 * time the user reorders, adds, or removes a column this record is updated so
 * both the grid and the print always stay in sync.
 */
/**
 * rede_col_order — local-only cache of column display order per rede.
 *
 * This table exists ONLY in local SQLite (not in Supabase). It is used as a
 * hint by the print service when printing from Histórico (where the live
 * Lançamentos column order is unavailable). The grid and Lançamentos prints
 * always pass colOrder directly from the renderer, bypassing this table.
 *
 * Because the Supabase counterpart doesn't exist, synced is always set to 1
 * so the push loop never tries to push these rows (avoiding silent failures).
 */
import { ipcMain } from 'electron'
import { getRawSqlite } from '../db/client-local'
import { IPC } from '../../shared/ipc-channels'

export function registerRedeColOrderHandlers() {
  ipcMain.handle(IPC.REDE_COL_ORDER_GET, (_event, redeId: number) => {
    const row = getRawSqlite()
      .prepare('SELECT produto_ids FROM rede_col_order WHERE rede_id = ?')
      .get(redeId) as { produto_ids: string } | undefined
    return row?.produto_ids ?? null
  })

  ipcMain.handle(IPC.REDE_COL_ORDER_SET, (_event, redeId: number, produtoIds: number[]) => {
    // synced = 1: this is a local-only table — no Supabase push needed
    getRawSqlite().prepare(
      `INSERT INTO rede_col_order (rede_id, produto_ids, synced, updated_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(rede_id) DO UPDATE SET
         produto_ids = excluded.produto_ids,
         synced = 1,
         updated_at = datetime('now')`
    ).run(redeId, JSON.stringify(produtoIds))
    return { redeId }
  })
}

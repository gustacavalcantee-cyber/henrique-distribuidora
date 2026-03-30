/**
 * print_order — source of truth for print product list + order per loja.
 *
 * One row per (rede_id, loja_id). Stores the exact ordered list of produto IDs
 * that will appear on this loja's printed note. Updated automatically whenever
 * the user toggles, reorders, or removes product columns in Lançamentos.
 *
 * The print service reads this table first — if found, it uses this list directly
 * (no need to reconcile layout_config + rede_col_order + frontend colOrder).
 *
 * This table is local-only (not synced to Supabase).
 */
import { ipcMain } from 'electron'
import { getRawSqlite } from '../db/client-local'
import { IPC } from '../../shared/ipc-channels'

export function registerPrintOrderHandlers() {
  ipcMain.handle(IPC.PRINT_ORDER_GET, (_event, redeId: number, lojaId: number) => {
    const row = getRawSqlite()
      .prepare('SELECT produto_ids FROM print_order WHERE rede_id = ? AND loja_id = ?')
      .get(redeId, lojaId) as { produto_ids: string } | undefined
    return row?.produto_ids ?? null
  })

  ipcMain.handle(IPC.PRINT_ORDER_SAVE, (_event, redeId: number, lojaId: number, produtoIds: number[]) => {
    getRawSqlite().prepare(
      `INSERT INTO print_order (rede_id, loja_id, produto_ids, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(rede_id, loja_id) DO UPDATE SET
         produto_ids = excluded.produto_ids,
         updated_at = datetime('now')`
    ).run(redeId, lojaId, JSON.stringify(produtoIds))
    return { redeId, lojaId }
  })
}

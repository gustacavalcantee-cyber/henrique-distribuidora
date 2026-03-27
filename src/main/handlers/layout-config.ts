import { ipcMain } from 'electron'
import { getRawSqlite } from '../db/client-local'
import { IPC } from '../../shared/ipc-channels'
import { triggerSync, getMainWindow } from '../sync/sync.service'

export function registerLayoutConfigHandlers() {
  ipcMain.handle(IPC.LAYOUT_GET, (_event, redeId: number, lojaId: number) => {
    const row = getRawSqlite()
      .prepare('SELECT produto_ids FROM layout_config WHERE rede_id = ? AND loja_id = ?')
      .get(redeId, lojaId) as { produto_ids: string } | undefined
    return row?.produto_ids ?? null
  })

  ipcMain.handle(IPC.LAYOUT_SET, (_event, redeId: number, lojaId: number, produtoIds: number[]) => {
    getRawSqlite().prepare(
      `INSERT INTO layout_config (rede_id, loja_id, produto_ids, synced, updated_at)
       VALUES (?, ?, ?, 0, datetime('now'))
       ON CONFLICT(rede_id, loja_id) DO UPDATE SET
         produto_ids = excluded.produto_ids,
         synced = 0,
         updated_at = datetime('now')`
    ).run(redeId, lojaId, JSON.stringify(produtoIds))
    triggerSync(getMainWindow() ?? undefined)
    return { redeId, lojaId }
  })
}

import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb, getRawSqlite } from '../db/client-local'
import { configuracoes } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'
import { triggerSync, getMainWindow } from '../sync/sync.service'

export function registerConfiguracoesHandlers() {
  ipcMain.handle(IPC.CONFIG_GET, (_event, chave: string) => {
    const row = getDb().select().from(configuracoes).where(eq(configuracoes.chave, chave)).limit(1).all()[0]
    return row?.valor ?? null
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, chave: string, valor: string) => {
    // Mark synced=0 so this key gets pushed to Supabase on next sync
    getRawSqlite().prepare(
      `INSERT INTO configuracoes (chave, valor, synced, updated_at)
       VALUES (?, ?, 0, datetime('now'))
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, synced = 0, updated_at = datetime('now')`
    ).run(chave, valor)
    triggerSync(getMainWindow() ?? undefined)
    return { chave, valor }
  })
}

import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { configuracoes } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerConfiguracoesHandlers() {
  ipcMain.handle(IPC.CONFIG_GET, async (_event, chave: string) => {
    const db = await getDb()
    const row = (await db.select().from(configuracoes).where(eq(configuracoes.chave, chave)).limit(1))[0]
    return row?.valor ?? null
  })

  ipcMain.handle(IPC.CONFIG_SET, async (_event, chave: string, valor: string) => {
    const db = await getDb()
    return (await db.insert(configuracoes)
      .values({ chave, valor })
      .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } })
      .returning())[0]
  })
}

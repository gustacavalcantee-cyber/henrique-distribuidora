import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { configuracoes } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

export function registerConfiguracoesHandlers() {
  ipcMain.handle(IPC.CONFIG_GET, (_event, chave: string) => {
    const row = getDb().select().from(configuracoes).where(eq(configuracoes.chave, chave)).limit(1).all()[0]
    return row?.valor ?? null
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, chave: string, valor: string) =>
    getDb().insert(configuracoes).values({ chave, valor })
      .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } })
      .returning().all()[0]
  )
}

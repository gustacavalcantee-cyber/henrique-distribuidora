import { ipcMain } from 'electron'
import { eq, or, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { produtos } from '../db/schema'
import { IPC } from '../../shared/ipc-channels'

export function registerProdutosHandlers() {
  // Lists products for a rede (rede-specific + global products with rede_id=NULL)
  ipcMain.handle(IPC.PRODUTOS_LIST, (_event, rede_id?: number) => {
    const db = getDb()
    if (rede_id !== undefined) {
      return db.select().from(produtos)
        .where(or(eq(produtos.rede_id, rede_id), isNull(produtos.rede_id)))
        .orderBy(produtos.ordem_exibicao)
        .all()
    }
    return db.select().from(produtos).orderBy(produtos.ordem_exibicao).all()
  })

  ipcMain.handle(IPC.PRODUTOS_CREATE, (_event, data: { nome: string; unidade: string; rede_id?: number; ordem_exibicao?: number }) => {
    return getDb().insert(produtos).values(data).returning().all()[0]
  })

  ipcMain.handle(IPC.PRODUTOS_UPDATE, (_event, data: { id: number; nome?: string; unidade?: string; ordem_exibicao?: number; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(produtos).set(updates).where(eq(produtos.id, id)).returning().all()[0]
  })
}

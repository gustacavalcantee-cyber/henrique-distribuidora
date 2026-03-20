import { ipcMain } from 'electron'
import { eq, or, isNull, and } from 'drizzle-orm'
import { getDb } from '../db/client'
import { produtos } from '../db/schema'
import { IPC } from '../../shared/ipc-channels'

export function registerProdutosHandlers() {
  // Lists active products (ativo=1). If rede_id given, returns rede-specific + global products.
  ipcMain.handle(IPC.PRODUTOS_LIST, (_event, rede_id?: number) => {
    const db = getDb()
    if (rede_id !== undefined) {
      return db.select().from(produtos)
        .where(and(eq(produtos.ativo, 1), or(eq(produtos.rede_id, rede_id), isNull(produtos.rede_id))))
        .orderBy(produtos.ordem_exibicao)
        .all()
    }
    return db.select().from(produtos).where(eq(produtos.ativo, 1)).orderBy(produtos.ordem_exibicao).all()
  })

  ipcMain.handle(IPC.PRODUTOS_CREATE, (_event, data: { nome: string; unidade: string; rede_id?: number; ordem_exibicao?: number }) => {
    return getDb().insert(produtos).values(data).returning().all()[0]
  })

  ipcMain.handle(IPC.PRODUTOS_UPDATE, (_event, data: { id: number; nome?: string; unidade?: string; ordem_exibicao?: number; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(produtos).set(updates).where(eq(produtos.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.PRODUTOS_DELETE, (_event, id: number) => {
    return getDb().delete(produtos).where(eq(produtos.id, id)).returning().all()[0]
  })
}

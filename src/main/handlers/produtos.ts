import { ipcMain } from 'electron'
import { eq, or, isNull, and, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { produtos, pedidos, itensPedido } from '../db/schema'
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

  // Returns distinct products that have appeared in actual orders for a given rede
  ipcMain.handle(IPC.PRODUTOS_COM_PEDIDOS_NA_REDE, (_event, rede_id: number) => {
    const db = getDb()
    // Get distinct produto_ids from itens_pedido joined with pedidos filtered by rede_id
    const rows = db
      .select({ produto_id: itensPedido.produto_id })
      .from(itensPedido)
      .innerJoin(pedidos, eq(itensPedido.pedido_id, pedidos.id))
      .where(eq(pedidos.rede_id, rede_id))
      .all()

    const ids = [...new Set(rows.map((r) => r.produto_id).filter((id): id is number => id !== null))]
    if (ids.length === 0) return []

    return db
      .select()
      .from(produtos)
      .where(and(eq(produtos.ativo, 1), inArray(produtos.id, ids)))
      .orderBy(produtos.ordem_exibicao)
      .all()
  })
}

import { ipcMain } from 'electron'
import { eq, or, isNull, and, inArray } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { produtos, pedidos, itensPedido } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerProdutosHandlers() {
  // Lists active products (ativo=1). If rede_id given, returns rede-specific + global products.
  ipcMain.handle(IPC.PRODUTOS_LIST, async (_event, rede_id?: number) => {
    const db = await getDb()
    if (rede_id !== undefined) {
      return db.select().from(produtos)
        .where(and(eq(produtos.ativo, 1), or(eq(produtos.rede_id, rede_id), isNull(produtos.rede_id))))
        .orderBy(produtos.ordem_exibicao)
    }
    return db.select().from(produtos).where(eq(produtos.ativo, 1)).orderBy(produtos.ordem_exibicao)
  })

  ipcMain.handle(IPC.PRODUTOS_CREATE, async (_event, data: { nome: string; unidade: string; rede_id?: number; ordem_exibicao?: number }) => {
    const db = await getDb()
    return (await db.insert(produtos).values(data).returning())[0]
  })

  ipcMain.handle(IPC.PRODUTOS_UPDATE, async (_event, data: { id: number; nome?: string; unidade?: string; ordem_exibicao?: number; ativo?: number }) => {
    const { id, ...updates } = data
    const db = await getDb()
    return (await db.update(produtos).set(updates).where(eq(produtos.id, id)).returning())[0]
  })

  ipcMain.handle(IPC.PRODUTOS_DELETE, async (_event, id: number) => {
    const db = await getDb()
    return (await db.delete(produtos).where(eq(produtos.id, id)).returning())[0]
  })

  // Returns distinct products that have appeared in actual orders for a given rede
  ipcMain.handle(IPC.PRODUTOS_COM_PEDIDOS_NA_REDE, async (_event, rede_id: number) => {
    const db = await getDb()
    // Get distinct produto_ids from itens_pedido joined with pedidos filtered by rede_id
    const rows = await db
      .select({ produto_id: itensPedido.produto_id })
      .from(itensPedido)
      .innerJoin(pedidos, eq(itensPedido.pedido_id, pedidos.id))
      .where(eq(pedidos.rede_id, rede_id))

    const ids = [...new Set(rows.map((r) => r.produto_id).filter((id): id is number => id !== null))]
    if (ids.length === 0) return []

    return db
      .select()
      .from(produtos)
      .where(and(eq(produtos.ativo, 1), inArray(produtos.id, ids)))
      .orderBy(produtos.ordem_exibicao)
  })
}

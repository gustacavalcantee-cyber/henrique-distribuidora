import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { pedidos, itensPedido } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { IPC } from '../../shared/ipc-channels'

export function registerEstoqueHandlers() {
  ipcMain.handle(IPC.ESTOQUE_QUANTIDADES_DIA, (_event, data: string, produtoIds: number[]) => {
    if (!produtoIds || produtoIds.length === 0) return {}

    const db = getDb()

    // Get all pedidos for the date
    const pedidosDia = db.select().from(pedidos).where(eq(pedidos.data_pedido, data)).all()
    if (pedidosDia.length === 0) return {}

    const pedidoIds = pedidosDia.map(p => p.id)

    // Get all items for these pedidos filtered to requested products
    const itens = db
      .select()
      .from(itensPedido)
      .where(inArray(itensPedido.pedido_id, pedidoIds))
      .all()
      .filter(i => produtoIds.includes(i.produto_id!))

    // Build rede_id → produto_id → total
    const result: Record<number, Record<number, number>> = {}
    for (const item of itens) {
      const pedido = pedidosDia.find(p => p.id === item.pedido_id)
      if (!pedido?.rede_id || !item.produto_id) continue
      if (!result[pedido.rede_id]) result[pedido.rede_id] = {}
      result[pedido.rede_id][item.produto_id] = (result[pedido.rede_id][item.produto_id] ?? 0) + item.quantidade
    }

    return result
  })
}

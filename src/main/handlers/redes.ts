import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb, getRawSqlite } from '../db/client-local'
import { redes, lojas, pedidos, itensPedido } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'
import { pushDeleteRede } from '../sync/sync.service'

export function registerRedesHandlers() {
  ipcMain.handle(IPC.REDES_LIST, () => getDb().select().from(redes).all())

  ipcMain.handle(IPC.REDES_CREATE, (_event, data: { nome: string; cor_tema: string }) =>
    getDb().insert(redes).values({ ...data, synced: 0 }).returning().all()[0]
  )

  ipcMain.handle(IPC.REDES_UPDATE, (_event, data: { id: number; nome?: string; cor_tema?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(redes).set({ ...updates, synced: 0 }).where(eq(redes.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.REDES_DELETE, async (_event, id: number) => {
    const db = getDb()

    // Count lojas and pedidos linked to this rede
    const lojasList = db.select().from(lojas).where(eq(lojas.rede_id, id)).all()
    const pedidosList = db.select().from(pedidos).where(eq(pedidos.rede_id, id)).all()

    // Check if any pedidos have real items
    const pedidoIds = pedidosList.map(p => p.id)
    const hasItens = pedidoIds.length > 0 && pedidoIds.some(pedidoId => {
      const itens = db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedidoId)).all()
      return itens.some(i => i.quantidade > 0)
    })

    if (hasItens) {
      return {
        ok: false,
        error: `Esta rede possui ${pedidosList.length} pedido(s) com lançamentos. Não é possível excluir redes com histórico de vendas.`,
      }
    }

    // Push deletion to Supabase first (soft-delete lojas, then delete rede)
    // Errors are non-fatal — local deletion proceeds regardless
    try {
      await pushDeleteRede(id)
    } catch (err) {
      console.warn('[redes] pushDeleteRede error (non-fatal):', (err as Error).message)
    }

    // Cascade delete locally — disable FK temporarily to avoid constraint errors
    // (precos/layout_config reference lojas; lojas reference redes)
    const sqlite = getRawSqlite()
    sqlite.pragma('foreign_keys = OFF')
    try {
      sqlite.transaction(() => {
        const lojaIds = lojasList.map(l => l.id)
        // Delete precos and layout configs for these lojas
        if (lojaIds.length > 0) {
          sqlite.prepare(`DELETE FROM precos WHERE loja_id IN (${lojaIds.map(() => '?').join(',')})`).run(...lojaIds)
          sqlite.prepare(`DELETE FROM layout_config WHERE loja_id IN (${lojaIds.map(() => '?').join(',')})`).run(...lojaIds)
          sqlite.prepare(`DELETE FROM print_order WHERE loja_id IN (${lojaIds.map(() => '?').join(',')})`).run(...lojaIds)
        }
        // Delete empty pedido items and pedidos
        for (const pedidoId of pedidoIds) {
          sqlite.prepare('DELETE FROM itens_pedido WHERE pedido_id = ?').run(pedidoId)
        }
        if (pedidoIds.length > 0) {
          sqlite.prepare(`DELETE FROM pedidos WHERE id IN (${pedidoIds.map(() => '?').join(',')})`)
            .run(...pedidoIds)
        }
        // Hard-delete lojas
        if (lojaIds.length > 0) {
          sqlite.prepare(`DELETE FROM lojas WHERE id IN (${lojaIds.map(() => '?').join(',')})`).run(...lojaIds)
        }
        // Delete the rede
        sqlite.prepare('DELETE FROM redes WHERE id = ?').run(id)
      })()
    } finally {
      sqlite.pragma('foreign_keys = ON')
    }

    return { ok: true }
  })
}

import { ipcMain } from 'electron'
import { getDb, getRawSqlite, getDeviceId } from '../db/client-local'
import { pedidos, itensPedido } from '../db/schema-local'
import { eq, inArray } from 'drizzle-orm'
import { IPC } from '../../shared/ipc-channels'
import { triggerSync } from '../sync/sync.service'

interface HistoryProduto { contem: number; total: number; sf: number }
interface HistoryRow { data: string; produtos: Record<number, HistoryProduto> }

export function registerEstoqueHandlers() {
  // Quantidades de pedidos por rede/produto para uma data
  ipcMain.handle(IPC.ESTOQUE_QUANTIDADES_DIA, (_event, data: string, produtoIds: number[]) => {
    if (!produtoIds || produtoIds.length === 0) return {}

    const db = getDb()
    const pedidosDia = db.select().from(pedidos).where(eq(pedidos.data_pedido, data)).all()
    if (pedidosDia.length === 0) return {}

    const pedidoIds = pedidosDia.map(p => p.id)
    const itens = db.select().from(itensPedido).where(inArray(itensPedido.pedido_id, pedidoIds)).all()
      .filter(i => produtoIds.includes(i.produto_id!))

    const result: Record<number, Record<number, number>> = {}
    for (const item of itens) {
      const pedido = pedidosDia.find(p => p.id === item.pedido_id)
      if (!pedido?.rede_id || !item.produto_id) continue
      if (!result[pedido.rede_id]) result[pedido.rede_id] = {}
      result[pedido.rede_id][item.produto_id] = (result[pedido.rede_id][item.produto_id] ?? 0) + item.quantidade
    }

    return result
  })

  // Salva ou atualiza o CONTEM de um produto em uma data
  ipcMain.handle(IPC.ESTOQUE_ENTRADA_UPSERT, (_event, produtoId: number, data: string, quantidade: number) => {
    const sqlite = getRawSqlite()
    const now = new Date().toISOString()
    const deviceId = getDeviceId()

    sqlite.prepare(`
      INSERT INTO estoque_entradas (produto_id, data, quantidade, synced, device_id, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
      ON CONFLICT(produto_id, data) DO UPDATE SET
        quantidade = excluded.quantidade,
        synced = 0,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at
    `).run(produtoId, data, quantidade, deviceId, now)

    triggerSync()
  })

  // Retorna CONTEM atual (com carry-forward automático) + histórico dos últimos 14 dias
  ipcMain.handle(IPC.ESTOQUE_ENTRADAS_GET, (_event, data: string, produtoIds: number[]) => {
    if (!produtoIds || produtoIds.length === 0) return { contem: {}, history: [] }

    const sqlite = getRawSqlite()
    const contem: Record<number, { quantidade: number; auto: boolean }> = {}

    for (const prodId of produtoIds) {
      // Tenta entrada exata para esta data
      const exact = sqlite.prepare(
        'SELECT quantidade FROM estoque_entradas WHERE produto_id = ? AND data = ?'
      ).get(prodId, data) as { quantidade: number } | undefined

      if (exact) {
        contem[prodId] = { quantidade: exact.quantidade, auto: false }
        continue
      }

      // Carry-forward: entrada mais recente antes desta data
      const prev = sqlite.prepare(
        'SELECT data, quantidade FROM estoque_entradas WHERE produto_id = ? AND data < ? ORDER BY data DESC LIMIT 1'
      ).get(prodId, data) as { data: string; quantidade: number } | undefined

      if (prev) {
        const totalRow = sqlite.prepare(`
          SELECT COALESCE(SUM(ip.quantidade), 0) as total
          FROM itens_pedido ip
          JOIN pedidos p ON p.id = ip.pedido_id
          WHERE p.data_pedido = ? AND ip.produto_id = ?
        `).get(prev.data, prodId) as { total: number }

        contem[prodId] = { quantidade: prev.quantidade - totalRow.total, auto: true }
      }
      // Se não há entrada anterior, contem[prodId] fica undefined (campo vazio)
    }

    // Histórico: últimas 14 datas distintas com entradas para esses produtos
    const placeholders = produtoIds.map(() => '?').join(',')
    const entries = sqlite.prepare(
      `SELECT produto_id, data, quantidade
       FROM estoque_entradas
       WHERE produto_id IN (${placeholders})
       ORDER BY data DESC`
    ).all(...produtoIds) as { produto_id: number; data: string; quantidade: number }[]

    const allDates = [...new Set(entries.map(e => e.data))].sort((a, b) => b.localeCompare(a)).slice(0, 14)

    const history: HistoryRow[] = []

    for (const d of allDates) {
      const rowProdutos: Record<number, HistoryProduto> = {}

      for (const prodId of produtoIds) {
        const entry = entries.find(e => e.produto_id === prodId && e.data === d)
        if (!entry) continue

        const totalRow = sqlite.prepare(`
          SELECT COALESCE(SUM(ip.quantidade), 0) as total
          FROM itens_pedido ip
          JOIN pedidos p ON p.id = ip.pedido_id
          WHERE p.data_pedido = ? AND ip.produto_id = ?
        `).get(d, prodId) as { total: number }

        rowProdutos[prodId] = {
          contem: entry.quantidade,
          total: totalRow.total,
          sf: entry.quantidade - totalRow.total,
        }
      }

      if (Object.keys(rowProdutos).length > 0) {
        history.push({ data: d, produtos: rowProdutos })
      }
    }

    return { contem, history }
  })
}

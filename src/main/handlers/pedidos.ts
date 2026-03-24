import { ipcMain } from 'electron'
import { eq, and, gte, lte, inArray, desc } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { pedidos, itensPedido } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'
import {
  listPedidos,
  salvarPedido,
  updatePedidoById,
  deletePedido,
  checkDuplicate,
  getLancamentosParaData,
  getPedidoItens,
} from '../services/pedidos.service'
import { triggerSync, getMainWindow } from '../sync/sync.service'
import type { SalvarPedidoInput } from '../../shared/types'
import type { PedidoFilters } from '../services/pedidos.service'

export function registerPedidosHandlers() {
  ipcMain.handle(IPC.PEDIDOS_LIST, (_event, filters?: PedidoFilters) => listPedidos(filters))

  ipcMain.handle(IPC.PEDIDOS_BY_DATE_REDE, (_event, rede_id: number, data_pedido: string) =>
    getLancamentosParaData(rede_id, data_pedido)
  )

  ipcMain.handle(IPC.PEDIDOS_CREATE, (_event, input: SalvarPedidoInput) => {
    const result = salvarPedido(input)
    triggerSync(getMainWindow() ?? undefined)
    return result
  })

  ipcMain.handle(IPC.PEDIDOS_UPDATE, (_event, input: SalvarPedidoInput) => {
    const result = salvarPedido(input)
    triggerSync(getMainWindow() ?? undefined)
    return result
  })

  ipcMain.handle(IPC.PEDIDOS_DELETE, (_event, id: number) => {
    deletePedido(id)
    triggerSync(getMainWindow() ?? undefined)
  })

  ipcMain.handle(IPC.PEDIDOS_CHECK_DUPLICATE, (_event, rede_id: number, loja_id: number, data_pedido: string, numero_oc: string) =>
    checkDuplicate(rede_id, loja_id, data_pedido, numero_oc)
  )

  ipcMain.handle(IPC.PEDIDOS_ITENS, (_event, pedido_id: number) => getPedidoItens(pedido_id))

  ipcMain.handle(IPC.PEDIDOS_UPDATE_BY_ID, (_event, id: number, data: { numero_oc: string; itens: Array<{ produto_id: number; quantidade: number; preco_unit?: number; custo_unit?: number }> }) => {
    const result = updatePedidoById(id, data)
    triggerSync(getMainWindow() ?? undefined)
    return result
  })

  ipcMain.handle(IPC.PEDIDOS_LAST_OC, (_event, rede_id: number) => {
    const last = getDb().select({ numero_oc: pedidos.numero_oc })
      .from(pedidos).where(eq(pedidos.rede_id, rede_id))
      .orderBy(desc(pedidos.criado_em)).limit(1).all()[0]
    return last?.numero_oc ?? null
  })

  ipcMain.handle(IPC.ITENS_UPDATE_SINGLE_PRECO, (_event, item_id: number, new_preco: number) =>
    getDb().update(itensPedido).set({ preco_unit: new_preco }).where(eq(itensPedido.id, item_id)).returning().all()[0]
  )

  ipcMain.handle(IPC.PEDIDOS_UPDATE_STATUS, (_event, id: number, status: string) => {
    const result = getDb().update(pedidos).set({ status_pagamento: status, synced: 0 }).where(eq(pedidos.id, id)).returning().all()[0]
    triggerSync(getMainWindow() ?? undefined)
    return result
  })

  ipcMain.handle(IPC.ITENS_UPDATE_PRECO, (
    _event,
    params: { rede_id: number; loja_id: number; data_inicio: string; data_fim: string; produto_id: number; new_preco: number }
  ) => {
    const db = getDb()
    const conditions = [
      eq(pedidos.rede_id, params.rede_id),
      gte(pedidos.data_pedido, params.data_inicio),
      lte(pedidos.data_pedido, params.data_fim),
    ]
    if (params.loja_id) conditions.push(eq(pedidos.loja_id, params.loja_id))
    const pedidoIds = db.select({ id: pedidos.id }).from(pedidos).where(and(...conditions)).all().map(p => p.id)
    if (pedidoIds.length === 0) return 0
    return db.update(itensPedido)
      .set({ preco_unit: params.new_preco })
      .where(and(inArray(itensPedido.pedido_id, pedidoIds), eq(itensPedido.produto_id, params.produto_id)))
      .returning().all().length
  })
}

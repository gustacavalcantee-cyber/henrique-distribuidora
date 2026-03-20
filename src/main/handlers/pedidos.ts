import { ipcMain } from 'electron'
import { eq, and, gte, lte, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pedidos, itensPedido } from '../db/schema'
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
import type { SalvarPedidoInput } from '../../shared/types'
import type { PedidoFilters } from '../services/pedidos.service'

export function registerPedidosHandlers() {
  ipcMain.handle(IPC.PEDIDOS_LIST, (_event, filters?: PedidoFilters) => {
    return listPedidos(filters)
  })

  ipcMain.handle(IPC.PEDIDOS_BY_DATE_REDE, (_event, rede_id: number, data_pedido: string) => {
    return getLancamentosParaData(rede_id, data_pedido)
  })

  ipcMain.handle(IPC.PEDIDOS_CREATE, (_event, input: SalvarPedidoInput) => {
    return salvarPedido(input)
  })

  ipcMain.handle(IPC.PEDIDOS_UPDATE, (_event, input: SalvarPedidoInput) => {
    return salvarPedido(input)  // salvarPedido handles both create and update
  })

  ipcMain.handle(IPC.PEDIDOS_DELETE, (_event, id: number) => {
    deletePedido(id)
  })

  ipcMain.handle(IPC.PEDIDOS_CHECK_DUPLICATE, (_event, rede_id: number, loja_id: number, data_pedido: string, numero_oc: string) => {
    return checkDuplicate(rede_id, loja_id, data_pedido, numero_oc)
  })

  ipcMain.handle(IPC.PEDIDOS_ITENS, (_event, pedido_id: number) => {
    return getPedidoItens(pedido_id)
  })

  ipcMain.handle(IPC.PEDIDOS_UPDATE_BY_ID, (_event, id: number, data: { numero_oc: string; itens: Array<{ produto_id: number; quantidade: number; preco_unit?: number; custo_unit?: number }> }) => {
    return updatePedidoById(id, data)
  })

  ipcMain.handle(IPC.PEDIDOS_LAST_OC, (_event, rede_id: number) => {
    const { getDb } = require('../db/client')
    const { pedidos } = require('../db/schema')
    const { eq, desc } = require('drizzle-orm')
    const db = getDb()
    const last = db.select({ numero_oc: pedidos.numero_oc })
      .from(pedidos)
      .where(eq(pedidos.rede_id, rede_id))
      .orderBy(desc(pedidos.criado_em))
      .limit(1)
      .all()[0]
    return last?.numero_oc ?? null
  })

  ipcMain.handle(IPC.ITENS_UPDATE_SINGLE_PRECO, (_event, item_id: number, new_preco: number) => {
    const db = getDb()
    return db.update(itensPedido).set({ preco_unit: new_preco }).where(eq(itensPedido.id, item_id)).run()
  })

  ipcMain.handle(IPC.PEDIDOS_UPDATE_STATUS, (_event, id: number, status: string) => {
    const db = getDb()
    return db.update(pedidos).set({ status_pagamento: status }).where(eq(pedidos.id, id)).run()
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
    const result = db.update(itensPedido)
      .set({ preco_unit: params.new_preco })
      .where(and(
        inArray(itensPedido.pedido_id, pedidoIds),
        eq(itensPedido.produto_id, params.produto_id)
      ))
      .run()
    return result.changes
  })
}

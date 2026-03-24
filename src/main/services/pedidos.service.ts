import { eq, and, gte, lte, like, isNull, desc, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { pedidos, itensPedido, precos, custos, lojas } from '../db/schema-local'
import type { SalvarPedidoInput, LancamentoRow } from '../../shared/types'

type Db = ReturnType<typeof getDb>

function getPrecoVigente(db: Db, produto_id: number, loja_id: number): number {
  const row = db.select({ preco_venda: precos.preco_venda })
    .from(precos)
    .where(and(eq(precos.produto_id, produto_id), eq(precos.loja_id, loja_id), isNull(precos.vigencia_fim)))
    .limit(1)
    .all()[0]
  return row?.preco_venda ?? 0
}

function getCustoVigente(db: Db, produto_id: number): number {
  const row = db.select({ custo_compra: custos.custo_compra })
    .from(custos)
    .where(and(eq(custos.produto_id, produto_id), isNull(custos.vigencia_fim)))
    .limit(1)
    .all()[0]
  return row?.custo_compra ?? 0
}

function resolveItens(db: Db, loja_id: number, itens: SalvarPedidoInput['itens']) {
  return itens.map(item => ({
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unit: item.preco_unit ?? getPrecoVigente(db, item.produto_id, loja_id),
    custo_unit: item.custo_unit ?? getCustoVigente(db, item.produto_id),
  }))
}

export interface PedidoFilters {
  rede_id?: number
  loja_id?: number
  data_inicio?: string
  data_fim?: string
  numero_oc?: string
}

export function listPedidos(filters: PedidoFilters = {}) {
  const db = getDb()
  const conditions: SQL<unknown>[] = []
  if (filters.rede_id) conditions.push(eq(pedidos.rede_id, filters.rede_id))
  if (filters.loja_id) conditions.push(eq(pedidos.loja_id, filters.loja_id))
  if (filters.data_inicio) conditions.push(gte(pedidos.data_pedido, filters.data_inicio))
  if (filters.data_fim) conditions.push(lte(pedidos.data_pedido, filters.data_fim))
  if (filters.numero_oc) conditions.push(like(pedidos.numero_oc, `%${filters.numero_oc}%`))

  return db.select().from(pedidos)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(pedidos.data_pedido), desc(pedidos.id))
    .all()
}

export function getPedidoItens(pedido_id: number) {
  return getDb().select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido_id)).all()
}

export function checkDuplicate(rede_id: number, loja_id: number, data_pedido: string, numero_oc: string) {
  const result = getDb().select({ id: pedidos.id })
    .from(pedidos)
    .where(and(
      eq(pedidos.rede_id, rede_id),
      eq(pedidos.loja_id, loja_id),
      eq(pedidos.data_pedido, data_pedido),
      eq(pedidos.numero_oc, numero_oc),
    ))
    .all()
  return result.length > 0
}

export function salvarPedido(input: SalvarPedidoInput): number {
  const db = getDb()

  const existing = db.select({ id: pedidos.id })
    .from(pedidos)
    .where(and(
      eq(pedidos.rede_id, input.rede_id),
      eq(pedidos.loja_id, input.loja_id),
      eq(pedidos.data_pedido, input.data_pedido),
    ))
    .orderBy(desc(pedidos.id))
    .limit(1)
    .all()[0]

  if (existing) {
    db.update(pedidos).set({ numero_oc: input.numero_oc, observacoes: input.observacoes, synced: 0 }).where(eq(pedidos.id, existing.id)).run()
    db.delete(itensPedido).where(eq(itensPedido.pedido_id, existing.id)).run()
    const resolvedItens = resolveItens(db, input.loja_id, input.itens)
    for (const item of resolvedItens) {
      db.insert(itensPedido).values({ pedido_id: existing.id, ...item, synced: 0 }).run()
    }
    return existing.id
  } else {
    const [newPedido] = db.insert(pedidos).values({
      rede_id: input.rede_id,
      loja_id: input.loja_id,
      data_pedido: input.data_pedido,
      numero_oc: input.numero_oc,
      observacoes: input.observacoes,
      synced: 0,
    }).returning().all()

    const resolvedItens = resolveItens(db, input.loja_id, input.itens)
    for (const item of resolvedItens) {
      db.insert(itensPedido).values({ pedido_id: newPedido.id, ...item, synced: 0 }).run()
    }
    return newPedido.id
  }
}

export function updatePedidoById(id: number, data: { numero_oc: string; data_pedido?: string; itens: SalvarPedidoInput['itens'] }): number {
  const db = getDb()
  const pedido = db.select({ loja_id: pedidos.loja_id }).from(pedidos).where(eq(pedidos.id, id)).limit(1).all()[0]
  if (!pedido) throw new Error(`Pedido ${id} not found`)
  const updateFields: Record<string, unknown> = { numero_oc: data.numero_oc, synced: 0 }
  if (data.data_pedido) updateFields.data_pedido = data.data_pedido
  db.update(pedidos).set(updateFields).where(eq(pedidos.id, id)).run()
  db.delete(itensPedido).where(eq(itensPedido.pedido_id, id)).run()
  const resolvedItens = resolveItens(db, pedido.loja_id!, data.itens)
  for (const item of resolvedItens) {
    db.insert(itensPedido).values({ pedido_id: id, ...item, synced: 0 }).run()
  }
  return id
}

export function deletePedido(id: number): void {
  // CASCADE handles itens_pedido deletion
  getDb().delete(pedidos).where(eq(pedidos.id, id)).run()
}

export function getLancamentosParaData(rede_id: number, data_pedido: string): LancamentoRow[] {
  const db = getDb()
  const todasLojas = db.select().from(lojas)
    .where(and(eq(lojas.rede_id, rede_id), eq(lojas.ativo, 1)))
    .all()

  return todasLojas.map(loja => {
    const pedido = db.select().from(pedidos)
      .where(and(eq(pedidos.loja_id, loja.id), eq(pedidos.data_pedido, data_pedido), eq(pedidos.rede_id, rede_id)))
      .orderBy(desc(pedidos.id))
      .limit(1)
      .all()[0]

    const quantidades: Record<number, number | null> = {}
    if (pedido) {
      const itens = db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido.id)).all()
      for (const item of itens) {
        if (item.produto_id !== null) quantidades[item.produto_id] = item.quantidade === 0 ? null : item.quantidade
      }
    }

    return {
      loja_id: loja.id,
      loja_nome: loja.nome,
      pedido_id: pedido?.id ?? null,
      numero_oc: pedido?.numero_oc ?? '',
      quantidades,
    }
  })
}

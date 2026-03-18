import { eq, and, gte, lte, like, isNull, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pedidos, itensPedido, precos, custos, lojas } from '../db/schema'
import type { SalvarPedidoInput, LancamentoRow } from '../../shared/types'

type Db = ReturnType<typeof getDb>

// Get vigent price for a product/loja combination
function getPrecoVigente(db: Db, produto_id: number, loja_id: number): number {
  const row = db.select({ preco_venda: precos.preco_venda })
    .from(precos)
    .where(and(eq(precos.produto_id, produto_id), eq(precos.loja_id, loja_id), isNull(precos.vigencia_fim)))
    .all()[0]
  return row?.preco_venda ?? 0
}

// Get vigent cost for a product
function getCustoVigente(db: Db, produto_id: number): number {
  const row = db.select({ custo_compra: custos.custo_compra })
    .from(custos)
    .where(and(eq(custos.produto_id, produto_id), isNull(custos.vigencia_fim)))
    .all()[0]
  return row?.custo_compra ?? 0
}

// Resolve itens: fill preco_unit/custo_unit from DB if not provided
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
    .orderBy(pedidos.data_pedido)
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

export function salvarPedido(input: SalvarPedidoInput) {
  const db = getDb()

  // Check if a pedido with same OC already exists for this loja/date
  const existing = db.select({ id: pedidos.id })
    .from(pedidos)
    .where(and(
      eq(pedidos.rede_id, input.rede_id),
      eq(pedidos.loja_id, input.loja_id),
      eq(pedidos.data_pedido, input.data_pedido),
      eq(pedidos.numero_oc, input.numero_oc),
    ))
    .all()[0]

  if (existing) {
    // Update: delete existing items and re-insert
    db.delete(itensPedido).where(eq(itensPedido.pedido_id, existing.id)).run()
    const resolvedItens = resolveItens(db, input.loja_id, input.itens)
    for (const item of resolvedItens) {
      db.insert(itensPedido).values({ pedido_id: existing.id, ...item }).run()
    }
    return existing.id
  } else {
    // Insert new pedido
    const [newPedido] = db.insert(pedidos).values({
      rede_id: input.rede_id,
      loja_id: input.loja_id,
      data_pedido: input.data_pedido,
      numero_oc: input.numero_oc,
      observacoes: input.observacoes,
    }).returning().all()

    const resolvedItens = resolveItens(db, input.loja_id, input.itens)
    for (const item of resolvedItens) {
      db.insert(itensPedido).values({ pedido_id: newPedido.id, ...item }).run()
    }
    return newPedido.id
  }
}

export function deletePedido(id: number) {
  // CASCADE handles itens_pedido deletion
  getDb().delete(pedidos).where(eq(pedidos.id, id)).run()
}

// Returns LancamentoRow[] for the daily matrix (all stores for a rede on a date)
export function getLancamentosParaData(rede_id: number, data_pedido: string): LancamentoRow[] {
  const db = getDb()
  const todasLojas = db.select().from(lojas)
    .where(and(eq(lojas.rede_id, rede_id), eq(lojas.ativo, 1)))
    .all()

  return todasLojas.map(loja => {
    const pedido = db.select().from(pedidos)
      .where(and(eq(pedidos.loja_id, loja.id), eq(pedidos.data_pedido, data_pedido), eq(pedidos.rede_id, rede_id)))
      .all()[0]

    const quantidades: Record<number, number | null> = {}
    if (pedido) {
      const itens = db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido.id)).all()
      for (const item of itens) {
        if (item.produto_id !== null) quantidades[item.produto_id] = item.quantidade
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

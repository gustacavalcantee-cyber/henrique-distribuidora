import { eq, and, gte, lte, like, isNull, desc, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { pedidos, itensPedido, precos, custos, lojas } from '../db/schema-pg'
import type { SalvarPedidoInput, LancamentoRow } from '../../shared/types'

type Db = ReturnType<typeof getDb>

// Get vigent price for a product/loja combination
async function getPrecoVigente(db: Db, produto_id: number, loja_id: number): Promise<number> {
  const row = (await db.select({ preco_venda: precos.preco_venda })
    .from(precos)
    .where(and(eq(precos.produto_id, produto_id), eq(precos.loja_id, loja_id), isNull(precos.vigencia_fim)))
    .limit(1))[0]
  return row?.preco_venda ?? 0
}

// Get vigent cost for a product
async function getCustoVigente(db: Db, produto_id: number): Promise<number> {
  const row = (await db.select({ custo_compra: custos.custo_compra })
    .from(custos)
    .where(and(eq(custos.produto_id, produto_id), isNull(custos.vigencia_fim)))
    .limit(1))[0]
  return row?.custo_compra ?? 0
}

// Resolve itens: fill preco_unit/custo_unit from DB if not provided
async function resolveItens(db: Db, loja_id: number, itens: SalvarPedidoInput['itens']) {
  return Promise.all(itens.map(async item => ({
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unit: item.preco_unit ?? await getPrecoVigente(db, item.produto_id, loja_id),
    custo_unit: item.custo_unit ?? await getCustoVigente(db, item.produto_id),
  })))
}

export interface PedidoFilters {
  rede_id?: number
  loja_id?: number
  data_inicio?: string
  data_fim?: string
  numero_oc?: string
}

export async function listPedidos(filters: PedidoFilters = {}) {
  const db = getDb()
  const conditions: SQL<unknown>[] = []
  if (filters.rede_id) conditions.push(eq(pedidos.rede_id, filters.rede_id))
  if (filters.loja_id) conditions.push(eq(pedidos.loja_id, filters.loja_id))
  if (filters.data_inicio) conditions.push(gte(pedidos.data_pedido, filters.data_inicio))
  if (filters.data_fim) conditions.push(lte(pedidos.data_pedido, filters.data_fim))
  if (filters.numero_oc) conditions.push(like(pedidos.numero_oc, `%${filters.numero_oc}%`))

  return await db.select().from(pedidos)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(pedidos.data_pedido), desc(pedidos.id))
}

export async function getPedidoItens(pedido_id: number) {
  return await getDb().select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido_id))
}

export async function checkDuplicate(rede_id: number, loja_id: number, data_pedido: string, numero_oc: string) {
  const result = await getDb().select({ id: pedidos.id })
    .from(pedidos)
    .where(and(
      eq(pedidos.rede_id, rede_id),
      eq(pedidos.loja_id, loja_id),
      eq(pedidos.data_pedido, data_pedido),
      eq(pedidos.numero_oc, numero_oc),
    ))
  return result.length > 0
}

export async function salvarPedido(input: SalvarPedidoInput) {
  const db = getDb()

  // Check if any pedido already exists for this rede/loja/date (regardless of OC number)
  // Always update the most recent one to avoid duplicates
  const existing = (await db.select({ id: pedidos.id })
    .from(pedidos)
    .where(and(
      eq(pedidos.rede_id, input.rede_id),
      eq(pedidos.loja_id, input.loja_id),
      eq(pedidos.data_pedido, input.data_pedido),
    ))
    .orderBy(desc(pedidos.id))
    .limit(1))[0]

  if (existing) {
    // Update: update numero_oc, delete existing items and re-insert
    await db.update(pedidos).set({ numero_oc: input.numero_oc, observacoes: input.observacoes }).where(eq(pedidos.id, existing.id))
    await db.delete(itensPedido).where(eq(itensPedido.pedido_id, existing.id))
    const resolvedItens = await resolveItens(db, input.loja_id, input.itens)
    for (const item of resolvedItens) {
      await db.insert(itensPedido).values({ pedido_id: existing.id, ...item })
    }
    return existing.id
  } else {
    // Insert new pedido
    const [newPedido] = await db.insert(pedidos).values({
      rede_id: input.rede_id,
      loja_id: input.loja_id,
      data_pedido: input.data_pedido,
      numero_oc: input.numero_oc,
      observacoes: input.observacoes,
    }).returning()

    const resolvedItens = await resolveItens(db, input.loja_id, input.itens)
    for (const item of resolvedItens) {
      await db.insert(itensPedido).values({ pedido_id: newPedido.id, ...item })
    }
    return newPedido.id
  }
}

export async function updatePedidoById(id: number, data: { numero_oc: string; itens: SalvarPedidoInput['itens'] }) {
  const db = getDb()
  const pedido = (await db.select({ loja_id: pedidos.loja_id }).from(pedidos).where(eq(pedidos.id, id)).limit(1))[0]
  if (!pedido) throw new Error(`Pedido ${id} not found`)
  await db.update(pedidos).set({ numero_oc: data.numero_oc }).where(eq(pedidos.id, id))
  await db.delete(itensPedido).where(eq(itensPedido.pedido_id, id))
  const resolvedItens = await resolveItens(db, pedido.loja_id!, data.itens)
  for (const item of resolvedItens) {
    await db.insert(itensPedido).values({ pedido_id: id, ...item })
  }
  return id
}

export async function deletePedido(id: number) {
  // CASCADE handles itens_pedido deletion
  await getDb().delete(pedidos).where(eq(pedidos.id, id))
}

// Returns LancamentoRow[] for the daily matrix (all stores for a rede on a date)
export async function getLancamentosParaData(rede_id: number, data_pedido: string): Promise<LancamentoRow[]> {
  const db = getDb()
  const todasLojas = await db.select().from(lojas)
    .where(and(eq(lojas.rede_id, rede_id), eq(lojas.ativo, 1)))

  return Promise.all(todasLojas.map(async loja => {
    const pedido = (await db.select().from(pedidos)
      .where(and(eq(pedidos.loja_id, loja.id), eq(pedidos.data_pedido, data_pedido), eq(pedidos.rede_id, rede_id)))
      .orderBy(desc(pedidos.id))
      .limit(1))[0]

    const quantidades: Record<number, number | null> = {}
    if (pedido) {
      const itens = await db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido.id))
      for (const item of itens) {
        // quantidade === 0 means "active in row but no qty entered" — treat as null in the UI
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
  }))
}

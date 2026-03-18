import { eq, and, gte, lte } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pedidos, itensPedido, produtos, lojas, redes, despesas as despesasTable } from '../db/schema'
import type { QuinzenaSummary, FinanceiroSummary } from '../../shared/types'

export function getRelatorioQuinzena(rede_id: number, loja_id: number, mes: number, ano: number, quinzena: 1 | 2): QuinzenaSummary {
  const db = getDb()
  const mesStr = String(mes).padStart(2, '0')
  const data_inicio = quinzena === 1 ? `${ano}-${mesStr}-01` : `${ano}-${mesStr}-16`
  const lastDay = new Date(ano, mes, 0).getDate()
  const data_fim = quinzena === 1 ? `${ano}-${mesStr}-15` : `${ano}-${mesStr}-${lastDay}`

  const conditions = [
    gte(pedidos.data_pedido, data_inicio),
    lte(pedidos.data_pedido, data_fim),
    eq(pedidos.rede_id, rede_id),
  ]
  if (loja_id) conditions.push(eq(pedidos.loja_id, loja_id))

  const pedidosList = db.select().from(pedidos).where(and(...conditions)).orderBy(pedidos.data_pedido).all()
  const pedidoIds = pedidosList.map(p => p.id)

  if (pedidoIds.length === 0) {
    const todosProdutos = db.select().from(produtos).where(eq(produtos.rede_id, rede_id)).orderBy(produtos.ordem_exibicao).all()
    return { total_venda: 0, total_custo: 0, margem: 0, detalhe: [], matriz: [], produtos: todosProdutos as any }
  }

  // Get all items for these pedidos
  const allItens = pedidoIds.flatMap(pedidoId =>
    db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedidoId)).all()
  )

  const todosProdutos = db.select().from(produtos).where(eq(produtos.rede_id, rede_id)).orderBy(produtos.ordem_exibicao).all()
  const todasLojas = db.select().from(lojas).all()

  // Build detalhe
  const detalhe = pedidosList.flatMap(pedido => {
    const loja = todasLojas.find(l => l.id === pedido.loja_id)
    const itens = allItens.filter(i => i.pedido_id === pedido.id)
    return itens.map(item => {
      const produto = todosProdutos.find(p => p.id === item.produto_id)
      return {
        data_pedido: pedido.data_pedido,
        numero_oc: pedido.numero_oc,
        loja_nome: loja?.nome ?? '',
        produto_nome: produto?.nome ?? '',
        unidade: produto?.unidade ?? '',
        quantidade: item.quantidade,
        preco_unit: item.preco_unit,
        custo_unit: item.custo_unit,
        total_venda: item.quantidade * item.preco_unit,
        total_custo: item.quantidade * item.custo_unit,
      }
    })
  })

  // Build matriz: date × produto_id = quantidade
  const matrizMap = new Map<string, Record<number, number>>()
  for (const item of allItens) {
    const pedido = pedidosList.find(p => p.id === item.pedido_id)!
    if (!matrizMap.has(pedido.data_pedido)) matrizMap.set(pedido.data_pedido, {})
    const row = matrizMap.get(pedido.data_pedido)!
    row[item.produto_id!] = (row[item.produto_id!] ?? 0) + item.quantidade
  }
  const matriz = Array.from(matrizMap.entries()).map(([data_pedido, quantidades]) => ({ data_pedido, quantidades }))

  const total_venda = detalhe.reduce((s, d) => s + d.total_venda, 0)
  const total_custo = detalhe.reduce((s, d) => s + d.total_custo, 0)
  const margem = total_venda > 0 ? ((total_venda - total_custo) / total_venda) * 100 : 0

  return { total_venda, total_custo, margem, detalhe, matriz, produtos: todosProdutos as any }
}

export function getRelatorioFinanceiro(mes: number, ano: number, rede_id?: number): FinanceiroSummary {
  const db = getDb()
  const mesStr = String(mes).padStart(2, '0')
  const data_inicio = `${ano}-${mesStr}-01`
  const lastDay = new Date(ano, mes, 0).getDate()
  const data_fim = `${ano}-${mesStr}-${lastDay}`

  const pedidoConditions: ReturnType<typeof gte>[] = [gte(pedidos.data_pedido, data_inicio), lte(pedidos.data_pedido, data_fim)]
  if (rede_id) pedidoConditions.push(eq(pedidos.rede_id, rede_id))

  const pedidosList = db.select().from(pedidos).where(and(...pedidoConditions)).all()
  const pedidoIds = pedidosList.map(p => p.id)

  const allItens = pedidoIds.flatMap(pedidoId =>
    db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedidoId)).all()
  )

  const receita_bruta = allItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
  const custo_produtos = allItens.reduce((s, i) => s + i.quantidade * i.custo_unit, 0)
  const margem_bruta = receita_bruta > 0 ? ((receita_bruta - custo_produtos) / receita_bruta) * 100 : 0

  // Despesas
  const despesaConditions: ReturnType<typeof gte>[] = [gte(despesasTable.data, data_inicio), lte(despesasTable.data, data_fim)]
  if (rede_id) despesaConditions.push(eq(despesasTable.rede_id, rede_id))
  const despesasList = db.select().from(despesasTable).where(and(...despesaConditions)).all()
  const totalDespesas = despesasList.reduce((s, d) => s + d.valor, 0)
  const lucro_liquido = receita_bruta > 0 ? ((receita_bruta - custo_produtos - totalDespesas) / receita_bruta) * 100 : 0

  // Revenue per rede
  const redesList = db.select().from(redes).all()
  const por_rede = redesList.map(rede => {
    const redePedidos = pedidosList.filter(p => p.rede_id === rede.id)
    const redeIds = redePedidos.map(p => p.id)
    const redeItens = allItens.filter(i => redeIds.includes(i.pedido_id!))
    const receita = redeItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    return { rede_nome: rede.nome, receita }
  }).filter(r => r.receita > 0)

  // Top lojas
  const lojaReceita = new Map<number, number>()
  for (const pedido of pedidosList) {
    const pedidoItens = allItens.filter(i => i.pedido_id === pedido.id)
    const receita = pedidoItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    lojaReceita.set(pedido.loja_id!, (lojaReceita.get(pedido.loja_id!) ?? 0) + receita)
  }
  const todasLojas = db.select().from(lojas).all()
  const top_lojas = Array.from(lojaReceita.entries())
    .map(([loja_id, receita]) => ({ loja_nome: todasLojas.find(l => l.id === loja_id)?.nome ?? String(loja_id), receita }))
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 5)

  return { receita_bruta, custo_produtos, margem_bruta, despesas: totalDespesas, lucro_liquido, por_rede, top_lojas }
}

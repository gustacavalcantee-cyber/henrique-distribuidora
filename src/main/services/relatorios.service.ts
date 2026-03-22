import { eq, and, gte, lte, inArray, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pedidos, itensPedido, produtos, lojas, redes, despesas as despesasTable, franqueados, custos as custosTable, precos as precosTable } from '../db/schema'
import type { QuinzenaSummary, FinanceiroSummary, CobrancaLojaResult, NotaPagamento, ProdutoRelatorioResult, PrecoVsCustoResult, PrecoVsCustoCusto, PrecoVsCustoLoja, PrecoVsCustoGraficoMes, PrecoVsCustoGraficoDia } from '../../shared/types'

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

  // Get all products that appear in items (includes global products with rede_id = NULL)
  const produtoIdsInItens = [...new Set(allItens.map(i => i.produto_id).filter(Boolean) as number[])]
  const todosProdutos = produtoIdsInItens.length > 0
    ? db.select().from(produtos).where(inArray(produtos.id, produtoIdsInItens)).orderBy(produtos.nome).all()
    : []

  // Deduplicate products by nome — same product may exist with multiple produto_ids across redes
  // Keep the entry with the lowest id as canonical for each name
  const produtosUnicos: typeof todosProdutos = []
  const seenNomes = new Set<string>()
  for (const p of [...todosProdutos].sort((a, b) => a.id - b.id)) {
    if (!seenNomes.has(p.nome)) {
      seenNomes.add(p.nome)
      produtosUnicos.push(p)
    }
  }
  // Sort unique products alphabetically so columns appear in the correct order
  produtosUnicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  // Map any duplicate produto_id → canonical produto_id (lowest id for that name)
  const produtoIdMap = new Map<number, number>()
  for (const p of todosProdutos) {
    const canonical = produtosUnicos.find(u => u.nome === p.nome)!
    produtoIdMap.set(p.id, canonical.id)
  }

  const todasLojas = db.select().from(lojas).all()

  // Build detalhe — skip items with quantidade = 0, use canonical product
  const detalhe = pedidosList.flatMap(pedido => {
    const loja = todasLojas.find(l => l.id === pedido.loja_id)
    const itens = allItens.filter(i => i.pedido_id === pedido.id && i.quantidade > 0)
    return itens.map(item => {
      const canonicalId = produtoIdMap.get(item.produto_id!) ?? item.produto_id!
      const produto = produtosUnicos.find(p => p.id === canonicalId)
      return {
        item_id: item.id,
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

  // Build matriz: date × canonical_produto_id = quantidade (skip qty=0 items)
  const matrizMap = new Map<string, Record<number, number>>()
  for (const item of allItens) {
    if (item.quantidade === 0) continue
    const pedido = pedidosList.find(p => p.id === item.pedido_id)!
    if (!matrizMap.has(pedido.data_pedido)) matrizMap.set(pedido.data_pedido, {})
    const row = matrizMap.get(pedido.data_pedido)!
    const canonicalId = produtoIdMap.get(item.produto_id!) ?? item.produto_id!
    row[canonicalId] = (row[canonicalId] ?? 0) + item.quantidade
  }
  const matriz = Array.from(matrizMap.entries()).map(([data_pedido, quantidades]) => ({ data_pedido, quantidades }))

  const total_venda = detalhe.reduce((s, d) => s + d.total_venda, 0)
  const total_custo = detalhe.reduce((s, d) => s + d.total_custo, 0)
  const margem = total_venda > 0 ? ((total_venda - total_custo) / total_venda) * 100 : 0

  return { total_venda, total_custo, margem, detalhe, matriz, produtos: produtosUnicos as any }
}

export function getRelatorioFinanceiro(mes: number, ano: number, rede_id?: number, franqueado_id?: number): FinanceiroSummary {
  const db = getDb()
  const data_inicio = mes === 0 ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, '0')}-01`
  const data_fim = mes === 0 ? `${ano}-12-31` : `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`

  const pedidoConditions: ReturnType<typeof gte>[] = [gte(pedidos.data_pedido, data_inicio), lte(pedidos.data_pedido, data_fim)]
  if (rede_id) pedidoConditions.push(eq(pedidos.rede_id, rede_id))
  if (franqueado_id) {
    const lojasDoFranqueado = db.select().from(lojas).where(eq(lojas.franqueado_id, franqueado_id)).all()
    const ids = lojasDoFranqueado.map(l => l.id)
    if (ids.length > 0) pedidoConditions.push(inArray(pedidos.loja_id, ids))
    else return { receita_bruta: 0, custo_produtos: 0, margem_bruta: 0, despesas: 0, lucro_liquido: 0, por_rede: [], top_lojas: [] }
  }

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

export function getRelatorioCobranca(
  loja_ids: number[],
  mes: number,
  ano: number,
  periodo: '1' | '2' | 'mes'
): CobrancaLojaResult[] {
  if (loja_ids.length === 0) return []
  const db = getDb()
  const mesStr = String(mes).padStart(2, '0')
  const lastDay = new Date(ano, mes, 0).getDate()

  let data_inicio: string
  let data_fim: string
  let periodo_str: string

  const mesNomes = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
  const mesNome = mesNomes[mes - 1]

  if (periodo === '1') {
    data_inicio = `${ano}-${mesStr}-01`
    data_fim = `${ano}-${mesStr}-15`
    periodo_str = `DE 01 A 15/${mesStr}`
  } else if (periodo === '2') {
    data_inicio = `${ano}-${mesStr}-16`
    data_fim = `${ano}-${mesStr}-${lastDay}`
    periodo_str = `DE 16 A ${lastDay}/${mesStr}`
  } else {
    data_inicio = `${ano}-${mesStr}-01`
    data_fim = `${ano}-${mesStr}-${lastDay}`
    periodo_str = `${mesNome} ${ano}`
  }

  const todasLojas = db.select().from(lojas).where(inArray(lojas.id, loja_ids)).all()
  const todasRedes = db.select().from(redes).all()

  return loja_ids.map(loja_id => {
    const loja = todasLojas.find(l => l.id === loja_id)
    const pedidosList = db.select().from(pedidos).where(
      and(
        eq(pedidos.loja_id, loja_id),
        gte(pedidos.data_pedido, data_inicio),
        lte(pedidos.data_pedido, data_fim)
      )
    ).all()

    const pedidoIds = pedidosList.map(p => p.id)
    let total_venda = 0
    if (pedidoIds.length > 0) {
      const itens = pedidoIds.flatMap(pid =>
        db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pid)).all()
      )
      total_venda = itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    }

    const rede = todasRedes.find(r => r.id === loja?.rede_id)
    const redeName = rede?.nome?.replace(/_/g, ' ')?.toUpperCase() ?? ''
    const lojaName = loja?.nome?.replace(/_/g, ' ')?.toUpperCase() ?? String(loja_id)

    return {
      loja_id,
      loja_nome: redeName ? `${redeName} ${lojaName}` : lojaName,
      periodo_str,
      total_venda,
    }
  })
}

export function getRelatorioPorProduto(
  rede_id: number,
  produto_ids: number[],
  mes: number,
  ano: number,
  periodo: '1' | '2' | 'mes',
  agrupar_por: 'loja' | 'franqueado'
): ProdutoRelatorioResult[] {
  if (produto_ids.length === 0) return []
  const db = getDb()
  const mesStr = String(mes).padStart(2, '0')
  const lastDay = new Date(ano, mes, 0).getDate()

  let data_inicio: string
  let data_fim: string
  if (periodo === '1') {
    data_inicio = `${ano}-${mesStr}-01`
    data_fim = `${ano}-${mesStr}-15`
  } else if (periodo === '2') {
    data_inicio = `${ano}-${mesStr}-16`
    data_fim = `${ano}-${mesStr}-${lastDay}`
  } else {
    data_inicio = `${ano}-${mesStr}-01`
    data_fim = `${ano}-${mesStr}-${lastDay}`
  }

  const pedidosList = db.select().from(pedidos).where(
    and(
      eq(pedidos.rede_id, rede_id),
      gte(pedidos.data_pedido, data_inicio),
      lte(pedidos.data_pedido, data_fim)
    )
  ).all()

  const todosProdutos = db.select().from(produtos).where(inArray(produtos.id, produto_ids)).all()

  if (pedidosList.length === 0) {
    return produto_ids.map(pid => {
      const prod = todosProdutos.find(p => p.id === pid)
      return { produto_id: pid, produto_nome: prod?.nome ?? String(pid), unidade: prod?.unidade ?? '', linhas: [], total_quantidade: 0, total_valor: 0 }
    })
  }

  const pedidoIds = pedidosList.map(p => p.id)

  const allItens = pedidoIds.flatMap(pedidoId =>
    db.select().from(itensPedido)
      .where(and(eq(itensPedido.pedido_id, pedidoId), inArray(itensPedido.produto_id, produto_ids)))
      .all()
  )

  const todasLojas = db.select().from(lojas).all()
  const todosFranqueados = db.select().from(franqueados).all()

  return produto_ids.map(produto_id => {
    const produto = todosProdutos.find(p => p.id === produto_id)
    const itensDoP = allItens.filter(i => i.produto_id === produto_id)

    const groupMap = new Map<string, { quantidade: number; valor: number }>()

    for (const item of itensDoP) {
      const pedido = pedidosList.find(p => p.id === item.pedido_id)!
      const loja = todasLojas.find(l => l.id === pedido.loja_id)

      let groupName: string
      if (agrupar_por === 'franqueado' && loja?.franqueado_id) {
        const franqueado = todosFranqueados.find(f => f.id === loja.franqueado_id)
        groupName = franqueado?.nome ?? 'Sem franqueado'
      } else if (agrupar_por === 'franqueado') {
        groupName = 'Sem franqueado'
      } else {
        groupName = loja?.nome ?? String(pedido.loja_id)
      }

      const prev = groupMap.get(groupName) ?? { quantidade: 0, valor: 0 }
      groupMap.set(groupName, {
        quantidade: prev.quantidade + item.quantidade,
        valor: prev.valor + item.quantidade * item.preco_unit,
      })
    }

    const linhas = Array.from(groupMap.entries())
      .map(([nome, { quantidade, valor }]) => ({ nome, quantidade, valor }))
      .sort((a, b) => b.quantidade - a.quantidade)

    const total_quantidade = linhas.reduce((s, l) => s + l.quantidade, 0)
    const total_valor = linhas.reduce((s, l) => s + l.valor, 0)

    return {
      produto_id,
      produto_nome: produto?.nome ?? String(produto_id),
      unidade: produto?.unidade ?? '',
      linhas,
      total_quantidade,
      total_valor,
    }
  })
}

export function getNotasMes(mes: number, ano: number, rede_id?: number, franqueado_id?: number): NotaPagamento[] {
  const db = getDb()
  const data_inicio = mes === 0 ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, '0')}-01`
  const data_fim = mes === 0 ? `${ano}-12-31` : `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`

  const conditions: ReturnType<typeof gte>[] = [
    gte(pedidos.data_pedido, data_inicio),
    lte(pedidos.data_pedido, data_fim),
  ]
  if (rede_id) conditions.push(eq(pedidos.rede_id, rede_id))
  if (franqueado_id) {
    const lojasDoFranqueado = db.select().from(lojas).where(eq(lojas.franqueado_id, franqueado_id)).all()
    const ids = lojasDoFranqueado.map(l => l.id)
    if (ids.length > 0) conditions.push(inArray(pedidos.loja_id, ids))
    else return []
  }

  const pedidosList = db.select().from(pedidos).where(and(...conditions)).orderBy(pedidos.data_pedido).all()
  if (pedidosList.length === 0) return []

  const pedidoIds = pedidosList.map(p => p.id)
  const allItens = pedidoIds.flatMap(pid =>
    db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pid)).all()
  )
  const todasLojas = db.select().from(lojas).all()
  const todasRedes = db.select().from(redes).all()
  const todosFranqueados = db.select().from(franqueados).all()

  return pedidosList.map(pedido => {
    const loja = todasLojas.find(l => l.id === pedido.loja_id)
    const rede = todasRedes.find(r => r.id === pedido.rede_id)
    const franqueado = todosFranqueados.find(f => f.id === loja?.franqueado_id)
    const itens = allItens.filter(i => i.pedido_id === pedido.id)
    const total_venda = itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    const redeName = rede?.nome?.replace(/_/g, ' ')?.toUpperCase() ?? ''
    const lojaName = loja?.nome?.replace(/_/g, ' ')?.toUpperCase() ?? String(pedido.loja_id)
    return {
      pedido_id: pedido.id,
      loja_id: pedido.loja_id!,
      loja_nome: redeName ? `${redeName} ${lojaName}` : lojaName,
      loja_nome_only: lojaName,
      rede_nome: redeName,
      franqueado_nome: franqueado?.nome ?? null,
      data_pedido: pedido.data_pedido,
      numero_oc: pedido.numero_oc,
      total_venda,
      status_pagamento: pedido.status_pagamento ?? 'aberto',
    }
  })
}

export function getRelatorioPrecoVsCusto(produto_id: number, loja_id?: number): PrecoVsCustoResult {
  const db = getDb()

  // 1. Nome do produto
  const produto = db.select().from(produtos).where(eq(produtos.id, produto_id)).get()
  const produto_nome = produto?.nome ?? String(produto_id)

  // 2. Histórico de custos (mais recente primeiro)
  const historico_custos: PrecoVsCustoCusto[] = db
    .select()
    .from(custosTable)
    .where(eq(custosTable.produto_id, produto_id))
    .all()
    .sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))

  // 3. Custo vigente atual
  const custoVigente = historico_custos.find(c => c.vigencia_fim === null) ?? null

  // 4. Lojas a comparar
  const todasLojas = loja_id
    ? db.select().from(lojas).where(eq(lojas.id, loja_id)).all()
    : db.select().from(lojas).where(eq(lojas.ativo, 1)).all()
  const todosFranqueados = db.select().from(franqueados).all()

  // Preços vigentes para o produto
  const precosVigentes = db
    .select()
    .from(precosTable)
    .where(and(eq(precosTable.produto_id, produto_id), isNull(precosTable.vigencia_fim)))
    .all()

  const comparacao_lojas: PrecoVsCustoLoja[] = todasLojas.map(loja => {
    const franqueado = todosFranqueados.find(f => f.id === loja.franqueado_id)
    const loja_nome = franqueado ? `${franqueado.nome} — ${loja.nome}` : loja.nome
    const preco = precosVigentes.find(p => p.loja_id === loja.id)
    const preco_venda = preco?.preco_venda ?? null
    const custo_atual = custoVigente?.custo_compra ?? null
    const margem_reais = preco_venda != null && custo_atual != null ? preco_venda - custo_atual : null
    const margem_pct = preco_venda != null && margem_reais != null && preco_venda > 0
      ? (margem_reais / preco_venda) * 100
      : null
    return { loja_id: loja.id, loja_nome, preco_venda, custo_atual, margem_reais, margem_pct }
  }).filter(l => l.preco_venda != null)

  // 5. Gráfico mensal — últimos 12 meses
  const now = new Date()
  const grafico_mensal: PrecoVsCustoGraficoMes[] = []

  // Hoist allPrecos out of the loop — fetched once and filtered in JS per iteration
  const allPrecos = db.select().from(precosTable).where(eq(precosTable.produto_id, produto_id)).all()

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ano = d.getFullYear()
    const mes = d.getMonth() + 1
    const mesStr = String(mes).padStart(2, '0')
    const mesLabel = `${ano}-${mesStr}`
    const firstDay = `${ano}-${mesStr}-01`
    const lastDay = `${ano}-${mesStr}-${new Date(ano, mes, 0).getDate()}`

    // Custo vigente neste mês — reuse historico_custos already fetched above
    const custoDoMes = historico_custos.find(c =>
      c.vigencia_inicio <= lastDay &&
      (c.vigencia_fim === null || c.vigencia_fim >= firstDay)
    )
    const custoMes = custoDoMes?.custo_compra ?? null

    // Preço médio vigente neste mês — filter from the already-fetched allPrecos array
    const precosDoMes = allPrecos.filter(p => {
      const dentroDoMes = p.vigencia_inicio <= lastDay && (p.vigencia_fim === null || p.vigencia_fim >= firstDay)
      if (!dentroDoMes) return false
      if (loja_id) return p.loja_id === loja_id
      return true
    })
    const preco_medio = precosDoMes.length > 0
      ? precosDoMes.reduce((s, p) => s + p.preco_venda, 0) / precosDoMes.length
      : null
    const margem_pct = preco_medio != null && custoMes != null && preco_medio > 0
      ? ((preco_medio - custoMes) / preco_medio) * 100
      : null

    // Dias com pedidos reais para drill-down
    const pedidosDoMes = db.select().from(pedidos).where(
      and(
        gte(pedidos.data_pedido, firstDay),
        lte(pedidos.data_pedido, lastDay),
        ...(loja_id ? [eq(pedidos.loja_id, loja_id)] : [])
      )
    ).all()

    const pedidoIds = pedidosDoMes.map(p => p.id)
    const allItensDoMes = pedidoIds.length > 0
      ? db.select().from(itensPedido).where(
          and(
            inArray(itensPedido.pedido_id, pedidoIds),
            eq(itensPedido.produto_id, produto_id)
          )
        ).all()
      : []

    const diaMap = new Map<string, { custo_sum: number; preco_sum: number; count: number }>()
    for (const item of allItensDoMes) {
      const ped = pedidosDoMes.find(p => p.id === item.pedido_id)!
      const prev = diaMap.get(ped.data_pedido) ?? { custo_sum: 0, preco_sum: 0, count: 0 }
      diaMap.set(ped.data_pedido, {
        custo_sum: prev.custo_sum + item.custo_unit,
        preco_sum: prev.preco_sum + item.preco_unit,
        count: prev.count + 1,
      })
    }

    const dias: PrecoVsCustoGraficoDia[] = Array.from(diaMap.entries()).map(([dia, v]) => {
      const custo = v.count > 0 ? v.custo_sum / v.count : null
      const preco = v.count > 0 ? v.preco_sum / v.count : null
      const marg = preco != null && custo != null && preco > 0 ? ((preco - custo) / preco) * 100 : null
      return { dia, custo, preco, margem_pct: marg }
    }).sort((a, b) => a.dia.localeCompare(b.dia))

    grafico_mensal.push({ mes: mesLabel, custo: custoMes, preco_medio, margem_pct, dias })
  }

  return { produto_nome, historico_custos, comparacao_lojas, grafico_mensal }
}

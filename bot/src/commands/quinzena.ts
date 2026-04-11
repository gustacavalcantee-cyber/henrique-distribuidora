import { Context } from 'grammy'
import { fetchPedidosRange, fetchItens, fetchProdutos, fetchRedes } from '../services/reports'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function handleQuinzena(ctx: Context): Promise<void> {
  const args = ctx.match ? String(ctx.match).trim().split(/\s+/).filter(Boolean) : []
  const quinzena: 1 | 2 = args[0] === '2' ? 2 : 1
  const now = new Date()
  const mes = args[1] ? Number(args[1]) : now.getMonth() + 1
  const ano = args[2] ? Number(args[2]) : now.getFullYear()
  const mesStr = String(mes).padStart(2, '0')
  const lastDay = new Date(ano, mes, 0).getDate()
  const dataInicio = quinzena === 1 ? `${ano}-${mesStr}-01` : `${ano}-${mesStr}-16`
  const dataFim   = quinzena === 1 ? `${ano}-${mesStr}-15` : `${ano}-${mesStr}-${lastDay}`

  await ctx.reply('⏳ Calculando...')
  try {
    const redes = await fetchRedes()
    const redeId = redes[0]?.id
    if (!redeId) { await ctx.reply('❌ Nenhuma rede encontrada.'); return }

    const pedidos = await fetchPedidosRange(dataInicio, dataFim, redeId)
    if (pedidos.length === 0) {
      await ctx.reply('📋 Nenhum pedido encontrado para esse período.')
      return
    }

    const itens = await fetchItens(pedidos.map(p => p.id))
    const produtoIds = [...new Set(itens.map(i => i.produto_id).filter(Boolean) as number[])]
    const produtos = await fetchProdutos(produtoIds)

    const totalVenda = itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    const totalCusto = itens.reduce((s, i) => s + i.quantidade * i.custo_unit, 0)
    const margem = totalVenda > 0 ? ((totalVenda - totalCusto) / totalVenda) * 100 : 0

    const mesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const lines = [
      `📋 *Quinzena ${quinzena} — ${mesNomes[mes - 1]} ${ano}*\n`,
      `💰 Vendas: R$ ${fmt(totalVenda)}`,
      `📦 Custo: R$ ${fmt(totalCusto)}`,
      `📈 Margem: ${fmt(margem)}%\n`,
      `*Por produto:*`,
    ]

    for (const prod of [...produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
      const prodItens = itens.filter(i => i.produto_id === prod.id)
      const qty = prodItens.reduce((s, i) => s + i.quantidade, 0)
      const venda = prodItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
      if (qty > 0) {
        lines.push(`• ${prod.nome}: ${fmt(qty)} ${prod.unidade} — R$ ${fmt(venda)}`)
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
  } catch (err) {
    await ctx.reply(`❌ Erro: ${String(err)}`)
  }
}

import { Context } from 'grammy'
import { fetchPedidosRange, fetchItens, fetchLojas } from '../services/reports'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function handleResumo(ctx: Context): Promise<void> {
  await ctx.reply('⏳ Calculando...')
  try {
    const now = new Date()
    const ano = now.getFullYear()
    const mes = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(ano, now.getMonth() + 1, 0).getDate()
    const dataInicio = `${ano}-${mes}-01`
    const dataFim = `${ano}-${mes}-${lastDay}`

    const pedidos = await fetchPedidosRange(dataInicio, dataFim)
    const itens = await fetchItens(pedidos.map(p => p.id))
    const lojas = await fetchLojas()

    const totalVenda = itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    const totalCusto = itens.reduce((s, i) => s + i.quantidade * i.custo_unit, 0)
    const margem = totalVenda > 0 ? ((totalVenda - totalCusto) / totalVenda) * 100 : 0

    const lojaVenda = new Map<number, number>()
    for (const ped of pedidos) {
      const v = itens
        .filter(i => i.pedido_id === ped.id)
        .reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
      lojaVenda.set(ped.loja_id, (lojaVenda.get(ped.loja_id) ?? 0) + v)
    }
    const topLojas = Array.from(lojaVenda.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, v]) => `• ${lojas.find(l => l.id === id)?.nome ?? id}: R$ ${fmt(v)}`)
      .join('\n')

    const mesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

    await ctx.reply(
      `📊 *Resumo — ${mesNomes[now.getMonth()]} ${ano}*\n\n` +
      `💰 Vendas: R$ ${fmt(totalVenda)}\n` +
      `📦 Custo: R$ ${fmt(totalCusto)}\n` +
      `📈 Margem: ${fmt(margem)}%\n\n` +
      `🏆 *Top Lojas*\n${topLojas || '—'}`,
      { parse_mode: 'Markdown' }
    )
  } catch (err) {
    await ctx.reply(`❌ Erro: ${String(err)}`)
  }
}

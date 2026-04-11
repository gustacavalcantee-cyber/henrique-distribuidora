import { Context } from 'grammy'
import { fetchPedidosRange, fetchItens, fetchLojas, fetchProdutos } from '../services/reports'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export async function handlePedidos(ctx: Context): Promise<void> {
  const args = ctx.match ? String(ctx.match).trim() : ''
  const parts = args.split(/\s+/).filter(Boolean)

  let lojaSearch: string | null = null
  let targetDate: string | null = null

  if (parts.length > 0) {
    const last = parts[parts.length - 1]
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(last)) {
      const [d, m, y] = last.split('/')
      targetDate = `${y}-${m}-${d}`
      lojaSearch = parts.slice(0, -1).join(' ') || null
    } else {
      lojaSearch = parts.join(' ')
    }
  }

  await ctx.reply('⏳ Buscando...')
  try {
    const now = new Date()
    const lojas = await fetchLojas()

    let filteredLojaIds: number[] | null = null
    if (lojaSearch) {
      const matched = lojas.filter(l =>
        l.nome.toLowerCase().includes(lojaSearch!.toLowerCase()))
      if (matched.length === 0) {
        await ctx.reply(`❌ Nenhuma loja encontrada para "${lojaSearch}".`)
        return
      }
      if (matched.length > 3) {
        await ctx.reply(
          `🔍 Várias lojas encontradas:\n${matched.map(l => `• ${l.nome}`).join('\n')}\n\nRefine a busca.`)
        return
      }
      filteredLojaIds = matched.map(l => l.id)
    }

    let dataInicio: string, dataFim: string
    if (targetDate) {
      dataInicio = dataFim = targetDate
    } else if (lojaSearch) {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      dataInicio = d.toISOString().split('T')[0]
      dataFim = now.toISOString().split('T')[0]
    } else {
      dataInicio = dataFim = now.toISOString().split('T')[0]
    }

    let pedidos = await fetchPedidosRange(dataInicio, dataFim)
    if (filteredLojaIds) {
      pedidos = pedidos.filter(p => filteredLojaIds!.includes(p.loja_id))
    }

    if (pedidos.length === 0) {
      await ctx.reply('📦 Nenhum pedido encontrado.')
      return
    }

    const itens = await fetchItens(pedidos.map(p => p.id))
    const produtoIds = [...new Set(itens.map(i => i.produto_id).filter(Boolean) as number[])]
    const produtos = await fetchProdutos(produtoIds)

    const lines: string[] = []
    const title = lojaSearch
      ? `📦 *Pedidos ${lojaSearch}${targetDate ? ` — ${fmtDate(targetDate)}` : ' (últimos 7 dias)'}*\n`
      : `📦 *Pedidos — ${fmtDate(dataFim)}*\n`
    lines.push(title)

    let grandTotal = 0
    const sorted = [...pedidos].sort((a, b) => a.data_pedido.localeCompare(b.data_pedido))
    for (const ped of sorted) {
      const loja = lojas.find(l => l.id === ped.loja_id)
      const pedItens = itens.filter(i => i.pedido_id === ped.id && i.quantidade > 0)
      if (pedItens.length === 0) continue
      const subtotal = pedItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
      grandTotal += subtotal

      lines.push(`📅 ${fmtDate(ped.data_pedido)} — ${loja?.nome ?? ped.loja_id} (OC ${ped.numero_oc})`)
      for (const item of pedItens) {
        const prod = produtos.find(p => p.id === item.produto_id)
        lines.push(`  • ${prod?.nome ?? item.produto_id}: ${fmt(item.quantidade)} × R$${fmt(item.preco_unit)}`)
      }
      lines.push(`  Subtotal: R$ ${fmt(subtotal)}\n`)
    }
    lines.push(`💰 *Total: R$ ${fmt(grandTotal)}*`)

    const text = lines.join('\n')
    if (text.length <= 4096) {
      await ctx.reply(text, { parse_mode: 'Markdown' })
    } else {
      let chunk = ''
      for (const line of lines) {
        if ((chunk + '\n' + line).length > 4000) {
          await ctx.reply(chunk, { parse_mode: 'Markdown' })
          chunk = line
        } else {
          chunk += (chunk ? '\n' : '') + line
        }
      }
      if (chunk) await ctx.reply(chunk, { parse_mode: 'Markdown' })
    }
  } catch (err) {
    await ctx.reply(`❌ Erro: ${String(err)}`)
  }
}

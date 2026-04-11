import { Context } from 'grammy'
import { fetchActivePrecos, fetchProdutos, fetchConfig } from '../services/reports'
import { screenshotListaPrecos, getLogoBase64 } from '../services/lista-precos'

export async function handlePrecos(ctx: Context): Promise<void> {
  await ctx.reply('⏳ Gerando lista de preços...')
  try {
    const [activePrecos, nomeEmpresa] = await Promise.all([
      fetchActivePrecos(),
      fetchConfig('nome_fornecedor'),
    ])

    const produtoIds = [...new Set(activePrecos.map(p => p.produto_id))]
    const produtos = await fetchProdutos(produtoIds)

    const priceMap = new Map<number, number>()
    for (const p of activePrecos) {
      if (!priceMap.has(p.produto_id)) priceMap.set(p.produto_id, p.preco_venda)
    }

    const itens = produtos
      .filter(p => priceMap.has(p.id))
      .map(p => ({
        nome: p.nome.toUpperCase(),
        unidade: p.unidade.toUpperCase(),
        preco: priceMap.get(p.id)!,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    if (itens.length === 0) {
      await ctx.reply('❌ Nenhum produto com preço ativo encontrado.')
      return
    }

    const screenshot = await screenshotListaPrecos({
      nomeEmpresa: nomeEmpresa ?? 'HENRIQUE',
      logoBase64: getLogoBase64(),
      itens,
    })

    await ctx.replyWithPhoto({ source: screenshot, filename: 'lista-precos.png' })
  } catch (err) {
    await ctx.reply(`❌ Erro ao gerar lista: ${String(err)}`)
  }
}

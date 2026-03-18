import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pedidos, itensPedido, produtos, lojas, redes, configuracoes } from '../db/schema'

export interface PrintData {
  nomeFornecedor: string
  telefone: string
  redeNome: string
  lojaNome: string
  numerOc: string
  data: string  // formatted DD/MM/YYYY
  linhas: Array<{
    nome: string
    unidade: string
    quantidade: number | null
    precoUnit: number
    total: number | null
  }>
  totalGeral: number
}

export function getPrintData(pedidoId: number): PrintData {
  const db = getDb()

  const pedido = db.select().from(pedidos).where(eq(pedidos.id, pedidoId)).all()[0]
  if (!pedido) throw new Error(`Pedido ${pedidoId} not found`)

  const loja = db.select().from(lojas).where(eq(lojas.id, pedido.loja_id!)).all()[0]
  const rede = db.select().from(redes).where(eq(redes.id, pedido.rede_id!)).all()[0]
  const itens = db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedidoId)).all()

  // Get all products for this rede (to show all products, even those with no quantity)
  const todosProdutos = db.select().from(produtos)
    .where(eq(produtos.rede_id, pedido.rede_id!))
    .orderBy(produtos.ordem_exibicao)
    .all()

  const configNome = db.select().from(configuracoes).where(eq(configuracoes.chave, 'nome_fornecedor')).all()[0]
  const configTel = db.select().from(configuracoes).where(eq(configuracoes.chave, 'telefone')).all()[0]

  const linhas = todosProdutos.map(p => {
    const item = itens.find(i => i.produto_id === p.id)
    const quantidade = item?.quantidade ?? null
    const precoUnit = item?.preco_unit ?? 0
    const total = quantidade != null ? quantidade * precoUnit : null
    return { nome: p.nome, unidade: p.unidade, quantidade, precoUnit, total }
  })

  const totalGeral = linhas.reduce((sum, l) => sum + (l.total ?? 0), 0)
  const [y, m, d] = pedido.data_pedido.split('-')
  const dataFormatada = `${d}/${m}/${y}`

  return {
    nomeFornecedor: configNome?.valor ?? 'HENRIQUE',
    telefone: configTel?.valor ?? '',
    redeNome: rede?.nome ?? '',
    lojaNome: loja?.nome ?? '',
    numerOc: pedido.numero_oc,
    data: dataFormatada,
    linhas,
    totalGeral,
  }
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(value: number | null, unidade: string): string {
  if (value === null) return '-'
  return unidade === 'KG' ? value.toFixed(1) : String(value)
}

export function generatePrintHtml(data: PrintData): string {
  // Build product rows — pad to at least 12 rows
  const MIN_ROWS = 12
  const extraRows = Math.max(0, MIN_ROWS - data.linhas.length)

  const tableRows = data.linhas.map(l => `
    <tr>
      <td class="td-produto">${l.nome}</td>
      <td class="td-qty">${formatQty(l.quantidade, l.unidade)}</td>
      <td class="td-un">${l.unidade}</td>
      <td class="td-preco">${l.precoUnit > 0 ? formatMoney(l.precoUnit) : '-'}</td>
      <td class="td-total">${l.total != null ? formatMoney(l.total) : '-'}</td>
    </tr>
  `).join('')

  const emptyRows = Array(extraRows).fill(`
    <tr>
      <td class="td-produto">&nbsp;</td>
      <td class="td-qty">&nbsp;</td>
      <td class="td-un">&nbsp;</td>
      <td class="td-preco">&nbsp;</td>
      <td class="td-total">&nbsp;</td>
    </tr>
  `).join('')

  // One via (half of the page)
  function via(): string {
    return `
      <div class="via">
        <div class="header">
          <div class="header-main">
            <div class="header-nome">${data.nomeFornecedor}</div>
            <div class="header-tel">Fone: ${data.telefone}</div>
          </div>
          <div class="header-info">
            <div class="info-box">
              <span class="info-label">REDE</span>
              <span class="info-value">${data.redeNome}</span>
            </div>
            <div class="info-box">
              <span class="info-label">LOJA</span>
              <span class="info-value">${data.lojaNome}</span>
            </div>
            <div class="info-box">
              <span class="info-label">OC</span>
              <span class="info-value">${data.numerOc}</span>
            </div>
            <div class="info-box">
              <span class="info-label">DATA</span>
              <span class="info-value">${data.data}</span>
            </div>
          </div>
        </div>
        <table class="table-produtos">
          <thead>
            <tr>
              <th class="td-produto">PRODUTO</th>
              <th class="td-qty">Qtd</th>
              <th class="td-un">Un</th>
              <th class="td-preco">Valor</th>
              <th class="td-total">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            ${emptyRows}
          </tbody>
        </table>
        <div class="footer">
          <div class="footer-total">
            <span class="footer-label">TOTAL</span>
            <span class="footer-value">R$ ${formatMoney(data.totalGeral)}</span>
          </div>
          <div class="footer-assinatura">
            <div class="assinatura-linha"></div>
            <div class="assinatura-texto">Assinatura / Carimbo</div>
          </div>
        </div>
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; }

  @page { size: A4 landscape; margin: 8mm; }

  .page { display: flex; gap: 4mm; width: 100%; }

  .via {
    flex: 1;
    border: 1px solid #000;
    display: flex;
    flex-direction: column;
    padding: 3mm;
  }

  .header { margin-bottom: 3mm; }
  .header-main { text-align: center; margin-bottom: 2mm; }
  .header-nome { font-size: 16px; font-weight: bold; }
  .header-tel { font-size: 10px; }

  .header-info { display: flex; gap: 2mm; flex-wrap: wrap; }
  .info-box {
    border: 1px solid #000;
    padding: 1mm 2mm;
    flex: 1;
    min-width: 40mm;
  }
  .info-label { font-size: 8px; color: #666; display: block; }
  .info-value { font-size: 11px; font-weight: bold; }

  .table-produtos {
    width: 100%;
    border-collapse: collapse;
    flex: 1;
    margin-bottom: 3mm;
  }
  .table-produtos th, .table-produtos td {
    border: 1px solid #000;
    padding: 1mm 1.5mm;
    text-align: left;
  }
  .table-produtos th { background: #f0f0f0; font-weight: bold; text-align: center; }
  .td-produto { width: 45%; }
  .td-qty { width: 12%; text-align: center; }
  .td-un { width: 8%; text-align: center; }
  .td-preco { width: 15%; text-align: right; }
  .td-total { width: 20%; text-align: right; }

  .footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; }
  .footer-total {
    border: 2px solid #000;
    padding: 2mm 4mm;
    display: flex;
    align-items: center;
    gap: 3mm;
  }
  .footer-label { font-size: 12px; font-weight: bold; }
  .footer-value { font-size: 14px; font-weight: bold; }

  .footer-assinatura { flex: 1; }
  .assinatura-linha { border-bottom: 1px solid #000; margin-bottom: 1mm; }
  .assinatura-texto { font-size: 8px; color: #666; text-align: center; }

  .divider {
    width: 1px;
    background: #ccc;
    border-left: 1px dashed #999;
  }
</style>
</head>
<body>
<div class="page">
  ${via()}
  <div class="divider"></div>
  ${via()}
</div>
</body>
</html>`
}

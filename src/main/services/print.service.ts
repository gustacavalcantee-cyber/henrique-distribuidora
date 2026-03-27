import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { pedidos, itensPedido, produtos, lojas, redes, configuracoes } from '../db/schema-local'

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

  const [pedido] = db.select().from(pedidos).where(eq(pedidos.id, pedidoId)).all()
  if (!pedido) throw new Error(`Pedido ${pedidoId} not found`)

  const [loja] = db.select().from(lojas).where(eq(lojas.id, pedido.loja_id!)).all()
  const [rede] = db.select().from(redes).where(eq(redes.id, pedido.rede_id!)).all()

  const [configNome] = db.select().from(configuracoes).where(eq(configuracoes.chave, 'nome_fornecedor')).all()
  const [configTel] = db.select().from(configuracoes).where(eq(configuracoes.chave, 'telefone')).all()

  // Try to use the user-defined column order from layout_config for this loja
  const rawSqlite = (db as any).$client
  const layoutRow = rawSqlite
    .prepare('SELECT produto_ids FROM layout_config WHERE rede_id = ? AND loja_id = ?')
    .get(pedido.rede_id, pedido.loja_id) as { produto_ids: string } | undefined

  // Fetch all itens for this pedido first — used for product filtering
  const orderedWithInfo = db.select({
    produto_id: itensPedido.produto_id,
    quantidade: itensPedido.quantidade,
    preco_unit: itensPedido.preco_unit,
    nome: produtos.nome,
    unidade: produtos.unidade,
  }).from(itensPedido)
    .innerJoin(produtos, eq(itensPedido.produto_id, produtos.id))
    .where(eq(itensPedido.pedido_id, pedidoId))
    .all()

  let redeProds = db.select({ id: produtos.id, nome: produtos.nome, unidade: produtos.unidade })
    .from(produtos).where(eq(produtos.rede_id, pedido.rede_id!)).orderBy(produtos.nome).all()

  let usingLayout = false

  if (layoutRow) {
    const thisLojaIds = new Set<number>(JSON.parse(layoutRow.produto_ids))

    // Prefer the saved global column order (updated whenever user drags columns in Lançamentos)
    const globalOrderRow = rawSqlite
      .prepare('SELECT value FROM sync_meta WHERE key = ?')
      .get(`col_order_rede_${pedido.rede_id}`) as { value: string } | undefined

    let canonicalIds: number[]
    if (globalOrderRow) {
      canonicalIds = JSON.parse(globalOrderRow.value)
    } else {
      // Fallback: use most recently updated layout_config row as canonical order
      const recentRow = rawSqlite
        .prepare('SELECT produto_ids FROM layout_config WHERE rede_id = ? ORDER BY updated_at DESC LIMIT 1')
        .get(pedido.rede_id) as { produto_ids: string } | undefined
      canonicalIds = recentRow ? JSON.parse(recentRow.produto_ids) : []
    }

    const prodMap = new Map(redeProds.map(p => [p.id, p]))
    // Products in canonical order, filtered to this loja; any extras appended at end
    const inCanonical = canonicalIds
      .filter(id => thisLojaIds.has(id))
      .map(id => prodMap.get(id))
      .filter(Boolean) as typeof redeProds
    const canonicalSet = new Set(canonicalIds)
    const extras = redeProds.filter(p => thisLojaIds.has(p.id) && !canonicalSet.has(p.id))
    redeProds = [...inCanonical, ...extras]
    usingLayout = true
  } else {
    // No layout config: show only products that actually appear in this pedido's itens
    const itemProdIds = new Set(orderedWithInfo.map(i => i.produto_id).filter(Boolean) as number[])
    if (itemProdIds.size > 0) {
      redeProds = redeProds.filter(p => itemProdIds.has(p.id))
    } else if (redeProds.length === 0) {
      // Last resort: fetch from historical rede pedidos
      const allRedeOrderIds = db.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.rede_id, pedido.rede_id!)).all().map(p => p.id)
      if (allRedeOrderIds.length > 0) {
        const uniqueProdIds = [...new Set(
          db.select({ produto_id: itensPedido.produto_id }).from(itensPedido).where(inArray(itensPedido.pedido_id, allRedeOrderIds)).all()
            .map(i => i.produto_id).filter(Boolean) as number[]
        )]
        if (uniqueProdIds.length > 0) {
          redeProds = db.select({ id: produtos.id, nome: produtos.nome, unidade: produtos.unidade })
            .from(produtos).where(inArray(produtos.id, uniqueProdIds)).orderBy(produtos.nome).all()
        }
      }
    }
  }

  const itensById = new Map(orderedWithInfo.map(i => [i.produto_id, i]))
  const itensByName = new Map(orderedWithInfo.map(i => [i.nome.toUpperCase(), i]))

  const coveredNames = new Set<string>()
  const linhas: PrintData['linhas'] = []

  for (const prod of redeProds) {
    const nameKey = prod.nome.toUpperCase()
    const item = itensById.get(prod.id) ?? itensByName.get(nameKey)
    coveredNames.add(nameKey)
    linhas.push({
      nome: nameKey, unidade: prod.unidade,
      quantidade: item?.quantidade ?? null,
      precoUnit: item?.preco_unit ?? 0,
      total: item != null ? item.quantidade * item.preco_unit : null,
    })
  }

  for (const item of orderedWithInfo) {
    if (!coveredNames.has(item.nome.toUpperCase())) {
      linhas.push({
        nome: item.nome.toUpperCase(), unidade: item.unidade,
        quantidade: item.quantidade, precoUnit: item.preco_unit,
        total: item.quantidade * item.preco_unit,
      })
    }
  }

  // Only sort alphabetically when NOT using layout_config (which has user-defined order)
  if (!usingLayout) {
    linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  const totalGeral = linhas.reduce((sum, l) => sum + (l.total ?? 0), 0)
  const [y, m, d] = pedido.data_pedido.split('-')
  const dataFormatada = `${d}/${m}/${y}`

  return {
    nomeFornecedor: (configNome?.valor ?? 'HENRIQUE').toUpperCase(),
    telefone: configTel?.valor ?? '',
    redeNome: rede?.nome?.toUpperCase() ?? '',
    lojaNome: loja?.nome?.toUpperCase() ?? '',
    numerOc: pedido.numero_oc,
    data: dataFormatada,
    linhas,
    totalGeral,
  }
}

function fmt(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(value: number | null, unidade: string): string {
  if (value === null || value === 0) return '-'
  if (unidade === 'KG') return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return String(value)
}

export function generateShareHtml(data: PrintData): string {
  const dataRows = data.linhas.map(l => `
    <tr>
      <td class="c-prod">${l.nome}</td>
      <td class="c-qty">${fmtQty(l.quantidade, l.unidade)}</td>
      <td class="c-un">${l.unidade}</td>
      <td class="c-val">${l.precoUnit > 0 ? fmt(l.precoUnit) : '-'}</td>
      <td class="c-tot">${l.total != null ? fmt(l.total) : '-'}</td>
    </tr>`).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 10pt; background: #fff; width: 148mm; }
.via { width: 148mm; display: flex; flex-direction: column; font-size: 9.5pt; padding: 6mm 7mm; box-sizing: border-box; overflow: visible; }
.h1 { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5mm; }
.h-nome { font-size: 18pt; font-weight: bold; }
.oc-box { border: 1.5px solid #000; padding: 1mm 4mm; font-size: 11pt; font-weight: bold; text-align: center; min-width: 30mm; }
.h2 { font-size: 9pt; margin-bottom: 1.5mm; padding-left: 1mm; }
.h3 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #000; }
.h-rede-loja { font-size: 11pt; font-weight: bold; padding-left: 1mm; }
.date-box { border: 1px solid #000; padding: 1mm 3mm; font-size: 11pt; font-weight: bold; min-width: 24mm; text-align: center; }
.table-outer { border: 1px solid #000; overflow: visible; }
table { width: 100%; border-collapse: collapse; }
th, td { border: none; padding: 0.8mm 1.5mm; font-size: 9.5pt; }
thead tr { border-bottom: 1px solid #000; }
th { background: #fff; }
th.c-prod { text-align: left; font-weight: bold; }
th.c-qty, th.c-un, th.c-val, th.c-tot { text-align: center; font-weight: normal; }
.c-prod { width: 42%; text-align: left; } .c-qty { width: 14%; text-align: right; } .c-un { width: 10%; text-align: center; } .c-val { width: 16%; text-align: right; } .c-tot { width: 18%; text-align: right; }
.foot-total { display: flex; justify-content: flex-end; margin-top: 1.5mm; }
.ft-label, .ft-val { border: 2px solid #000; padding: 1mm 3mm; font-size: 12pt; font-weight: bold; }
.ft-val { min-width: 26mm; text-align: right; border-left: none; }
.foot-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3mm; padding-top: 4mm; gap: 6mm; }
.ft-data { font-size: 9pt; white-space: nowrap; }
.sig-line { flex: 1; padding-top: 20mm; border-bottom: 1px solid #000; }
</style>
</head>
<body>
<div class="via">
  <div class="h1"><span class="h-nome">${data.nomeFornecedor}</span><div class="oc-box">${data.numerOc}</div></div>
  <div class="h2">FONE: ${data.telefone}</div>
  <div class="h3"><span class="h-rede-loja">${data.redeNome}&nbsp;&nbsp;&nbsp;${data.lojaNome}</span><div class="date-box">${data.data}</div></div>
  <div class="table-outer"><table>
    <thead><tr><th class="c-prod">PRODUTO</th><th class="c-qty">Quantidade</th><th class="c-un">Unidade</th><th class="c-val">Valor</th><th class="c-tot">TOTAL</th></tr></thead>
    <tbody>${dataRows}</tbody>
  </table></div>
  <div class="foot-total"><span class="ft-label">TOTAL</span><span class="ft-val">${fmt(data.totalGeral)}</span></div>
  <div class="foot-bottom"><span class="ft-data">DATA&nbsp;&nbsp;_______ / _______ / _______</span><div class="sig-line"></div></div>
</div>
</body>
</html>`
}

export function generatePrintHtml(data: PrintData, preview = false): string {
  const dataRows = data.linhas.map(l => `
    <tr>
      <td class="c-prod">${l.nome}</td>
      <td class="c-qty">${fmtQty(l.quantidade, l.unidade)}</td>
      <td class="c-un">${l.unidade}</td>
      <td class="c-val">${l.precoUnit > 0 ? fmt(l.precoUnit) : '-'}</td>
      <td class="c-tot">${l.total != null ? fmt(l.total) : '-'}</td>
    </tr>`).join('\n')

  function via(): string {
    return `<div class="via">
  <div class="h1"><span class="h-nome">${data.nomeFornecedor}</span><div class="oc-box">${data.numerOc}</div></div>
  <div class="h2">FONE: ${data.telefone}</div>
  <div class="h3"><span class="h-rede-loja">${data.redeNome}&nbsp;&nbsp;&nbsp;${data.lojaNome}</span><div class="date-box">${data.data}</div></div>
  <div class="table-outer"><table>
    <thead><tr><th class="c-prod">PRODUTO</th><th class="c-qty">Quantidade</th><th class="c-un">Unidade</th><th class="c-val">Valor</th><th class="c-tot">TOTAL</th></tr></thead>
    <tbody>${dataRows}</tbody>
  </table></div>
  <div class="foot-total"><span class="ft-label">TOTAL</span><span class="ft-val">${fmt(data.totalGeral)}</span></div>
  <div class="foot-bottom"><span class="ft-data">DATA&nbsp;&nbsp;_______ / _______ / _______</span><div class="sig-line"></div></div>
</div>`
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 10pt; background: ${preview ? '#e5e7eb' : '#fff'}; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #1e293b; }
.btn-print { padding: 6px 18px; background: #16a34a; color: #fff; border: none; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; }
.btn-print:hover { background: #15803d; }
.btn-close { padding: 6px 14px; background: #475569; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
.btn-close:hover { background: #334155; }
.page-wrap { padding: ${preview ? '12px' : '0'}; }
.page { display: flex; flex-direction: row; gap: 0; background: #fff; width: ${preview ? '277mm' : '100%'}; height: ${preview ? '190mm' : '100%'}; ${preview ? 'margin: 0 auto;' : ''} }
.via { width: 50%; height: 100%; display: flex; flex-direction: column; font-size: 9.5pt; padding: 6mm 7mm; box-sizing: border-box; }
.h1 { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5mm; }
.h-nome { font-size: 18pt; font-weight: bold; }
.oc-box { border: 1.5px solid #000; padding: 1mm 4mm; font-size: 11pt; font-weight: bold; text-align: center; min-width: 30mm; }
.h2 { font-size: 9pt; margin-bottom: 1.5mm; padding-left: 1mm; }
.h3 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #000; }
.h-rede-loja { font-size: 11pt; font-weight: bold; padding-left: 1mm; }
.date-box { border: 1px solid #000; padding: 1mm 3mm; font-size: 11pt; font-weight: bold; min-width: 24mm; text-align: center; }
.table-outer { flex: 1; border: 1px solid #000; overflow: hidden; min-height: 0; }
table { width: 100%; border-collapse: collapse; }
th, td { border: none; padding: 0.8mm 1.5mm; font-size: 9.5pt; }
thead tr { border-bottom: 1px solid #000; }
th { background: #fff; }
th.c-prod { text-align: left; font-weight: bold; }
th.c-qty, th.c-un, th.c-val, th.c-tot { text-align: center; font-weight: normal; }
.c-prod { width: 42%; text-align: left; } .c-qty { width: 14%; text-align: right; } .c-un { width: 10%; text-align: center; } .c-val { width: 16%; text-align: right; } .c-tot { width: 18%; text-align: right; }
.foot-total { display: flex; justify-content: flex-end; margin-top: 1.5mm; }
.ft-label, .ft-val { border: 2px solid #000; padding: 1mm 3mm; font-size: 12pt; font-weight: bold; }
.ft-val { min-width: 26mm; text-align: right; border-left: none; }
.foot-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 4mm; gap: 6mm; }
.ft-data { font-size: 9pt; white-space: nowrap; }
.sig-line { flex: 1; padding-top: 20mm; border-bottom: 1px solid #000; }
.div-line { border-left: 1px dashed #999; align-self: stretch; }
@media print { @page { size: A4 landscape; margin: 0; } body { background: #fff; } .toolbar { display: none; } .page-wrap { padding: 0; } .page { width: 297mm; height: 210mm; flex-direction: row; } .via { width: 50%; height: 210mm; padding: 8mm 9mm; } }
</style>
</head>
<script>document.addEventListener('keydown', function(e){ if(e.key==='Escape') window.close(); });</script>
<body>
${preview ? `<div class="toolbar"><button class="btn-print" onclick="window.print()">🖨️ Imprimir</button><button class="btn-close" onclick="window.close()">✕ Fechar</button></div>` : ''}
<div class="page-wrap">
  <div class="page">
    ${via()}
    <div class="div-line"></div>
    ${via()}
  </div>
</div>
</body>
</html>`
}

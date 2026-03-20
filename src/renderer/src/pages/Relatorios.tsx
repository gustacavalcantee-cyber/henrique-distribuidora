import { useState, useEffect } from 'react'
import { Printer } from 'lucide-react'
import type { Rede, Loja, Franqueado, QuinzenaSummary, FinanceiroSummary, CobrancaLojaResult, NotaPagamento, ProdutoRelatorioResult } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useIpc } from '../hooks/useIpc'

function formatMoney(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatQty(v: number | null | undefined) {
  if (v == null) return ''
  const rounded = Math.round(v * 100) / 100
  return rounded.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
function formatDate(iso: string) {
  const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`
}

function QuinzenaTab() {
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const now = new Date()
  const [redeId, setRedeId] = useState<number | ''>('')
  const [lojaId, setLojaId] = useState<number | ''>('')
  const [mes, setMes] = useState(1)
  const [ano, setAno] = useState(now.getFullYear())
  const [quinzena, setQuinzena] = useState<1 | 2>(1)
  const [summary, setSummary] = useState<QuinzenaSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editingItemValue, setEditingItemValue] = useState('')

  const handleBuscar = async () => {
    if (!redeId) { alert('Selecione uma rede'); return }
    setLoading(true)
    const data = await window.electron.invoke<QuinzenaSummary>(
      IPC.RELATORIO_QUINZENA, Number(redeId), lojaId !== '' ? Number(lojaId) : 0, mes, ano, quinzena
    )
    setSummary(data)
    setEditingItemId(null)
    setLoading(false)
  }

  const handleItemPrecoSave = async (item_id: number, value: string) => {
    setEditingItemId(null)
    const num = parseFloat(value.replace(',', '.'))
    if (isNaN(num) || num <= 0) return
    await window.electron.invoke(IPC.ITENS_UPDATE_SINGLE_PRECO, item_id, num)
    // Reload to reflect new price in both panels
    handleBuscar()
  }

  const filteredLojas = lojas?.filter(l => !redeId || l.rede_id === Number(redeId)) ?? []

  const handlePrintRelatorio = async () => {
    if (!summary) return
    const nomeFornecedor: string = await window.electron.invoke(IPC.CONFIG_GET, 'nome_fornecedor') ?? ''
    const redeName = redes?.find(r => r.id === Number(redeId))?.nome?.replace(/_/g, ' ')?.toUpperCase() ?? ''
    const lojaObj = lojaId !== '' ? filteredLojas.find(l => l.id === Number(lojaId)) : null
    const lojaName = lojaObj ? lojaObj.nome.replace(/_/g, ' ').toUpperCase() : 'TODAS AS LOJAS'
    const lojaCnpj = lojaObj?.cnpj ?? ''
    const prods = summary.produtos as Array<{ id: number; nome: string; unidade: string }>
    const matrizSorted = [...summary.matriz].sort((a, b) => a.data_pedido.localeCompare(b.data_pedido))

    // Price per product id (from detalhe, most recent non-zero price)
    const precosPorId: Record<number, number> = {}
    for (const d of summary.detalhe) {
      const prod = prods.find(p => p.nome === d.produto_nome)
      if (prod && d.preco_unit > 0 && !precosPorId[prod.id]) {
        precosPorId[prod.id] = d.preco_unit
      }
    }

    // Total qty per product id
    const totalQty: Record<number, number> = {}
    for (const row of matrizSorted) {
      for (const [prodId, qty] of Object.entries(row.quantidades)) {
        totalQty[Number(prodId)] = (totalQty[Number(prodId)] ?? 0) + (qty as number)
      }
    }

    const grandTotal = prods.reduce((s, p) => s + (totalQty[p.id] ?? 0) * (precosPorId[p.id] ?? 0), 0)

    const MIN_ROWS = 15
    const extraRows = Math.max(0, MIN_ROWS - matrizSorted.length)

    const fmtDate = (iso: string) => {
      const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
      const [, m, d] = iso.split('-')
      return `${d}/${months[Number(m) - 1]}`
    }
    const fmtQty = (n: number | null | undefined) => {
      if (n == null || n === 0) return '-'
      return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    const fmtMoney = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 9pt; background: #fff; }
.toolbar { display:flex; gap:8px; padding:8px 14px; background:#1e293b; }
.btn-print { padding:6px 18px; background:#16a34a; color:#fff; border:none; border-radius:4px; font-size:13px; font-weight:bold; cursor:pointer; }
.btn-close { padding:6px 14px; background:#475569; color:#fff; border:none; border-radius:4px; font-size:13px; cursor:pointer; }
.content { padding: 10mm 12mm; }
.hdr1 { font-weight:bold; font-size:12pt; margin-bottom:1mm; }
.hdr2 { font-size:10pt; font-weight:bold; margin-bottom:5mm; }
table { border-collapse:collapse; width:100%; border: 1px solid #555; }
th, td { border: none; padding:1mm 2.5mm; text-align:center; font-size:8.5pt; white-space:nowrap; }
th { background:#e8e8e8; font-weight:bold; }
thead tr { border-bottom: 1px solid #555; }
.c-data { text-align:left; min-width:20mm; }
.c-dot { color:#bbb; }
.row-total td { font-weight:bold; background:#f5f5f5; border-top: 2px solid #555; }
.row-preco td { background:#fafafa; }
.row-grand td { font-weight:bold; font-size:9.5pt; background:#efefef; border-top:2px solid #333; }
.row-grand .c-data { text-align:left; }
@media print { @page { size: A4 landscape; margin: 10mm; } .toolbar { display:none; } }
</style></head><body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">Imprimir</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>
<div class="content">
  <div class="hdr1">${nomeFornecedor.toUpperCase()}</div>
  <div class="hdr2">${redeName}${lojaName && lojaName !== 'TODAS AS LOJAS' ? ' ' + lojaName : ''}${lojaCnpj ? `<br><span style="font-weight:normal;font-size:8.5pt;">CNPJ: ${lojaCnpj}</span>` : ''}</div>
  <table>
    <thead>
      <tr>
        <th class="c-data">DATA</th>
        ${prods.map(p => `<th>${p.nome.toUpperCase()}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${matrizSorted.map(row => `<tr>
        <td class="c-data">${fmtDate(row.data_pedido)}</td>
        ${prods.map(p => `<td>${fmtQty((row.quantidades as Record<number,number>)[p.id])}</td>`).join('')}
      </tr>`).join('')}
      ${Array(extraRows).fill(null).map(() => `<tr>
        <td class="c-data c-dot">.</td>
        ${prods.map(() => `<td class="c-dot">-</td>`).join('')}
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr class="row-total">
        <td class="c-data">Total kg/mç</td>
        ${prods.map(p => `<td>${fmtQty(totalQty[p.id])}</td>`).join('')}
      </tr>
      <tr class="row-preco">
        <td class="c-data">Preço kg/unt</td>
        ${prods.map(p => `<td>${fmtMoney(precosPorId[p.id] ?? 0)}</td>`).join('')}
      </tr>
      <tr class="row-grand">
        <td class="c-data">${fmtMoney(grandTotal)}</td>
        ${prods.map(p => `<td>${fmtMoney((totalQty[p.id] ?? 0) * (precosPorId[p.id] ?? 0))}</td>`).join('')}
      </tr>
    </tfoot>
  </table>
</div>
</body></html>`

    await window.electron.invoke(IPC.PRINT_HTML, html, `Relatório — ${redeName} ${lojaName}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end bg-white border rounded p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rede *</label>
          <select className="border rounded px-2 py-1 text-sm" value={redeId} onChange={e => setRedeId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Selecione</option>
            {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Loja</label>
          <select className="border rounded px-2 py-1 text-sm" value={lojaId} onChange={e => setLojaId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Todas</option>
            {filteredLojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Mês</label>
          <select className="border rounded px-2 py-1 text-sm" value={mes} onChange={e => setMes(Number(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Ano</label>
          <input type="number" className="border rounded px-2 py-1 text-sm w-20" value={ano} onChange={e => setAno(Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Quinzena</label>
          <select className="border rounded px-2 py-1 text-sm" value={quinzena} onChange={e => setQuinzena(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1ª (1-15)</option>
            <option value={2}>2ª (16-fim)</option>
          </select>
        </div>
        <button onClick={handleBuscar} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Buscar
        </button>
      </div>

      {loading && <div className="text-gray-500">Carregando...</div>}

      {summary && (
        <>
          {/* Summary cards */}
          <div className="flex gap-4">
            <div className="bg-green-50 border border-green-200 rounded p-3 flex-1">
              <div className="text-xs text-gray-500">VENDAS</div>
              <div className="text-lg font-bold text-green-700">R$ {formatMoney(summary.total_venda)}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3 flex-1">
              <div className="text-xs text-gray-500">CUSTO</div>
              <div className="text-lg font-bold text-red-700">R$ {formatMoney(summary.total_custo)}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 flex-1">
              <div className="text-xs text-gray-500">MARGEM</div>
              <div className="text-lg font-bold text-blue-700">{summary.margem.toFixed(1)}%</div>
            </div>
          </div>

          {/* Print button */}
          <div className="flex justify-end">
            <button onClick={handlePrintRelatorio} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-medium">
              Imprimir Relatório
            </button>
          </div>

          {/* Two-panel layout */}
          <div className="flex gap-4 overflow-auto">
            {/* Left: Detail — grouped by date → OC */}
            <div className="flex-1 overflow-auto">
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">Detalhe por Pedido</h3>
              {(() => {
                // Group: date → ocKey → items
                const grupos = new Map<string, Map<string, typeof summary.detalhe>>()
                for (const d of summary.detalhe) {
                  if (!grupos.has(d.data_pedido)) grupos.set(d.data_pedido, new Map())
                  const ocKey = `${d.numero_oc}||${d.loja_nome}`
                  const dateMap = grupos.get(d.data_pedido)!
                  if (!dateMap.has(ocKey)) dateMap.set(ocKey, [])
                  dateMap.get(ocKey)!.push(d)
                }
                return (
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border px-2 py-1 text-left">Produto</th>
                        <th className="border px-2 py-1">Qtd</th>
                        <th className="border px-2 py-1">Preço</th>
                        <th className="border px-2 py-1">Total</th>
                        <th className="border px-2 py-1">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(grupos.entries()).map(([date, ocs]) => (
                        <>
                          {/* Date header row */}
                          <tr key={`d-${date}`} className="bg-blue-50">
                            <td colSpan={5} className="px-2 py-1 font-bold text-blue-800">{formatDate(date)}</td>
                          </tr>
                          {Array.from(ocs.entries()).map(([ocKey, items]) => {
                            const [oc, loja] = ocKey.split('||')
                            return (
                              <>
                                {/* OC + loja row */}
                                <tr key={`oc-${ocKey}`} className="bg-gray-100">
                                  <td colSpan={5} className="px-3 py-0.5 font-mono text-gray-600">
                                    {oc} <span className="text-gray-400 font-sans">—</span> {loja}
                                  </td>
                                </tr>
                                {/* Product rows */}
                                {[...items].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, 'pt-BR')).map((item, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="border-b px-4 py-0.5">{item.produto_nome}</td>
                                    <td className="border-b px-2 py-0.5 text-center">{formatQty(item.quantidade)}</td>
                                    <td className="border-b px-1 py-0.5 text-right">
                                      {editingItemId === item.item_id ? (
                                        <input
                                          type="text"
                                          autoFocus
                                          className="w-16 text-xs border border-blue-400 rounded px-1 py-0.5 text-right"
                                          value={editingItemValue}
                                          onChange={e => setEditingItemValue(e.target.value)}
                                          onBlur={e => handleItemPrecoSave(item.item_id, e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleItemPrecoSave(item.item_id, editingItemValue)
                                            if (e.key === 'Escape') setEditingItemId(null)
                                          }}
                                        />
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:bg-yellow-100 px-1 rounded"
                                          title="Clique para editar o preço"
                                          onClick={() => { setEditingItemId(item.item_id); setEditingItemValue(String(item.preco_unit).replace('.', ',')) }}
                                        >
                                          {formatMoney(item.preco_unit)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="border-b px-2 py-0.5 text-right">{formatMoney(item.total_venda)}</td>
                                    <td className="border-b px-2 py-0.5 text-right">{formatMoney(item.total_custo)}</td>
                                  </tr>
                                ))}
                              </>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>

            {/* Right: Matrix */}
            <div className="flex-1 overflow-auto">
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">Matriz para Nota Fiscal</h3>
              <table className="text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-2 py-1">Data</th>
                    {summary.produtos.map(p => <th key={p.id} className="border px-2 py-1">{p.nome}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {summary.matriz.map((row, i) => (
                    <tr key={i}>
                      <td className="border px-2 py-0.5">{formatDate(row.data_pedido)}</td>
                      {summary.produtos.map(p => (
                        <td key={p.id} className="border px-2 py-0.5 text-center">
                          {formatQty(row.quantidades[p.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Total kg/mç row */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                    <td className="border px-2 py-1">Total kg/mç</td>
                    {summary.produtos.map(p => {
                      const total = summary.matriz.reduce((s, r) => s + (r.quantidades[p.id] ?? 0), 0)
                      return <td key={p.id} className="border px-2 py-1 text-center">{total > 0 ? total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                    })}
                  </tr>
                  {/* Preço kg/unt row */}
                  <tr className="bg-gray-50">
                    <td className="border px-2 py-1">Preço kg/unt</td>
                    {summary.produtos.map(p => {
                      const detItem = summary.detalhe.find(d => d.produto_nome === p.nome && d.preco_unit > 0)
                      return <td key={p.id} className="border px-2 py-1 text-center">{detItem ? detItem.preco_unit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                    })}
                  </tr>
                  {/* Per-product totals + grand total */}
                  {(() => {
                    const grandTotal = summary.produtos.reduce((s, p) => {
                      const qty = summary.matriz.reduce((q, r) => q + (r.quantidades[p.id] ?? 0), 0)
                      const det = summary.detalhe.find(d => d.produto_nome === p.nome && d.preco_unit > 0)
                      return s + qty * (det?.preco_unit ?? 0)
                    }, 0)
                    return (
                      <tr className="bg-gray-200 font-bold border-t-2 border-gray-500">
                        <td className="border px-2 py-1">{grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        {summary.produtos.map(p => {
                          const qty = summary.matriz.reduce((q, r) => q + (r.quantidades[p.id] ?? 0), 0)
                          const det = summary.detalhe.find(d => d.produto_nome === p.nome && d.preco_unit > 0)
                          const val = qty * (det?.preco_unit ?? 0)
                          return <td key={p.id} className="border px-2 py-1 text-center">{val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                        })}
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FinanceiroTab() {
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const now = new Date()
  const [mes, setMes] = useState(0)
  const [ano, setAno] = useState(now.getFullYear())
  const [redeId, setRedeId] = useState<number | ''>('')
  const [summary, setSummary] = useState<FinanceiroSummary | null>(null)
  const [notas, setNotas] = useState<NotaPagamento[] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleBuscar = async () => {
    setLoading(true)
    const rid = redeId !== '' ? Number(redeId) : undefined
    const [data, notasList] = await Promise.all([
      window.electron.invoke<FinanceiroSummary>(IPC.RELATORIO_FINANCEIRO, mes, ano, rid),
      window.electron.invoke<NotaPagamento[]>(IPC.NOTAS_LIST, mes, ano, rid),
    ])
    setSummary(data)
    setNotas(notasList)
    setLoading(false)
  }

  const handleStatusChange = async (pedido_id: number, status: string) => {
    await window.electron.invoke(IPC.PEDIDOS_UPDATE_STATUS, pedido_id, status)
    setNotas(prev => prev ? prev.map(n => n.pedido_id === pedido_id ? { ...n, status_pagamento: status } : n) : prev)
  }

  const cards = summary ? [
    { label: 'RECEITA BRUTA', value: `R$ ${formatMoney(summary.receita_bruta)}`, color: 'green' },
    { label: 'CUSTO PRODUTOS', value: `R$ ${formatMoney(summary.custo_produtos)}`, color: 'red' },
    { label: 'MARGEM BRUTA', value: `${summary.margem_bruta.toFixed(1)}%`, color: 'blue' },
    { label: 'DESPESAS', value: `R$ ${formatMoney(summary.despesas)}`, color: 'orange' },
    { label: 'LUCRO LÍQUIDO', value: `${summary.lucro_liquido.toFixed(1)}%`, color: summary.lucro_liquido >= 0 ? 'green' : 'red' },
  ] : []

  const colorMap: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  }

  const statusColor: Record<string, string> = {
    aberto: 'bg-yellow-100 text-yellow-800',
    atrasada: 'bg-red-100 text-red-800',
    paga: 'bg-green-100 text-green-800',
  }

  // Group notas by loja_nome
  const notasByLoja = notas ? notas.reduce<Record<string, NotaPagamento[]>>((acc, n) => {
    if (!acc[n.loja_nome]) acc[n.loja_nome] = []
    acc[n.loja_nome].push(n)
    return acc
  }, {}) : {}

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-end bg-white border rounded p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Mês</label>
          <select className="border rounded px-2 py-1 text-sm" value={mes} onChange={e => setMes(Number(e.target.value))}>
            <option value={0}>Todos</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Ano</label>
          <input type="number" className="border rounded px-2 py-1 text-sm w-20" value={ano} onChange={e => setAno(Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rede</label>
          <select className="border rounded px-2 py-1 text-sm" value={redeId} onChange={e => setRedeId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Todas</option>
            {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <button onClick={handleBuscar} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Buscar
        </button>
      </div>

      {loading && <div className="text-gray-500">Carregando...</div>}

      {summary && (
        <>
          <div className="grid grid-cols-5 gap-3">
            {cards.map(card => (
              <div key={card.label} className={`border rounded p-3 ${colorMap[card.color] ?? 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                <div className="text-xs opacity-70">{card.label}</div>
                <div className="text-lg font-bold">{card.value}</div>
              </div>
            ))}
          </div>

          {notas && notas.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">{mes === 0 ? `Notas de ${ano}` : 'Notas do Mês'}</h3>
              <div className="flex flex-col gap-3">
                {Object.entries(notasByLoja).map(([lojaName, lojaNotas]) => (
                  <div key={lojaName} className="border rounded bg-white overflow-hidden">
                    <div className="bg-gray-100 px-3 py-1.5 font-semibold text-sm text-gray-700 flex justify-between items-center">
                      <span>{lojaName}</span>
                      <span className="text-xs font-normal text-gray-500">
                        {lojaNotas.filter(n => n.status_pagamento === 'paga').length}/{lojaNotas.length} pagas &nbsp;|&nbsp;
                        R$ {formatMoney(lojaNotas.reduce((s, n) => s + n.total_venda, 0))}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="text-left px-3 py-1 font-medium">Data</th>
                          <th className="text-left px-3 py-1 font-medium">OC</th>
                          <th className="text-right px-3 py-1 font-medium">Valor</th>
                          <th className="text-center px-3 py-1 font-medium">Status</th>
                          <th className="px-3 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lojaNotas.map(nota => (
                          <tr key={nota.pedido_id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-1.5">{formatDate(nota.data_pedido)}</td>
                            <td className="px-3 py-1.5 text-gray-600">{nota.numero_oc}</td>
                            <td className="px-3 py-1.5 text-right">R$ {formatMoney(nota.total_venda)}</td>
                            <td className="px-3 py-1.5 text-center">
                              <select
                                className={`text-xs px-2 py-0.5 rounded border-0 font-medium cursor-pointer ${statusColor[nota.status_pagamento] ?? 'bg-gray-100 text-gray-700'}`}
                                value={nota.status_pagamento}
                                onChange={e => handleStatusChange(nota.pedido_id, e.target.value)}
                              >
                                <option value="aberto">Em Aberto</option>
                                <option value="atrasada">Atrasada</option>
                                <option value="paga">Paga</option>
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                title="Imprimir nota"
                                onClick={() => window.electron.invoke(IPC.PRINT_PEDIDO, nota.pedido_id).catch(console.error)}
                                className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                              >
                                <Printer size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.top_lojas.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">Top Lojas</h3>
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-3 py-1">Loja</th>
                    <th className="border px-3 py-1">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_lojas.map((l, i) => (
                    <tr key={i}>
                      <td className="border px-3 py-1">{l.loja_nome}</td>
                      <td className="border px-3 py-1 text-right">R$ {formatMoney(l.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CobrancaTab() {
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const { data: franqueados } = useIpc<Franqueado[]>(IPC.FRANQUEADOS_LIST)
  const now = new Date()
  const [redeId, setRedeId] = useState<number | ''>('')
  const [franqueadoId, setFranqueadoId] = useState<number | ''>('')
  const [selectedLojas, setSelectedLojas] = useState<Set<number>>(new Set())
  const [lojaOrder, setLojaOrder] = useState<number[]>([])
  const [mes, setMes] = useState(1)
  const [ano, setAno] = useState(now.getFullYear())
  const [periodo, setPeriodo] = useState<'1' | '2' | 'mes'>('1')
  const [results, setResults] = useState<CobrancaLojaResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFranqueadoChange = (val: number | '') => {
    setFranqueadoId(val)
    setResults(null)
    if (val !== '') {
      const fLojas = (lojas ?? []).filter(l => l.franqueado_id === Number(val))
      setSelectedLojas(new Set(fLojas.map(l => l.id)))
    }
  }

  const filteredLojas = lojas?.filter(l => {
    if (franqueadoId !== '') return l.franqueado_id === Number(franqueadoId)
    return !redeId || l.rede_id === Number(redeId)
  }) ?? []

  // Apply saved order to filteredLojas
  const orderedLojas = (() => {
    if (lojaOrder.length === 0) return filteredLojas
    const map = new Map(filteredLojas.map(l => [l.id, l]))
    const ordered = lojaOrder.filter(id => map.has(id)).map(id => map.get(id)!)
    const remaining = filteredLojas.filter(l => !lojaOrder.includes(l.id))
    return [...ordered, ...remaining]
  })()

  // Load saved order when rede changes or lojas data loads
  useEffect(() => {
    const key = `cobranca_order_${redeId || 'all'}`
    const saved = localStorage.getItem(key)
    setLojaOrder(saved ? JSON.parse(saved) : [])
  }, [redeId, lojas])

  const saveOrder = (ids: number[]) => {
    const key = `cobranca_order_${redeId || 'all'}`
    localStorage.setItem(key, JSON.stringify(ids))
    setLojaOrder(ids)
  }

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const ids = orderedLojas.map(l => l.id)
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    saveOrder(ids)
  }

  const moveDown = (idx: number) => {
    if (idx === orderedLojas.length - 1) return
    const ids = orderedLojas.map(l => l.id)
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    saveOrder(ids)
  }

  const toggleLoja = (id: number) => {
    setSelectedLojas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedLojas.size === orderedLojas.length) {
      setSelectedLojas(new Set())
    } else {
      setSelectedLojas(new Set(orderedLojas.map(l => l.id)))
    }
  }

  const handleBuscar = async () => {
    if (selectedLojas.size === 0) { alert('Selecione ao menos uma loja'); return }
    setLoading(true)
    const orderedSelected = orderedLojas.filter(l => selectedLojas.has(l.id)).map(l => l.id)
    const data = await window.electron.invoke<CobrancaLojaResult[]>(
      IPC.RELATORIO_COBRANCA, orderedSelected, mes, ano, periodo
    )
    setResults(data)
    setLoading(false)
  }

  const grandTotal = results?.reduce((s, r) => s + r.total_venda, 0) ?? 0

  const mesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  const periodoLabel = periodo === '1'
    ? `01 A 15/${String(mes).padStart(2,'0')}`
    : periodo === '2'
    ? `16 A ${new Date(ano, mes, 0).getDate()}/${String(mes).padStart(2,'0')}`
    : mesNomes[mes - 1].toUpperCase() + ` ${ano}`

  const handlePrint = async () => {
    if (!results) return
    const nomeFornecedor: string = await window.electron.invoke(IPC.CONFIG_GET, 'nome_fornecedor') ?? ''
    const franqueadoName = franqueados?.find(f => f.id === Number(franqueadoId))?.nome?.toUpperCase() ?? ''
    const redeName = franqueadoName || (redes?.find(r => r.id === Number(redeId))?.nome?.replace(/_/g, ' ')?.toUpperCase() ?? 'LOJAS')
    const titulo = `VENDAS ${periodoLabel} DE ${ano}`
    const fmtMoney = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    // One box per loja
    const boxes = results.map(r => `
  <div class="box">
    <table>
      <thead><tr><th>LOJA</th><th>PERIODO</th><th style="text-align:right">VALOR</th></tr></thead>
      <tbody>
        <tr>
          <td class="loja-nome">${r.loja_nome.replace(/_/g,' ').toUpperCase()}</td>
          <td class="periodo">${r.periodo_str}</td>
          <td class="valor">${fmtMoney(r.total_venda)}</td>
        </tr>
        <tr class="spacer"><td colspan="3"></td></tr>
        <tr class="spacer"><td colspan="3"></td></tr>
        <tr class="spacer"><td colspan="3"></td></tr>
        <tr class="subtotal-row">
          <td colspan="2"></td>
          <td class="subtotal-val">${fmtMoney(r.total_venda)}</td>
        </tr>
      </tbody>
    </table>
  </div>`).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 10pt; background: #fff; }
.toolbar { display:flex; gap:8px; padding:8px 14px; background:#1e293b; }
.btn-print { padding:6px 18px; background:#16a34a; color:#fff; border:none; border-radius:4px; font-size:13px; font-weight:bold; cursor:pointer; }
.btn-close { padding:6px 14px; background:#475569; color:#fff; border:none; border-radius:4px; font-size:13px; cursor:pointer; }
.content { padding: 10mm 15mm; }
.header { margin-bottom:8mm; }
.header .h1 { font-weight:bold; font-size:12pt; }
.header .h2 { font-size:10pt; }
.box { border: 1px solid #555; margin-bottom:5mm; page-break-inside: avoid; break-inside: avoid; }
table { border-collapse:collapse; width:100%; }
th, td { padding:1.5mm 3mm; }
th { background:#e0e0e0; font-weight:bold; font-size:9.5pt; text-align:left; border-bottom:1px solid #555; }
td.loja-nome { width:40%; }
td.periodo { width:35%; }
td.valor { width:25%; text-align:right; font-weight:bold; }
tr.spacer td { height:6mm; }
tr.subtotal-row td { border-top:1px solid #aaa; }
td.subtotal-val { font-weight:bold; font-size:10.5pt; text-align:right; background:#f0f0f0; }
.soma-block { margin-top:3mm; }
.soma-total { border: 2px solid #333; margin-bottom:3mm; width:100%; table-layout:fixed; }
.soma-total td { font-weight:bold; font-size:11pt; padding:2.5mm 3mm; }
.soma-label { text-align:left; }
.soma-valor { text-align:right; width:35%; }
@media print { @page { size: A4; margin: 12mm; } .toolbar { display:none; } }
</style></head><body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">Imprimir</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>
<div class="content">
  <div class="header">
    <div class="h1">${titulo}</div>
    <div class="h2">DE: ${nomeFornecedor.toUpperCase()}</div>
    <div class="h2">PARA: ${redeName}</div>
  </div>
  ${boxes}
  <div class="soma-block">
    <table class="soma-total"><tr>
      <td class="soma-label">TOTAL&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;</td>
      <td class="soma-valor">${fmtMoney(grandTotal)}</td>
    </tr></table>
  </div>
</div>
</body></html>`

    await window.electron.invoke(IPC.PRINT_HTML, html, `Cobrança — ${periodoLabel}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end bg-white border rounded p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Franqueado</label>
          <select className="border rounded px-2 py-1 text-sm" value={franqueadoId} onChange={e => handleFranqueadoChange(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">—</option>
            {franqueados?.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rede</label>
          <select className="border rounded px-2 py-1 text-sm" value={redeId} onChange={e => { setRedeId(e.target.value === '' ? '' : Number(e.target.value)); setSelectedLojas(new Set()); setResults(null) }}>
            <option value="">Todas</option>
            {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Mês</label>
          <select className="border rounded px-2 py-1 text-sm" value={mes} onChange={e => setMes(Number(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Ano</label>
          <input type="number" className="border rounded px-2 py-1 text-sm w-20" value={ano} onChange={e => setAno(Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Período</label>
          <select className="border rounded px-2 py-1 text-sm" value={periodo} onChange={e => setPeriodo(e.target.value as '1' | '2' | 'mes')}>
            <option value="1">1ª Quinzena (1-15)</option>
            <option value="2">2ª Quinzena (16-fim)</option>
            <option value="mes">Mês completo</option>
          </select>
        </div>
        <button onClick={handleBuscar} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Buscar
        </button>
      </div>

      {/* Lojas selector with order */}
      {orderedLojas.length > 0 && (
        <div className="bg-white border rounded p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-gray-500 font-medium">LOJAS</span>
            <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
              {selectedLojas.size === orderedLojas.length ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
            <span className="text-xs text-gray-400">Use ▲▼ para ordenar — a ordem é salva automaticamente</span>
          </div>
          <div className="flex flex-col gap-1">
            {orderedLojas.map((l, idx) => (
              <div key={l.id} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-xs h-3">▲</button>
                  <button onClick={() => moveDown(idx)} disabled={idx === orderedLojas.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-xs h-3">▼</button>
                </div>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedLojas.has(l.id)} onChange={() => toggleLoja(l.id)} className="cursor-pointer" />
                  {l.nome.replace(/_/g, ' ')}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="text-gray-500 text-sm">Carregando...</div>}

      {results && (
        <>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Período: <span className="font-semibold">{periodoLabel}</span> &nbsp;·&nbsp;
              {results.length} loja{results.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
              Total: <span className="font-bold text-green-700">R$ {grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <button onClick={handlePrint} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-medium">
              Imprimir Cobrança
            </button>
          </div>

          {/* One card per loja */}
          <div className="flex flex-col gap-3">
            {results.map(r => (
              <div key={r.loja_id} className="bg-white border rounded overflow-hidden">
                <table className="text-sm border-collapse w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border-b px-3 py-1.5 text-left">Loja</th>
                      <th className="border-b px-3 py-1.5 text-left">Período</th>
                      <th className="border-b px-3 py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-1.5 font-medium">{r.loja_nome.replace(/_/g,' ')}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.periodo_str}</td>
                      <td className="px-3 py-1.5 text-right font-bold">{r.total_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td className="px-3 py-1 text-right font-bold text-gray-700" colSpan={3}>
                        {r.total_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
            <div className="bg-gray-800 text-white rounded px-3 py-2 flex justify-between font-bold">
              <span>SOMA TOTAL</span>
              <span>R$ {grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PorProdutoTab() {
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const { data: todosProdutos } = useIpc<{ id: number; nome: string; unidade: string; rede_id: number | null }[]>(IPC.PRODUTOS_LIST)
  const now = new Date()
  const [redeId, setRedeId] = useState<number | ''>('')
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [periodo, setPeriodo] = useState<'1' | '2' | 'mes'>('1')
  const [produtosSelecionados, setProdutosSelecionados] = useState<number[]>([])
  const [agruparPor, setAgruparPor] = useState<'loja' | 'franqueado'>('loja')
  const [resultado, setResultado] = useState<ProdutoRelatorioResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  const produtosDaRede = (todosProdutos ?? []).filter(p => p.rede_id === redeId || redeId === '')
  const todosChecked = produtosDaRede.length > 0 && produtosSelecionados.length === produtosDaRede.length

  useEffect(() => { setProdutosSelecionados([]); setResultado(null) }, [redeId])

  function toggleProduto(id: number) {
    setProdutosSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleTodos() {
    if (todosChecked) setProdutosSelecionados([])
    else setProdutosSelecionados(produtosDaRede.map(p => p.id))
  }

  async function handleBuscar() {
    if (!redeId) { alert('Selecione uma rede'); return }
    if (produtosSelecionados.length === 0) { alert('Selecione ao menos um produto'); return }
    setLoading(true)
    const data = await window.electron.invoke<ProdutoRelatorioResult[]>(
      IPC.RELATORIO_POR_PRODUTO, Number(redeId), produtosSelecionados, mes, ano, periodo, agruparPor
    )
    setResultado(data)
    setLoading(false)
  }

  function handlePrint() {
    if (!resultado) return
    const rede = redes?.find(r => r.id === redeId)
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const periodoStr = periodo === '1' ? '1ª Quinzena' : periodo === '2' ? '2ª Quinzena' : 'Mês inteiro'
    const comDados = resultado.filter(r => r.linhas.length > 0)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
      h1{font-size:16px;margin-bottom:4px} h2{font-size:13px;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}
      th{background:#f3f3f3;font-weight:600} .total{font-weight:bold;background:#f9f9f9}
      .right{text-align:right}
    </style></head><body>
    <h1>Relatório Por Produto — ${rede?.nome ?? ''}</h1>
    <p>${meses[mes-1]} ${ano} — ${periodoStr}</p>
    ${comDados.map(r => `
      <h2>${r.produto_nome} (${r.unidade})</h2>
      <table>
        <thead><tr><th>${agruparPor === 'franqueado' ? 'Franqueado' : 'Loja'}</th><th class="right">Quantidade</th><th class="right">Valor (R$)</th></tr></thead>
        <tbody>
          ${r.linhas.map(l => `<tr>
            <td>${l.nome}</td>
            <td class="right">${formatQty(l.quantidade)} ${r.unidade}</td>
            <td class="right">R$ ${formatMoney(l.valor)}</td>
          </tr>`).join('')}
          <tr class="total">
            <td>Total</td>
            <td class="right">${formatQty(r.total_quantidade)} ${r.unidade}</td>
            <td class="right">R$ ${formatMoney(r.total_valor)}</td>
          </tr>
        </tbody>
      </table>`).join('')}
    </body></html>`
    window.electron.invoke(IPC.PRINT_HTML, html)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rede</label>
            <select value={redeId} onChange={e => setRedeId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione...</option>
              {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Mês</label>
              <select value={mes} onChange={e => setMes(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i) =>
                  <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
              <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
          <div className="flex gap-4">
            {([['1','1ª Quinzena'],['2','2ª Quinzena'],['mes','Mês inteiro']] as const).map(([v,l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" value={v} checked={periodo === v} onChange={() => setPeriodo(v)} /> {l}
              </label>
            ))}
          </div>
        </div>

        {redeId !== '' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Produtos</label>
            <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer pb-1 border-b border-gray-100">
                <input type="checkbox" checked={todosChecked} onChange={toggleTodos} /> Todos
              </label>
              {produtosDaRede.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={produtosSelecionados.includes(p.id)} onChange={() => toggleProduto(p.id)} />
                  {p.nome} <span className="text-gray-400 text-xs">({p.unidade})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Agrupar por</label>
          <div className="flex gap-4">
            {([['loja','Loja'],['franqueado','Franqueado']] as const).map(([v,l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" value={v} checked={agruparPor === v} onChange={() => setAgruparPor(v)} /> {l}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={handleBuscar} disabled={loading || !redeId || produtosSelecionados.length === 0}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          {resultado && resultado.some(r => r.linhas.length > 0) && (
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
              <Printer size={14} /> Imprimir
            </button>
          )}
        </div>
      </div>

      {resultado && (
        <div className="space-y-4">
          {resultado.filter(r => r.linhas.length > 0).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum dado encontrado para o período.</p>
          ) : resultado.filter(r => r.linhas.length > 0).map(r => (
            <div key={r.produto_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                <h3 className="font-semibold text-emerald-800 text-sm">
                  {r.produto_nome} <span className="ml-1 text-xs font-normal text-emerald-600">({r.unidade})</span>
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">
                      {agruparPor === 'franqueado' ? 'Franqueado' : 'Loja'}
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Quantidade</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.linhas.map((l, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">{l.nome}</td>
                      <td className="px-5 py-2.5 text-right">{formatQty(l.quantidade)} {r.unidade}</td>
                      <td className="px-5 py-2.5 text-right">R$ {formatMoney(l.valor)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                    <td className="px-5 py-2.5">Total</td>
                    <td className="px-5 py-2.5 text-right">{formatQty(r.total_quantidade)} {r.unidade}</td>
                    <td className="px-5 py-2.5 text-right">R$ {formatMoney(r.total_valor)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type RelatTab = 'quinzena' | 'financeiro' | 'cobranca' | 'porproduto'

export function Relatorios() {
  const [activeTab, setActiveTab] = useState<RelatTab>('quinzena')

  return (
    <div className="flex flex-col gap-4 h-full">
      <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
      <div className="border-b border-gray-200">
        <nav className="flex gap-0">
          {([['quinzena', 'Quinzena'], ['financeiro', 'Financeiro'], ['cobranca', 'Cobrança'], ['porproduto', 'Por Produto']] as [RelatTab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'quinzena' && <QuinzenaTab />}
        {activeTab === 'financeiro' && <FinanceiroTab />}
        {activeTab === 'cobranca' && <CobrancaTab />}
        {activeTab === 'porproduto' && <PorProdutoTab />}
      </div>
    </div>
  )
}

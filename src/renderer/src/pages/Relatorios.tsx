import { useState } from 'react'
import type { Rede, Loja, QuinzenaSummary, FinanceiroSummary } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useIpc } from '../hooks/useIpc'

function formatMoney(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [quinzena, setQuinzena] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2)
  const [summary, setSummary] = useState<QuinzenaSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const handleBuscar = async () => {
    if (!redeId) { alert('Selecione uma rede'); return }
    setLoading(true)
    const data = await window.electron.invoke<QuinzenaSummary>(
      IPC.RELATORIO_QUINZENA, Number(redeId), lojaId !== '' ? Number(lojaId) : 0, mes, ano, quinzena
    )
    setSummary(data)
    setLoading(false)
  }

  const filteredLojas = lojas?.filter(l => !redeId || l.rede_id === Number(redeId)) ?? []

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

          {/* Two-panel layout */}
          <div className="flex gap-4 overflow-auto">
            {/* Left: Detail */}
            <div className="flex-1 overflow-auto">
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">Detalhe por Pedido</h3>
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-2 py-1">Data</th>
                    <th className="border px-2 py-1">OC</th>
                    <th className="border px-2 py-1">Loja</th>
                    <th className="border px-2 py-1">Produto</th>
                    <th className="border px-2 py-1">Qtd</th>
                    <th className="border px-2 py-1">Preço</th>
                    <th className="border px-2 py-1">Total</th>
                    <th className="border px-2 py-1">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.detalhe.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="border px-2 py-0.5">{formatDate(d.data_pedido)}</td>
                      <td className="border px-2 py-0.5 font-mono">{d.numero_oc}</td>
                      <td className="border px-2 py-0.5">{d.loja_nome}</td>
                      <td className="border px-2 py-0.5">{d.produto_nome}</td>
                      <td className="border px-2 py-0.5 text-center">{d.quantidade}</td>
                      <td className="border px-2 py-0.5 text-right">{formatMoney(d.preco_unit)}</td>
                      <td className="border px-2 py-0.5 text-right">{formatMoney(d.total_venda)}</td>
                      <td className="border px-2 py-0.5 text-right">{formatMoney(d.total_custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                          {row.quantidades[p.id] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-gray-100 font-bold">
                    <td className="border px-2 py-1">TOTAL</td>
                    {summary.produtos.map(p => {
                      const total = summary.matriz.reduce((s, r) => s + (r.quantidades[p.id] ?? 0), 0)
                      return <td key={p.id} className="border px-2 py-1 text-center">{total > 0 ? total : ''}</td>
                    })}
                  </tr>
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
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [redeId, setRedeId] = useState<number | ''>('')
  const [summary, setSummary] = useState<FinanceiroSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const handleBuscar = async () => {
    setLoading(true)
    const data = await window.electron.invoke<FinanceiroSummary>(
      IPC.RELATORIO_FINANCEIRO, mes, ano, redeId !== '' ? Number(redeId) : undefined
    )
    setSummary(data)
    setLoading(false)
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-end bg-white border rounded p-3">
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

type RelatTab = 'quinzena' | 'financeiro'

export function Relatorios() {
  const [activeTab, setActiveTab] = useState<RelatTab>('quinzena')

  return (
    <div className="flex flex-col gap-4 h-full">
      <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
      <div className="border-b border-gray-200">
        <nav className="flex gap-0">
          {([['quinzena', 'Quinzena'], ['financeiro', 'Financeiro']] as [RelatTab, string][]).map(([id, label]) => (
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
        {activeTab === 'quinzena' ? <QuinzenaTab /> : <FinanceiroTab />}
      </div>
    </div>
  )
}

// src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx
import { useState } from 'react'
import type { Produto, Loja, PrecoVsCustoResult } from '../../../../shared/types'
import { IPC } from '../../../../shared/ipc-channels'
import { useIpc } from '../../hooks/useIpc'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

function formatMoney(v: number | null | undefined) {
  if (v == null) return '—'
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function margemColor(pct: number | null) {
  if (pct == null) return 'text-gray-400'
  if (pct >= 30) return 'text-emerald-600 font-semibold'
  if (pct >= 15) return 'text-amber-600 font-semibold'
  return 'text-red-600 font-semibold'
}

export function PrecoVsCustoTab() {
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)

  const [produtoId, setProdutoId] = useState<number | ''>('')
  const [lojaId, setLojaId] = useState<number | ''>('')
  const [resultado, setResultado] = useState<PrecoVsCustoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [drillMes, setDrillMes] = useState<string | null>(null)

  const produtosOrdenados = [...(produtos ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
  const lojasOrdenadas = [...(lojas ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )

  async function handleBuscar() {
    if (produtoId === '') { setErro('Selecione um produto'); return }
    setErro(null)
    setLoading(true)
    try {
      const data = await window.electron.invoke<PrecoVsCustoResult>(
        IPC.RELATORIO_PRECO_CUSTO,
        Number(produtoId),
        lojaId !== '' ? Number(lojaId) : undefined
      )
      setResultado(data)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  function labelMes(mes: string) {
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const [, m] = mes.split('-')
    return meses[parseInt(m) - 1]
  }

  function labelDia(dia: string) {
    const [,, d] = dia.split('-')
    return `Dia ${parseInt(d)}`
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Produto *</label>
          <select
            className="border rounded px-2 py-1.5 text-sm min-w-48"
            value={produtoId}
            onChange={e => { setProdutoId(e.target.value === '' ? '' : Number(e.target.value)); setResultado(null); setDrillMes(null) }}
          >
            <option value="">Selecione...</option>
            {produtosOrdenados.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Loja</label>
          <select
            className="border rounded px-2 py-1.5 text-sm min-w-48"
            value={lojaId}
            onChange={e => { setLojaId(e.target.value === '' ? '' : Number(e.target.value)); setResultado(null); setDrillMes(null) }}
          >
            <option value="">Todas as lojas</option>
            {lojasOrdenadas.map(l => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleBuscar}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Carregando...' : 'Buscar'}
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {resultado && (
        <>
          <h2 className="text-base font-semibold text-gray-800">{resultado.produto_nome}</h2>

          {/* Seção 1: Histórico de Custos */}
          <section>
            <h3 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Histórico de Custos de Compra
            </h3>
            <table className="text-sm border-collapse w-full max-w-2xl">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-3 py-2 text-left text-xs text-gray-500">VIGÊNCIA INÍCIO</th>
                  <th className="border px-3 py-2 text-left text-xs text-gray-500">VIGÊNCIA FIM</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">CUSTO DE COMPRA</th>
                  <th className="border px-3 py-2 text-center text-xs text-gray-500">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {resultado.historico_custos.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="border px-3 py-2">{formatDate(c.vigencia_inicio)}</td>
                    <td className="border px-3 py-2 text-gray-500">{formatDate(c.vigencia_fim)}</td>
                    <td className="border px-3 py-2 text-right font-mono font-semibold">
                      {formatMoney(c.custo_compra)}
                    </td>
                    <td className="border px-3 py-2 text-center">
                      {c.vigencia_fim === null ? (
                        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">
                          Vigente
                        </span>
                      ) : (
                        <span className="inline-block bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                          Encerrado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {resultado.historico_custos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="border px-3 py-4 text-center text-gray-400 text-xs">
                      Nenhum custo cadastrado para este produto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Seção 2: Comparação por Loja */}
          <section>
            <h3 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Comparação por Loja
            </h3>
            <table className="text-sm border-collapse w-full max-w-3xl">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-3 py-2 text-left text-xs text-gray-500">FRANQUIA / LOJA</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">PREÇO DE VENDA</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">CUSTO ATUAL</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">MARGEM R$</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">MARGEM %</th>
                </tr>
              </thead>
              <tbody>
                {resultado.comparacao_lojas.map(l => (
                  <tr key={l.loja_id} className="hover:bg-gray-50">
                    <td className="border px-3 py-2 font-medium text-gray-800">{l.loja_nome}</td>
                    <td className="border px-3 py-2 text-right font-mono">{formatMoney(l.preco_venda)}</td>
                    <td className="border px-3 py-2 text-right font-mono">{formatMoney(l.custo_atual)}</td>
                    <td className="border px-3 py-2 text-right font-mono">{formatMoney(l.margem_reais)}</td>
                    <td className={`border px-3 py-2 text-right ${margemColor(l.margem_pct)}`}>
                      {formatPct(l.margem_pct)}
                    </td>
                  </tr>
                ))}
                {resultado.comparacao_lojas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border px-3 py-4 text-center text-gray-400 text-xs">
                      Nenhuma loja com preço de venda cadastrado para este produto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Seção 3: Gráfico Mensal */}
          <section>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                {drillMes ? `Detalhe — ${drillMes}` : 'Evolução Mensal'}
              </h3>
              {drillMes && (
                <button
                  onClick={() => setDrillMes(null)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ← Voltar para visão mensal
                </button>
              )}
            </div>

            {(() => {
              type GraficoItem = { label: string; custo: number | null; preco: number | null; margem: number | null; _mes?: string }
              const dadosGrafico: GraficoItem[] = drillMes
                ? (resultado.grafico_mensal.find(m => m.mes === drillMes)?.dias ?? []).map(d => ({
                    label: labelDia(d.dia),
                    custo: d.custo,
                    preco: d.preco,
                    margem: d.margem_pct,
                  }))
                : resultado.grafico_mensal.map(m => ({
                    label: labelMes(m.mes),
                    custo: m.custo,
                    preco: m.preco_medio,
                    margem: m.margem_pct,
                    _mes: m.mes,
                  }))

              if (dadosGrafico.length === 0) {
                return (
                  <p className="text-xs text-gray-400">
                    {drillMes
                      ? 'Nenhum pedido com este produto neste mês.'
                      : 'Sem dados nos últimos 12 meses.'}
                  </p>
                )
              }

              return (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart
                    data={dadosGrafico}
                    margin={{ top: 8, right: 40, left: 0, bottom: 0 }}
                    onClick={(e: unknown) => {
                      const ev = e as { activePayload?: Array<{ payload: GraficoItem }> }
                      if (!drillMes && ev?.activePayload?.[0]) {
                        const item = ev.activePayload[0].payload
                        if (item._mes) setDrillMes(item._mes)
                      }
                    }}
                    style={{ cursor: drillMes ? 'default' : 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `R$${v.toFixed(0)}`}
                      width={60}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `${v}%`}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => {
                        const v = typeof value === 'number' ? value : null
                        const n = String(name ?? '')
                        if (n === 'Margem %') return [`${v?.toFixed(1) ?? '—'}%`, n]
                        return [`R$ ${v?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '—'}`, n]
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="custo" name="Custo" fill="#fca5a5" radius={[3,3,0,0]} />
                    <Bar yAxisId="left" dataKey="preco" name="Preço de Venda" fill="#93c5fd" radius={[3,3,0,0]} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="margem"
                      name="Margem %"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )
            })()}

            {!drillMes && (
              <p className="text-xs text-gray-400 mt-1">
                Clique em um mês para ver o detalhe por dia.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

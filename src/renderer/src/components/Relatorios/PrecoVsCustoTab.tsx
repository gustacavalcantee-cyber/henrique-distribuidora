// src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx
import { useState } from 'react'
import type { Produto, Loja, Franqueado, PrecoVsCustoResult } from '../../../../shared/types'
import { IPC } from '../../../../shared/ipc-channels'
import { useIpc } from '../../hooks/useIpc'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'
import { Share2 } from 'lucide-react'
import { RelatorioShareModal } from './RelatorioShareModal'

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

function labelMes(mes: string) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [, m] = mes.split('-')
  return meses[parseInt(m) - 1]
}

function labelDia(dia: string) {
  const [,, d] = dia.split('-')
  return `Dia ${parseInt(d)}`
}

// --- Sub-componente para exibir resultado de um produto ---
function ProdutoResultado({ resultado }: { resultado: PrecoVsCustoResult }) {
  const [drillMes, setDrillMes] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4 border border-slate-200 rounded-lg p-4 bg-white">
      <h2 className="text-base font-semibold text-gray-800 border-b pb-2">{resultado.produto_nome}</h2>

      {/* Seção 1: Histórico de Custos */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
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
        <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
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
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {drillMes ? `Detalhe — ${drillMes}` : 'Evolução Mensal'}
          </h3>
          {drillMes && (
            <button onClick={() => setDrillMes(null)} className="text-xs text-blue-600 hover:underline">
              ← Voltar para visão mensal
            </button>
          )}
        </div>

        {(() => {
          type GraficoItem = { label: string; custo: number | null; preco: number | null; margem: number | null; _mes?: string }
          const dadosGrafico: GraficoItem[] = drillMes
            ? (resultado.grafico_mensal.find(m => m.mes === drillMes)?.dias ?? []).map(d => ({
                label: labelDia(d.dia), custo: d.custo, preco: d.preco, margem: d.margem_pct,
              }))
            : resultado.grafico_mensal.map(m => ({
                label: labelMes(m.mes), custo: m.custo, preco: m.preco_medio, margem: m.margem_pct, _mes: m.mes,
              }))

          if (dadosGrafico.length === 0) {
            return <p className="text-xs text-gray-400">{drillMes ? 'Nenhum pedido neste mês.' : 'Sem dados nos últimos 12 meses.'}</p>
          }

          return (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}
                onClick={(e: unknown) => {
                  const ev = e as { activePayload?: Array<{ payload: GraficoItem }> }
                  if (!drillMes && ev?.activePayload?.[0]?.payload._mes) setDrillMes(ev.activePayload[0].payload._mes)
                }}
                style={{ cursor: drillMes ? 'default' : 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} width={60} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} width={44} />
                <Tooltip formatter={(value: unknown, name: unknown) => {
                  const v = typeof value === 'number' ? value : null
                  const n = String(name ?? '')
                  if (n === 'Margem %') return [`${v?.toFixed(1) ?? '—'}%`, n]
                  return [`R$ ${v?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '—'}`, n]
                }} />
                <Legend />
                <Bar yAxisId="left" dataKey="custo" name="Custo" fill="#fca5a5" radius={[3,3,0,0]} />
                <Bar yAxisId="left" dataKey="preco" name="Preço de Venda" fill="#93c5fd" radius={[3,3,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="margem" name="Margem %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )
        })()}
        {!drillMes && <p className="text-xs text-gray-400 mt-1">Clique em um mês para ver o detalhe por dia.</p>}
      </section>
    </div>
  )
}

// --- Componente principal ---
export function PrecoVsCustoTab() {
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const { data: franqueados } = useIpc<Franqueado[]>(IPC.FRANQUEADOS_LIST)

  const [selectedProdIds, setSelectedProdIds] = useState<Set<number>>(new Set())
  const [franqueadoId, setFranqueadoId] = useState<number | ''>('')
  const [lojaId, setLojaId] = useState<number | ''>('')
  const [resultados, setResultados] = useState<PrecoVsCustoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)

  // Produtos deduplicados por nome (um por nome, o de menor id)
  const produtosUnicos = [...(produtos ?? [])]
    .sort((a, b) => a.id - b.id)
    .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome) === i)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  function labelLoja(l: Loja) {
    const f = franqueados?.find(fr => fr.id === l.franqueado_id)
    return f ? `${f.nome} — ${l.nome}` : l.nome
  }

  // Lojas filtradas pelo franqueado selecionado
  const lojasFiltradas = [...(lojas ?? [])]
    .filter(l => franqueadoId === '' || l.franqueado_id === Number(franqueadoId))
    .sort((a, b) => labelLoja(a).localeCompare(labelLoja(b), 'pt-BR'))

  const franqueadosOrdenados = [...(franqueados ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )

  function toggleProduto(id: number) {
    setSelectedProdIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setResultados([])
  }

  function toggleTodos() {
    if (selectedProdIds.size === produtosUnicos.length) {
      setSelectedProdIds(new Set())
    } else {
      setSelectedProdIds(new Set(produtosUnicos.map(p => p.id)))
    }
    setResultados([])
  }

  async function handleBuscar() {
    if (selectedProdIds.size === 0) { setErro('Selecione ao menos um produto'); return }
    setErro(null)
    setLoading(true)
    try {
      const lojaArg = lojaId !== '' ? Number(lojaId) : undefined
      const results = await Promise.all(
        [...selectedProdIds].map(pid =>
          window.electron.invoke<PrecoVsCustoResult>(IPC.RELATORIO_PRECO_CUSTO, pid, lojaArg)
        )
      )

      let finalResults = results

      if (franqueadoId !== '' && lojaId === '') {
        const lojaIdsDoFranqueado = new Set(
          (lojas ?? [])
            .filter(l => l.franqueado_id === Number(franqueadoId))
            .map(l => l.id)
        )
        finalResults = results.map(r => ({
          ...r,
          comparacao_lojas: r.comparacao_lojas.filter(l => lojaIdsDoFranqueado.has(l.loja_id))
        }))
      }

      setResultados(finalResults)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  async function handleCompartilhar() {
    setShareLoading(true)
    const nomeFornecedor: string = await window.electron.invoke(IPC.CONFIG_GET, 'nome_fornecedor') ?? ''
    const fmt = (v: number | null | undefined) =>
      v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const fmtPct = (v: number | null | undefined) => v == null ? '—' : `${v.toFixed(1)}%`
    const franqueadoNome = franqueadoId !== ''
      ? franqueados?.find(f => f.id === Number(franqueadoId))?.nome ?? ''
      : 'Todos'
    const lojaNome = lojaId !== ''
      ? lojasFiltradas.find(l => l.id === Number(lojaId))?.nome ?? ''
      : 'Todas as lojas'

    const tabelasProdutos = resultados.map(r => `
      <h2 style="font-size:13px;margin:12px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px;">${r.produto_nome}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="border:1px solid #ddd;padding:4px 6px;text-align:left;">Loja</th>
            <th style="border:1px solid #ddd;padding:4px 6px;text-align:right;">Preço Venda</th>
            <th style="border:1px solid #ddd;padding:4px 6px;text-align:right;">Custo Atual</th>
            <th style="border:1px solid #ddd;padding:4px 6px;text-align:right;">Margem R$</th>
            <th style="border:1px solid #ddd;padding:4px 6px;text-align:right;">Margem %</th>
          </tr>
        </thead>
        <tbody>
          ${r.comparacao_lojas.map(l => `
            <tr>
              <td style="border:1px solid #eee;padding:4px 6px;">${l.loja_nome}</td>
              <td style="border:1px solid #eee;padding:4px 6px;text-align:right;font-family:monospace;">${fmt(l.preco_venda)}</td>
              <td style="border:1px solid #eee;padding:4px 6px;text-align:right;font-family:monospace;">${fmt(l.custo_atual)}</td>
              <td style="border:1px solid #eee;padding:4px 6px;text-align:right;font-family:monospace;">${fmt(l.margem_reais)}</td>
              <td style="border:1px solid #eee;padding:4px 6px;text-align:right;font-weight:bold;">${fmtPct(l.margem_pct)}</td>
            </tr>
          `).join('')}
          ${r.comparacao_lojas.length === 0 ? '<tr><td colspan="5" style="padding:8px;text-align:center;color:#999;border:1px solid #eee;">Nenhuma loja com preço cadastrado</td></tr>' : ''}
        </tbody>
      </table>
    `).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; padding: 20px; width: 580px; }
h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
.sub { font-size: 11px; color: #666; margin-bottom: 12px; }
</style></head><body>
<h1>PREÇO × CUSTO</h1>
<div class="sub">${nomeFornecedor.toUpperCase()} — Franqueado: ${franqueadoNome} | ${lojaNome}</div>
${tabelasProdutos}
</body></html>`

    const image = await window.electron.invoke<string>(IPC.RENDER_HTML_IMAGE, html, 600)
    setShareImage(image)
    setShareLoading(false)
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-start">

        {/* Multi-select de Produtos */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-xs text-gray-500 font-medium">Produtos *</label>
            <button onClick={toggleTodos} className="text-xs text-blue-500 hover:underline ml-4">
              {selectedProdIds.size === produtosUnicos.length ? 'Desmarcar todos' : 'Todos'}
            </button>
          </div>
          <div className="border rounded overflow-y-auto bg-white" style={{ height: 160, minWidth: 200 }}>
            {produtosUnicos.map(p => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedProdIds.has(p.id)}
                  onChange={() => toggleProduto(p.id)}
                  className="accent-blue-600"
                />
                {p.nome}
              </label>
            ))}
          </div>
          {selectedProdIds.size > 0 && (
            <p className="text-xs text-gray-400">{selectedProdIds.size} selecionado(s)</p>
          )}
        </div>

        {/* Franqueado */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Franqueado</label>
          <select
            className="border rounded px-2 py-1.5 text-sm min-w-44"
            value={franqueadoId}
            onChange={e => {
              setFranqueadoId(e.target.value === '' ? '' : Number(e.target.value))
              setLojaId('')
              setResultados([])
            }}
          >
            <option value="">Todos</option>
            {franqueadosOrdenados.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>

          {/* Loja */}
          <label className="text-xs text-gray-500 font-medium mt-2">Loja</label>
          <select
            className="border rounded px-2 py-1.5 text-sm min-w-44"
            value={lojaId}
            onChange={e => { setLojaId(e.target.value === '' ? '' : Number(e.target.value)); setResultados([]) }}
          >
            <option value="">Todas as lojas</option>
            {lojasFiltradas.map(l => (
              <option key={l.id} value={l.id}>{labelLoja(l)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2 pb-0.5">
          <button
            onClick={handleBuscar}
            disabled={loading}
            className="bg-blue-600 text-white px-5 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : 'Buscar'}
          </button>
          {resultados.length > 0 && (
            <button
              onClick={handleCompartilhar}
              disabled={shareLoading}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <Share2 size={14} />
              {shareLoading ? 'Gerando...' : 'Compartilhar'}
            </button>
          )}
        </div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {/* Resultados empilhados por produto */}
      {resultados.map((r, i) => (
        <ProdutoResultado key={i} resultado={r} />
      ))}

      <RelatorioShareModal
        image={shareImage}
        filename="preco-vs-custo.png"
        onClose={() => setShareImage(null)}
      />
    </div>
  )
}

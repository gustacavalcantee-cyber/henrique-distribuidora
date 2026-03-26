import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus } from 'lucide-react'
import type { Rede, Produto } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface EstoqueTabProps {
  dataPedido: string
  redes: Rede[]
  produtos: Produto[]
}

interface ContemEntry { quantidade: number; auto: boolean }
interface HistoryProduto { contem: number; total: number; sf: number }
interface HistoryRow { data: string; produtos: Record<number, HistoryProduto> }
interface EntradasResult {
  contem: Record<number, ContemEntry>
  history: HistoryRow[]
}

function fmtNum(v: number) {
  return (Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function fmtSf(v: number) {
  return (v > 0 ? '+' : '') + fmtNum(v)
}

function sfClass(v: number) {
  if (v > 0) return 'bg-green-100 text-green-800 font-bold'
  if (v < 0) return 'bg-red-100 text-red-800 font-bold'
  return 'bg-yellow-100 text-yellow-800 font-bold'
}

export function EstoqueTab({ dataPedido, redes, produtos }: EstoqueTabProps) {
  const STORAGE_PRODS_KEY = 'estoque_produtos'

  const [selectedProdIds, setSelectedProdIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PRODS_KEY) ?? '[]') } catch { return [] }
  })

  // Valor digitado pelo usuário nesta sessão (sobrescreve o DB temporariamente)
  const [contemDraft, setContemDraft] = useState<Record<number, string>>({})
  // Dados do DB: contem salvo + flag auto (carry-forward)
  const [dbContem, setDbContem] = useState<Record<number, ContemEntry>>({})
  // Quantidades de pedidos do dia (por rede → produto)
  const [quantidades, setQuantidades] = useState<Record<number, Record<number, number>>>({})
  // Histórico dos últimos 14 dias
  const [history, setHistory] = useState<HistoryRow[]>([])

  const [showProdPicker, setShowProdPicker] = useState(false)
  const [prodSearch, setProdSearch] = useState('')

  // Debounce timers para auto-save por produto
  const saveTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // Ref-stable list of selectedProdIds for DB_SYNCED listener
  const selectedProdIdsRef = useRef(selectedProdIds)
  useEffect(() => { selectedProdIdsRef.current = selectedProdIds }, [selectedProdIds])
  const dataPedidoRef = useRef(dataPedido)
  useEffect(() => { dataPedidoRef.current = dataPedido }, [dataPedido])

  const uniqueProdutos = [...produtos]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)

  const selectedProdutos = uniqueProdutos.filter(p => selectedProdIds.includes(p.id))

  // Carrega quantidades de pedidos do dia
  useEffect(() => {
    if (selectedProdIds.length === 0) { setQuantidades({}); return }
    window.electron.invoke<Record<number, Record<number, number>>>(
      IPC.ESTOQUE_QUANTIDADES_DIA, dataPedido, selectedProdIds
    ).then(setQuantidades).catch(() => setQuantidades({}))
  }, [dataPedido, JSON.stringify(selectedProdIds)])

  // Carrega CONTEM do DB + histórico
  useEffect(() => {
    if (selectedProdIds.length === 0) { setDbContem({}); setHistory([]); setContemDraft({}); return }
    window.electron.invoke<EntradasResult>(
      IPC.ESTOQUE_ENTRADAS_GET, dataPedido, selectedProdIds
    ).then(result => {
      setDbContem(result.contem)
      setHistory(result.history)
      // Pré-preenche o draft apenas com valores manuais (não carry-forward)
      const draft: Record<number, string> = {}
      for (const [idStr, entry] of Object.entries(result.contem)) {
        if (!entry.auto) draft[Number(idStr)] = String(entry.quantidade)
      }
      setContemDraft(draft)
    }).catch(() => { setDbContem({}); setHistory([]) })
  }, [dataPedido, JSON.stringify(selectedProdIds)])

  // Reload silencioso quando outro dispositivo sincroniza
  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => {
      const ids = selectedProdIdsRef.current
      const data = dataPedidoRef.current
      if (ids.length === 0) return
      window.electron.invoke<EntradasResult>(IPC.ESTOQUE_ENTRADAS_GET, data, ids)
        .then(result => { setDbContem(result.contem); setHistory(result.history) })
        .catch(() => {})
      window.electron.invoke<Record<number, Record<number, number>>>(
        IPC.ESTOQUE_QUANTIDADES_DIA, data, ids
      ).then(setQuantidades).catch(() => {})
    })
  }, [])

  const handleContemChange = useCallback((prodId: number, value: string) => {
    setContemDraft(prev => ({ ...prev, [prodId]: value }))
    // Auto-save após 1s de inatividade
    if (saveTimerRef.current[prodId]) clearTimeout(saveTimerRef.current[prodId])
    saveTimerRef.current[prodId] = setTimeout(async () => {
      const qty = parseFloat(value)
      if (isNaN(qty)) return
      await window.electron.invoke(IPC.ESTOQUE_ENTRADA_UPSERT, prodId, dataPedidoRef.current, qty)
      // Atualiza dbContem + histórico sem full reload
      setDbContem(prev => ({ ...prev, [prodId]: { quantidade: qty, auto: false } }))
      const result = await window.electron.invoke<EntradasResult>(
        IPC.ESTOQUE_ENTRADAS_GET, dataPedidoRef.current, selectedProdIdsRef.current
      )
      setHistory(result.history)
    }, 1000)
  }, [])

  // Valor exibido no input: draft tem prioridade, depois dbContem
  const contemValue = (prodId: number): string => {
    if (contemDraft[prodId] !== undefined) return contemDraft[prodId]
    const db = dbContem[prodId]
    if (db) return String(db.quantidade)
    return ''
  }

  // Se é carry-forward automático (usuário não digitou nada ainda)
  const isAuto = (prodId: number): boolean => {
    return contemDraft[prodId] === undefined && (dbContem[prodId]?.auto ?? false)
  }

  const handleAddProd = (prodId: number) => {
    const next = [...selectedProdIds, prodId]
    setSelectedProdIds(next)
    localStorage.setItem(STORAGE_PRODS_KEY, JSON.stringify(next))
    setShowProdPicker(false)
    setProdSearch('')
  }

  const handleRemoveProd = (prodId: number) => {
    const next = selectedProdIds.filter(id => id !== prodId)
    setSelectedProdIds(next)
    localStorage.setItem(STORAGE_PRODS_KEY, JSON.stringify(next))
  }

  const totals: Record<number, number> = {}
  for (const prodId of selectedProdIds) {
    totals[prodId] = Object.values(quantidades).reduce((sum, redeQtd) => sum + (redeQtd[prodId] ?? 0), 0)
  }

  const sfValue = (prodId: number): number => {
    const contemVal = parseFloat(contemValue(prodId) || '0') || 0
    return contemVal - (totals[prodId] ?? 0)
  }

  const availableToAdd = uniqueProdutos.filter(p =>
    !selectedProdIds.includes(p.id) &&
    p.nome.toLowerCase().includes(prodSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4" onClick={() => setShowProdPicker(false)}>
      {/* Seletor de produtos */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedProdutos.map(p => (
          <span key={p.id} className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 text-sm rounded-full">
            {p.nome} {p.unidade}
            <button onClick={() => handleRemoveProd(p.id)} className="ml-1 text-emerald-600 hover:text-red-500 font-bold leading-none">×</button>
          </span>
        ))}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowProdPicker(v => !v)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-gray-50"
          >
            <Plus size={13} /> Produto
          </button>
          {showProdPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 min-w-48">
              <input
                autoFocus
                className="w-full px-3 py-2 text-sm border-b outline-none"
                placeholder="Buscar..."
                value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto">
                {availableToAdd.map(p => (
                  <button key={p.id} onClick={() => handleAddProd(p.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {p.nome} <span className="text-gray-400 text-xs">{p.unidade}</span>
                  </button>
                ))}
                {availableToAdd.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedProdutos.length === 0 ? (
        <p className="text-sm text-gray-400">Adicione um produto para ver o controle de estoque.</p>
      ) : (
        <>
          {/* Tabela principal */}
          <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-1.5 text-left text-xs text-gray-500 w-36"></th>
                {selectedProdutos.map(p => (
                  <th key={p.id} className="border px-3 py-1.5 text-center text-xs font-semibold w-32">
                    {p.nome}<br /><span className="text-gray-400 font-normal">{p.unidade}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {redes.map(rede => (
                <tr key={rede.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-1.5 font-medium text-gray-700 text-xs whitespace-nowrap">{rede.nome}</td>
                  {selectedProdutos.map(p => {
                    const qty = quantidades[rede.id]?.[p.id] ?? 0
                    return (
                      <td key={p.id} className="border px-3 py-1.5 text-center text-sm">
                        {qty > 0 ? fmtNum(qty) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className="border px-3 py-1.5 text-xs text-gray-600 font-bold">TOTAL</td>
                {selectedProdutos.map(p => (
                  <td key={p.id} className="border px-3 py-1.5 text-center text-sm font-bold">
                    {fmtNum(totals[p.id] ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className="bg-blue-50">
                <td className="border px-3 py-1.5 text-xs text-blue-700 font-semibold">CONTEM</td>
                {selectedProdutos.map(p => (
                  <td key={p.id} className="border px-1 py-0.5">
                    <input
                      type="number"
                      className={`w-full px-1 py-0.5 text-sm text-center border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                        isAuto(p.id)
                          ? 'bg-blue-100 border-blue-300 text-blue-700 italic'
                          : 'bg-white border-blue-200'
                      }`}
                      value={contemValue(p.id)}
                      onChange={e => handleContemChange(p.id, e.target.value)}
                      placeholder="0"
                      title={isAuto(p.id) ? 'Calculado automaticamente do dia anterior' : undefined}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border px-3 py-1.5 text-xs font-semibold text-gray-600">S/F</td>
                {selectedProdutos.map(p => {
                  const sf = sfValue(p.id)
                  return (
                    <td key={p.id} className={`border px-3 py-1.5 text-center text-sm ${sfClass(sf)}`}>
                      {fmtSf(sf)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>

          {/* Tabela de histórico */}
          {history.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Histórico</p>
              <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-3 py-1.5 text-left text-xs text-gray-500 w-28">Data</th>
                    {selectedProdutos.map(p => (
                      <th key={p.id} className="border px-3 py-1.5 text-center text-xs font-semibold w-32">
                        {p.nome}<br /><span className="text-gray-400 font-normal">{p.unidade}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => {
                    const [y, m, d] = row.data.split('-')
                    const dataFmt = `${d}/${m}/${y}`
                    return (
                      <tr key={row.data} className="hover:bg-gray-50">
                        <td className="border px-3 py-1.5 text-xs text-gray-600 whitespace-nowrap font-medium">
                          {dataFmt}
                        </td>
                        {selectedProdutos.map(p => {
                          const entry = row.produtos[p.id]
                          if (!entry) return (
                            <td key={p.id} className="border px-3 py-1.5 text-center text-gray-300">—</td>
                          )
                          return (
                            <td key={p.id} className="border px-2 py-1 text-center">
                              <div className="text-gray-500">C: {fmtNum(entry.contem)}</div>
                              <div className="text-gray-400">T: {fmtNum(entry.total)}</div>
                              <div className={`font-bold text-xs rounded px-1 mt-0.5 ${sfClass(entry.sf)}`}>
                                {fmtSf(entry.sf)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import type { Rede, Produto } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface EstoqueTabProps {
  dataPedido: string
  redes: Rede[]
  produtos: Produto[]
}

export function EstoqueTab({ dataPedido, redes, produtos }: EstoqueTabProps) {
  const STORAGE_PRODS_KEY = 'estoque_produtos'

  const [selectedProdIds, setSelectedProdIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PRODS_KEY) ?? '[]') } catch { return [] }
  })

  const [contem, setContem] = useState<Record<number, string>>(() => {
    const result: Record<number, string> = {}
    try {
      const ids: number[] = JSON.parse(localStorage.getItem(STORAGE_PRODS_KEY) ?? '[]')
      for (const id of ids) {
        const v = localStorage.getItem(`estoque_contem_${id}`)
        if (v != null) result[id] = v
      }
    } catch { /* ignore */ }
    return result
  })

  const [quantidades, setQuantidades] = useState<Record<number, Record<number, number>>>({})
  const [showProdPicker, setShowProdPicker] = useState(false)
  const [prodSearch, setProdSearch] = useState('')

  const uniqueProdutos = [...produtos]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)

  const selectedProdutos = uniqueProdutos.filter(p => selectedProdIds.includes(p.id))

  useEffect(() => {
    if (selectedProdIds.length === 0) { setQuantidades({}); return }
    window.electron.invoke<Record<number, Record<number, number>>>(
      IPC.ESTOQUE_QUANTIDADES_DIA, dataPedido, selectedProdIds
    ).then(setQuantidades).catch(() => setQuantidades({}))
  }, [dataPedido, JSON.stringify(selectedProdIds)])

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

  const handleContemChange = (prodId: number, value: string) => {
    setContem(prev => ({ ...prev, [prodId]: value }))
    localStorage.setItem(`estoque_contem_${prodId}`, value)
  }

  const totals: Record<number, number> = {}
  for (const prodId of selectedProdIds) {
    totals[prodId] = Object.values(quantidades).reduce((sum, redeQtd) => sum + (redeQtd[prodId] ?? 0), 0)
  }

  const sfColor = (prodId: number): string => {
    const contemVal = parseFloat(contem[prodId] ?? '0') || 0
    const diff = contemVal - (totals[prodId] ?? 0)
    if (diff > 0) return 'bg-green-100 text-green-800 font-bold'
    if (diff < 0) return 'bg-red-100 text-red-800 font-bold'
    return 'bg-yellow-100 text-yellow-800 font-bold'
  }

  const sfValue = (prodId: number): string => {
    const contemVal = parseFloat(contem[prodId] ?? '0') || 0
    const diff = contemVal - (totals[prodId] ?? 0)
    return (diff > 0 ? '+' : '') + (Math.round(diff * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }

  const availableToAdd = uniqueProdutos.filter(p =>
    !selectedProdIds.includes(p.id) &&
    p.nome.toLowerCase().includes(prodSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4" onClick={() => setShowProdPicker(false)}>
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
                      {qty > 0
                        ? (Math.round(qty * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="bg-gray-50">
              <td className="border px-3 py-1.5 text-xs text-gray-600 font-bold">TOTAL</td>
              {selectedProdutos.map(p => (
                <td key={p.id} className="border px-3 py-1.5 text-center text-sm font-bold">
                  {(Math.round((totals[p.id] ?? 0) * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
              ))}
            </tr>
            <tr className="bg-blue-50">
              <td className="border px-3 py-1.5 text-xs text-blue-700 font-semibold">CONTEM</td>
              {selectedProdutos.map(p => (
                <td key={p.id} className="border px-1 py-0.5">
                  <input
                    type="number"
                    className="w-full px-1 py-0.5 text-sm text-center border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    value={contem[p.id] ?? ''}
                    onChange={e => handleContemChange(p.id, e.target.value)}
                    placeholder="0"
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border px-3 py-1.5 text-xs font-semibold text-gray-600">S/F</td>
              {selectedProdutos.map(p => (
                <td key={p.id} className={`border px-3 py-1.5 text-center text-sm ${sfColor(p.id)}`}>
                  {sfValue(p.id)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

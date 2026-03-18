import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import type { Rede, Produto, LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useLancamentos } from '../hooks/useLancamentos'

// Helper: today as YYYY-MM-DD
function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function Lancamentos() {
  const [dataPedido, setDataPedido] = useState(today())
  const [redes, setRedes] = useState<Rede[]>([])
  const [activeRedeId, setActiveRedeId] = useState<number | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const { rows, setRows, loading, load, saveRow } = useLancamentos(activeRedeId, dataPedido)

  // Load redes on mount
  useEffect(() => {
    window.electron.invoke<Rede[]>(IPC.REDES_LIST).then(data => {
      const ativos = data.filter(r => r.ativo)
      setRedes(ativos)
      if (ativos.length > 0) setActiveRedeId(ativos[0].id)
    })
  }, [])

  // Load produtos when rede changes
  useEffect(() => {
    if (!activeRedeId) return
    window.electron.invoke<Produto[]>(IPC.PRODUTOS_LIST, activeRedeId).then(setProdutos)
  }, [activeRedeId])

  // Load lancamentos when rede or date changes
  useEffect(() => {
    load()
  }, [load])

  const activeRede = redes.find(r => r.id === activeRedeId)

  // Handle quantity cell change
  const handleQuantidadeChange = useCallback((lojaId: number, produtoId: number, value: string) => {
    const qty = value === '' ? null : Number(value)
    setRows(prev => prev.map(row =>
      row.loja_id === lojaId
        ? { ...row, quantidades: { ...row.quantidades, [produtoId]: qty } }
        : row
    ))
  }, [setRows])

  // Handle OC number change
  const handleOcChange = useCallback((lojaId: number, value: string) => {
    setRows(prev => prev.map(row =>
      row.loja_id === lojaId ? { ...row, numero_oc: value } : row
    ))
  }, [setRows])

  // Autosave when leaving a cell
  const handleCellBlur = useCallback(async (row: LancamentoRow) => {
    if (!activeRedeId || !row.numero_oc) return
    await saveRow(row, activeRedeId, dataPedido)
    await load()
  }, [activeRedeId, dataPedido, saveRow, load])

  // Print a pedido row
  const handlePrint = useCallback(async (row: LancamentoRow) => {
    if (!row.pedido_id) return
    await window.electron.invoke(IPC.PRINT_PEDIDO, row.pedido_id)
  }, [])

  // Column totals
  const totals: Record<number, number> = {}
  for (const row of rows) {
    for (const [prodId, qty] of Object.entries(row.quantidades)) {
      if (qty != null) {
        totals[Number(prodId)] = (totals[Number(prodId)] ?? 0) + qty
      }
    }
  }

  // Suppress unused variable warning for activeRede used for future styling
  void activeRede

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Lançamentos</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Data:</label>
          <input
            type="date"
            value={dataPedido}
            onChange={e => setDataPedido(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* Rede tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0">
          {redes.map(rede => (
            <button
              key={rede.id}
              onClick={() => setActiveRedeId(rede.id)}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              style={{
                borderBottomColor: activeRedeId === rede.id ? rede.cor_tema : 'transparent',
                color: activeRedeId === rede.id ? rede.cor_tema : '#6b7280',
              }}
            >
              {rede.nome}
            </button>
          ))}
        </nav>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-gray-500">Carregando...</div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full">
            <thead>
              {/* Totals row */}
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left text-xs text-gray-500 w-28">TOTAL</th>
                <th className="border px-2 py-1 w-32"></th>
                {produtos.map(p => (
                  <th key={p.id} className="border px-2 py-1 text-center font-bold w-24">
                    {totals[p.id] != null ? totals[p.id] : ''}
                  </th>
                ))}
                <th className="border px-2 py-1 w-24"></th>
              </tr>
              {/* Header row */}
              <tr className="bg-gray-50">
                <th className="border px-2 py-1 text-left text-xs text-gray-600">NOTA</th>
                <th className="border px-2 py-1 text-left text-xs text-gray-600">LOJA</th>
                {produtos.map(p => (
                  <th key={p.id} className="border px-2 py-1 text-center text-xs text-gray-600 uppercase">
                    {p.nome}
                    <div className="text-gray-400 font-normal">{p.unidade}</div>
                  </th>
                ))}
                <th className="border px-2 py-1 text-xs text-gray-600">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.loja_id} className="hover:bg-gray-50">
                  {/* OC number */}
                  <td className="border px-1 py-0.5">
                    <input
                      className="w-full px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                      placeholder="OC"
                      value={row.numero_oc}
                      onChange={e => handleOcChange(row.loja_id, e.target.value)}
                      onBlur={() => handleCellBlur(row)}
                    />
                  </td>
                  {/* Store name */}
                  <td className="border px-2 py-1 font-medium text-gray-700 whitespace-nowrap">
                    {row.loja_nome}
                  </td>
                  {/* Quantity cells */}
                  {produtos.map(p => (
                    <td key={p.id} className="border px-1 py-0.5">
                      <input
                        className="w-full px-1 py-0.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        type="number"
                        step={p.unidade === 'KG' ? '0.1' : '1'}
                        min="0"
                        value={row.quantidades[p.id] ?? ''}
                        onChange={e => handleQuantidadeChange(row.loja_id, p.id, e.target.value)}
                        onBlur={() => handleCellBlur(row)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </td>
                  ))}
                  {/* Actions */}
                  <td className="border px-1 py-0.5">
                    <button
                      onClick={() => handlePrint(row)}
                      disabled={!row.pedido_id}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Printer size={12} />
                      Imprimir
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={produtos.length + 3} className="text-center text-gray-400 py-8">
                    Nenhuma loja cadastrada para esta rede.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

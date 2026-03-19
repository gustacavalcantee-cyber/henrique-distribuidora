import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { Printer, ChevronUp, ChevronDown, X, Plus, Pencil, Check, Share2 } from 'lucide-react'
import type { Rede, Produto, LancamentoRow, Preco } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useLancamentos } from '../hooks/useLancamentos'
import { useRowProdutos } from '../hooks/useRowProdutos'
import { useOcNumbers } from '../hooks/useOcNumbers'
import { EstoqueTab } from './EstoqueTab'

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function Lancamentos() {
  const [dataPedido, setDataPedido] = useState(today())
  const [redes, setRedes] = useState<Rede[]>([])
  const [activeRedeId, setActiveRedeId] = useState<number | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [editingLojaId, setEditingLojaId] = useState<number | null>(null)
  const [editingLojaNome, setEditingLojaNome] = useState('')
  const { rows, setRows, loading, load, saveRow } = useLancamentos(activeRedeId, dataPedido)
  const allRowsRef = useRef<LancamentoRow[]>([])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Per-row product management (lojaId -> Set<prodId>)
  const {
    rowProdIds,
    showRowProdMenu, setShowRowProdMenu,
    rowProdSearch, setRowProdSearch,
    rowProdMenuPos, setRowProdMenuPos,
    resetRowProdIds,
    handleToggleRowProd,
    handleRemoveColumn,
    handleToggleGlobalProd,
  } = useRowProdutos({ activeRedeId, rows, produtos })

  const { ocPlaceholders, autoFilledOcIds, handleOcChange, resetAutoFill } = useOcNumbers({ activeRedeId, rows, setRows })

  // Share preview modal
  const [sharePreview, setSharePreview] = useState<{ image: string; pedidoId: number } | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)

  // ESC to close share modal
  useEffect(() => {
    if (!sharePreview) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSharePreview(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sharePreview])

  // Global "Produto" button — adds/removes products for ALL stores
  const [showGlobalProdMenu, setShowGlobalProdMenu] = useState(false)
  const [globalProdSearch, setGlobalProdSearch] = useState('')
  const [precos, setPrecos] = useState<Preco[]>([])
  // Inline price draft for per-row picker: prodId -> price string (for the active loja)
  const [rowInlinePriceDraft, setRowInlinePriceDraft] = useState<Record<number, string>>({})

  // Load redes
  useEffect(() => {
    window.electron.invoke<Rede[]>(IPC.REDES_LIST).then(data => {
      const ativos = data.filter(r => r.ativo)
      setRedes(ativos)
      if (ativos.length > 0) setActiveRedeId(ativos[0].id)
    })
  }, [])

  // Load ALL products (no rede filter) so every product appears in the picker
  useEffect(() => {
    window.electron.invoke<Produto[]>(IPC.PRODUTOS_LIST).then(setProdutos)
  }, [])

  // Load precos
  useEffect(() => {
    window.electron.invoke<Preco[]>(IPC.PRECOS_LIST).then(setPrecos)
  }, [activeRedeId])

  // Load lancamentos
  useEffect(() => {
    load()
  }, [load])

  // Keep allRowsRef in sync on first load
  const isFirstLoad = useRef(true)
  useEffect(() => {
    if (isFirstLoad.current && rows.length > 0) {
      allRowsRef.current = rows
      isFirstLoad.current = false
    }
  }, [rows])

  // Reset on rede/date change
  useEffect(() => {
    isFirstLoad.current = true
    allRowsRef.current = []
    setShowAddMenu(false)
    setShowGlobalProdMenu(false)
    resetRowProdIds()
    resetAutoFill()
  }, [activeRedeId, dataPedido])

  const handleQuantidadeChange = useCallback((lojaId: number, produtoId: number, value: string) => {
    const qty = value === '' ? null : Number(value)
    setRows(prev => prev.map(row =>
      row.loja_id === lojaId
        ? { ...row, quantidades: { ...row.quantidades, [produtoId]: qty } }
        : row
    ))
  }, [setRows])

  const handleCellBlur = useCallback(async (row: LancamentoRow) => {
    if (!activeRedeId || !row.numero_oc) return
    await saveRow(row, activeRedeId, dataPedido)
    await load(true)
  }, [activeRedeId, dataPedido, saveRow, load])

  const handleMoveUp = useCallback((lojaId: number) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.loja_id === lojaId)
      if (idx <= 0) return prev
      const updated = [...prev]
      ;[updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]]
      if (activeRedeId) localStorage.setItem(`row_order_${activeRedeId}`, JSON.stringify(updated.map(r => r.loja_id)))
      return updated
    })
  }, [setRows, activeRedeId])

  const handleMoveDown = useCallback((lojaId: number) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.loja_id === lojaId)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const updated = [...prev]
      ;[updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]]
      if (activeRedeId) localStorage.setItem(`row_order_${activeRedeId}`, JSON.stringify(updated.map(r => r.loja_id)))
      return updated
    })
  }, [setRows, activeRedeId])

  const handleDeleteRow = useCallback((lojaId: number) => {
    setRows(prev => prev.filter(r => r.loja_id !== lojaId))
  }, [setRows])

  const handleRestoreRow = useCallback((lojaId: number) => {
    const toRestore = allRowsRef.current.find(r => r.loja_id === lojaId)
    if (!toRestore) return
    setRows(prev => prev.find(r => r.loja_id === lojaId) ? prev : [...prev, toRestore])
    setShowAddMenu(false)
  }, [setRows])

  const handleSaveLojaNome = useCallback(async (lojaId: number) => {
    const nome = editingLojaNome.trim()
    if (nome) {
      await window.electron.invoke(IPC.LOJAS_UPDATE, { id: lojaId, nome })
      setRows(prev => prev.map(r => r.loja_id === lojaId ? { ...r, loja_nome: nome } : r))
      allRowsRef.current = allRowsRef.current.map(r => r.loja_id === lojaId ? { ...r, loja_nome: nome } : r)
    }
    setEditingLojaId(null)
  }, [editingLojaNome, setRows])

  const handlePrint = useCallback(async (row: LancamentoRow) => {
    if (!activeRedeId || !row.numero_oc) return
    await saveRow(row, activeRedeId, dataPedido)
    const updated = await window.electron.invoke<import('../../../shared/types').LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, activeRedeId, dataPedido)
    const freshRow = updated.find(r => r.loja_id === row.loja_id)
    if (!freshRow?.pedido_id) return
    await window.electron.invoke(IPC.PRINT_PEDIDO, freshRow.pedido_id)
  }, [activeRedeId, dataPedido, saveRow])

  const handleShare = useCallback(async (row: LancamentoRow) => {
    if (!activeRedeId || !row.numero_oc) return
    setShareLoading(true)
    setSharePreview(null)
    try {
      await saveRow(row, activeRedeId, dataPedido)
      const updated = await window.electron.invoke<import('../../../shared/types').LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, activeRedeId, dataPedido)
      const freshRow = updated.find(r => r.loja_id === row.loja_id)
      if (!freshRow?.pedido_id) return
      const image = await window.electron.invoke<string>(IPC.GET_NOTA_IMAGE, freshRow.pedido_id)
      setSharePreview({ image, pedidoId: freshRow.pedido_id })
      setShareCopied(false)
    } finally {
      setShareLoading(false)
    }
  }, [activeRedeId, dataPedido, saveRow])

  // Columns = union of all products selected across all rows
  const allSelectedProdIds = new Set(Object.values(rowProdIds).flatMap(s => [...s]))
  const visibleProdutos = produtos.filter(p => allSelectedProdIds.has(p.id))

  // Column totals (only rows that have the product active)
  const totals: Record<number, number> = {}
  for (const row of rows) {
    for (const [prodId, qty] of Object.entries(row.quantidades)) {
      if (qty != null && rowProdIds[row.loja_id]?.has(Number(prodId))) {
        totals[Number(prodId)] = (totals[Number(prodId)] ?? 0) + qty
      }
    }
  }

  const hiddenRows = allRowsRef.current.filter(r => !rows.find(v => v.loja_id === r.loja_id))

  const closeAll = () => { setShowAddMenu(false); setShowGlobalProdMenu(false); setShowRowProdMenu(null) }

  return (
    <div className="flex flex-col gap-4" onClick={closeAll}>
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

        {/* Restore hidden store */}
        {editMode && hiddenRows.length > 0 && (
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowAddMenu(v => !v); setShowGlobalProdMenu(false) }}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              <Plus size={14} />
              Adicionar loja
            </button>
            {showAddMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 min-w-40" onClick={e => e.stopPropagation()}>
                {hiddenRows.map(r => (
                  <button key={r.loja_id} onClick={() => handleRestoreRow(r.loja_id)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    {r.loja_nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edit mode toggle */}
        <button
          onClick={e => { e.stopPropagation(); setEditMode(v => !v) }}
          className={`flex items-center gap-1 px-3 py-1 text-sm rounded font-medium ${editMode ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {editMode ? <><Check size={14} /> Concluído</> : <><Pencil size={14} /> Editar</>}
        </button>

        {/* Global "Produto" button — adds/removes a product from ALL stores */}
        {editMode ? <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setShowGlobalProdMenu(v => !v); setShowAddMenu(false); setGlobalProdSearch('') }}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus size={14} />
            Produto
          </button>
          {showGlobalProdMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 w-64" onClick={e => e.stopPropagation()}>
              <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
                Adicionar para todas as lojas
              </div>
              <div className="p-1.5 border-b border-gray-100">
                <input
                  autoFocus
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Buscar produto..."
                  value={globalProdSearch}
                  onChange={e => setGlobalProdSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {[...produtos]
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
                  .filter(p => p.nome.toLowerCase().includes(globalProdSearch.toLowerCase()))
                  .map(p => {
                    const inAll = rows.length > 0 && rows.every(row => rowProdIds[row.loja_id]?.has(p.id))
                    const inSome = rows.some(row => rowProdIds[row.loja_id]?.has(p.id))
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleToggleGlobalProd(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50"
                      >
                        <span className={`w-4 text-center text-xs font-bold flex-shrink-0 ${inAll ? 'text-blue-500' : inSome ? 'text-blue-300' : 'text-gray-300'}`}>
                          {inAll ? '✓' : inSome ? '–' : '+'}
                        </span>
                        <span className="flex-1 text-left">{p.nome}</span>
                        <span className="text-xs text-gray-400">{p.unidade}</span>
                      </button>
                    )
                  })}
                {produtos.filter(p => p.nome.toLowerCase().includes(globalProdSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado.</p>
                )}
              </div>
            </div>
          )}
        </div> : null}
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
          <button
            onClick={() => setActiveRedeId(-1)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderBottomColor: activeRedeId === -1 ? '#10b981' : 'transparent',
              color: activeRedeId === -1 ? '#10b981' : '#6b7280',
            }}
          >
            Estoque
          </button>
        </nav>
      </div>

      {/* Per-row product picker — rendered via portal to escape overflow/stacking contexts */}
      {showRowProdMenu !== null && rowProdMenuPos && createPortal(
        <div
          style={{ position: 'fixed', top: rowProdMenuPos.top, left: rowProdMenuPos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded shadow-xl w-72"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-600">
            {rows.find(r => r.loja_id === showRowProdMenu)?.loja_nome}
          </div>
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Buscar produto..."
              value={rowProdSearch}
              onChange={e => setRowProdSearch(e.target.value)}
            />
          </div>
          <div className="px-3 py-1 border-b border-gray-100 grid grid-cols-2 gap-2 text-xs text-gray-400">
            <span>Produto</span><span className="text-right">Preço (R$)</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {[...produtos]
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
              .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
              .filter(p => p.nome.toLowerCase().includes(rowProdSearch.toLowerCase()))
              .map(p => {
                const isActive = rowProdIds[showRowProdMenu!]?.has(p.id)
                return (
                  <div key={p.id} className={`flex items-center gap-1 px-2 py-1 border-b border-gray-50 ${isActive ? 'bg-white' : 'bg-gray-50'}`}>
                    <button
                      onClick={() => handleToggleRowProd(showRowProdMenu!, p.id)}
                      className={`flex items-center gap-1.5 flex-1 text-left text-sm ${isActive ? 'text-gray-800' : 'text-gray-400'}`}
                    >
                      <span className={`w-4 text-center text-xs font-bold ${isActive ? 'text-blue-500' : 'text-gray-300'}`}>{isActive ? '✓' : '+'}</span>
                      <span className="flex-1">{p.nome}</span>
                      <span className="text-xs opacity-40">{p.unidade}</span>
                    </button>
                    <input
                      className="w-16 px-1 py-0.5 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="—"
                      value={rowInlinePriceDraft[p.id] ?? ''}
                      onChange={e => setRowInlinePriceDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={async e => {
                        const val = e.target.value
                        if (val === '' || isNaN(Number(val))) return
                        await window.electron.invoke(IPC.PRECOS_UPSERT, {
                          produto_id: p.id,
                          loja_id: showRowProdMenu!,
                          preco_venda: Number(val),
                        })
                        const updated = await window.electron.invoke<Preco[]>(IPC.PRECOS_LIST)
                        setPrecos(updated)
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    />
                  </div>
                )
              })}
            {produtos.filter(p => p.nome.toLowerCase().includes(rowProdSearch.toLowerCase())).length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado.</p>
            )}
          </div>
        </div>
      , document.body)}

      {/* Estoque tab */}
      {activeRedeId === -1 ? (
        <EstoqueTab dataPedido={dataPedido} redes={redes} produtos={produtos} />
      ) : null}

      {/* Grid */}
      {activeRedeId !== -1 && (loading ? (
        <div className="text-gray-500">Carregando...</div>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
            <thead>
              {/* Totals row */}
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left text-xs text-gray-500 w-28">TOTAL</th>
                <th className="border px-2 py-1 w-32"></th>
                {visibleProdutos.map(p => (
                  <th key={p.id} className="border px-2 py-1 text-center font-bold w-24">
                    {totals[p.id] != null ? (Math.round(totals[p.id] * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : ''}
                  </th>
                ))}
                <th className="border px-2 py-1 w-36"></th>
              </tr>
              {/* Apply-to-all row — only in edit mode */}
              {editMode ? <tr className="bg-emerald-50">
                <th className="border px-2 py-1 text-left text-xs text-emerald-700 font-semibold w-28">TODAS</th>
                <th className="border px-2 py-1 w-32 text-xs text-emerald-600 font-normal text-left">Aplicar a todas</th>
                {visibleProdutos.map(p => (
                  <th key={p.id} className="border px-1 py-0.5 w-24">
                    <input
                      className="w-full px-1 py-0.5 text-sm text-center text-emerald-800 bg-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded placeholder-emerald-300"
                      type="number"
                      step={p.unidade === 'KG' ? '0.1' : '1'}
                      min="0"
                      placeholder="—"
                      onChange={e => {
                        const qty = e.target.value === '' ? null : Number(e.target.value)
                        setRows(prev => prev.map(row => {
                          if (!rowProdIds[row.loja_id]?.has(p.id)) return row
                          return { ...row, quantidades: { ...row.quantidades, [p.id]: qty } }
                        }))
                      }}
                    />
                  </th>
                ))}
                <th className="border px-2 py-1 w-36"></th>
              </tr> : null}
              {/* Header row */}
              <tr className="bg-gray-50">
                <th className="border px-2 py-1 text-left text-xs text-gray-600">NOTA</th>
                <th className="border px-2 py-1 text-left text-xs text-gray-600">LOJA</th>
                {visibleProdutos.map(p => (
                  <th key={p.id} className="border px-1 py-1 text-center text-xs text-gray-600 uppercase">
                    <div className="flex items-center justify-center gap-1">
                      <span>{p.nome}</span>
                      {editMode && (
                        <button
                          onClick={() => handleRemoveColumn(p.id)}
                          title="Remover de todas as lojas"
                          className="text-gray-300 hover:text-red-400 leading-none"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
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
                      className={`w-full px-1 py-0.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded ${autoFilledOcIds.has(row.loja_id) ? 'text-gray-400' : 'text-slate-800'}`}
                      placeholder={ocPlaceholders[row.loja_id] ?? 'OC'}
                      value={row.numero_oc}
                      onChange={e => handleOcChange(row.loja_id, e.target.value)}
                      onBlur={() => handleCellBlur(row)}
                    />
                  </td>
                  {/* Store name */}
                  <td className="border px-1 py-0.5 font-medium text-gray-700 whitespace-nowrap">
                    {editingLojaId === row.loja_id ? (
                      <input
                        autoFocus
                        className="w-full px-1 py-0.5 text-sm text-slate-800 bg-white border border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                        value={editingLojaNome}
                        onChange={e => setEditingLojaNome(e.target.value)}
                        onBlur={() => handleSaveLojaNome(row.loja_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveLojaNome(row.loja_id)
                          if (e.key === 'Escape') setEditingLojaId(null)
                        }}
                      />
                    ) : (
                      <span
                        className="block px-1 py-0.5 cursor-pointer hover:bg-gray-100 rounded"
                        title="Clique duplo para editar"
                        onDoubleClick={() => { setEditingLojaId(row.loja_id); setEditingLojaNome(row.loja_nome) }}
                      >
                        {row.loja_nome}
                      </span>
                    )}
                  </td>
                  {/* Quantity cells */}
                  {visibleProdutos.map(p => {
                    const isActive = rowProdIds[row.loja_id]?.has(p.id)
                    const qty = row.quantidades[p.id]
                    return (
                      <td key={p.id} className="border px-1 py-0.5">
                        {isActive ? (
                          <input
                            className="w-full px-1 py-0.5 text-sm text-center text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                            type="number"
                            step={p.unidade === 'KG' ? '0.1' : '1'}
                            min="0"
                            value={qty ?? ''}
                            onChange={e => handleQuantidadeChange(row.loja_id, p.id, e.target.value)}
                            onBlur={() => handleCellBlur(row)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          />
                        ) : editMode ? (
                          <button
                            className="w-full h-6 flex items-center justify-center text-gray-200 hover:text-blue-400 hover:bg-blue-50 rounded"
                            title="Adicionar para esta loja"
                            onClick={e => { e.stopPropagation(); handleToggleRowProd(row.loja_id, p.id) }}
                          >
                            <Plus size={10} />
                          </button>
                        ) : null}
                      </td>
                    )
                  })}
                  {/* Actions */}
                  <td className="border px-1 py-0.5">
                    <div className="flex items-center gap-1">
                      {editMode && (
                        <>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              const pickerW = 288
                              const pickerH = 400
                              const rawLeft = rect.left - 150
                              const left = Math.min(window.innerWidth - pickerW - 4, Math.max(4, rawLeft))
                              const top = rect.bottom + 4 + pickerH > window.innerHeight
                                ? Math.max(4, rect.top - pickerH - 4)
                                : rect.bottom + 4
                              setRowProdMenuPos({ top, left })
                              const lojaId = row.loja_id
                              setShowRowProdMenu(showRowProdMenu === lojaId ? null : lojaId)
                              setRowProdSearch('')
                              setShowGlobalProdMenu(false)
                              setShowAddMenu(false)
                              const draft: Record<number, string> = {}
                              for (const p of produtos) {
                                const pr = precos.find(x => x.produto_id === p.id && x.loja_id === lojaId && x.vigencia_fim === null)
                                if (pr) draft[p.id] = String(pr.preco_venda)
                              }
                              setRowInlinePriceDraft(draft)
                            }}
                            title="Gerenciar produtos desta loja"
                            className={`flex items-center gap-0.5 px-1 py-0.5 text-xs rounded ${
                              (rowProdIds[row.loja_id]?.size ?? 0) === 0
                                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                            }`}
                          >
                            <Plus size={12} />
                            {(rowProdIds[row.loja_id]?.size ?? 0) === 0 && <span>Produtos</span>}
                          </button>
                          <button onClick={() => handleMoveUp(row.loja_id)} title="Mover para cima" className="p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded">
                            <ChevronUp size={14} />
                          </button>
                          <button onClick={() => handleMoveDown(row.loja_id)} title="Mover para baixo" className="p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded">
                            <ChevronDown size={14} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handlePrint(row)}
                        disabled={!row.pedido_id}
                        title="Imprimir"
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Printer size={12} />
                        Imprimir
                      </button>
                      <button
                        onClick={() => handleShare(row)}
                        disabled={!row.pedido_id || shareLoading}
                        title="Compartilhar nota como imagem"
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Share2 size={12} />
                        {shareLoading ? 'Gerando...' : 'Enviar'}
                      </button>
                      {editMode && (
                        <button onClick={() => handleDeleteRow(row.loja_id)} title="Remover da lista" className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleProdutos.length + 3} className="text-center text-gray-400 py-8">
                    Nenhuma loja cadastrada para esta rede.
                  </td>
                </tr>
              )}
              {rows.length > 0 && visibleProdutos.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-gray-400 py-6 text-sm">
                    Clique em <strong>+</strong> em AÇÕES para adicionar produtos a cada loja.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {/* Share preview modal */}
      {sharePreview && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSharePreview(null)}>
          <div className="bg-white rounded-lg shadow-2xl flex flex-col max-h-[90vh] mx-4" style={{ width: 580 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2 text-gray-800 font-semibold">
                <Share2 size={16} />
                Prévia da nota
              </div>
              <button onClick={() => setSharePreview(null)} className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 bg-gray-100">
              <img src={sharePreview.image} alt="Nota" className="w-full shadow-md rounded" />
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={async () => {
                  await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview.image)
                  setShareCopied(true)
                  setTimeout(() => setShareCopied(false), 2000)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
              >
                {shareCopied ? <><Check size={14} className="text-green-600" /> Copiado!</> : 'Copiar imagem'}
              </button>
              <a
                href={sharePreview.image}
                download={`nota-${sharePreview.pedidoId}.png`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
              >
                Salvar
              </a>
              <button
                onClick={async () => {
                  await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview.image)
                  await window.electron.invoke(IPC.SHARE_NOTA, sharePreview.pedidoId)
                  setSharePreview(null)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                <Share2 size={14} />
                Enviar via WhatsApp
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

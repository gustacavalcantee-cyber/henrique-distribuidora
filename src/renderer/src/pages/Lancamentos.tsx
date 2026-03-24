import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import type { Rede, Produto, LancamentoRow, Preco } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useLancamentos } from '../hooks/useLancamentos'
import { useRowProdutos } from '../hooks/useRowProdutos'
import { useOcNumbers } from '../hooks/useOcNumbers'
import { ShareModal } from '../components/Lancamentos/ShareModal'
import { ProdutoRowMenu } from '../components/Lancamentos/ProdutoRowMenu'
import { LancamentosTable } from '../components/Lancamentos/LancamentosTable'
import { LancamentosLista } from '../components/Lancamentos/LancamentosLista'
import { LancamentosCards } from '../components/Lancamentos/LancamentosCards'
import { LancamentosHeader, type LayoutMode } from '../components/Lancamentos/LancamentosHeader'
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('tabela')
  const [historicProdIds, setHistoricProdIds] = useState<Set<number>>(new Set())
  const { rows, setRows, loading, load, saveRow } = useLancamentos(activeRedeId, dataPedido)
  const allRowsRef = useRef<LancamentoRow[]>([])
  // Always-current snapshot of rows — used by handleCellBlur to avoid stale closures
  const latestRowsRef = useRef<LancamentoRow[]>(rows)
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
  } = useRowProdutos({ activeRedeId, rows, produtos, historicProdIds })

  const { ocPlaceholders, handleOcChange } = useOcNumbers({ activeRedeId, rows, setRows })

  // Share preview modal
  const [sharePreview, setSharePreview] = useState<{ image: string; pedidoId: number } | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)

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

  // Load historic product IDs for this rede — auto-populates product columns on fresh devices
  useEffect(() => {
    if (!activeRedeId || activeRedeId < 0) return
    window.electron.invoke<Produto[]>(IPC.PRODUTOS_COM_PEDIDOS_NA_REDE, activeRedeId)
      .then(prods => setHistoricProdIds(new Set(prods.map(p => p.id))))
  }, [activeRedeId])

  // Load lancamentos
  useEffect(() => {
    load()
  }, [load])

  // Keep latestRowsRef always current so handleCellBlur never reads stale state
  useEffect(() => { latestRowsRef.current = rows }, [rows])

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
    setHistoricProdIds(new Set())
    resetRowProdIds()
  }, [activeRedeId, dataPedido])

  // Carrega layout salvo para esta rede
  useEffect(() => {
    if (!activeRedeId) return
    const saved = localStorage.getItem(`lancamentos_layout_${activeRedeId}`) as LayoutMode | null
    setLayoutMode(saved ?? 'tabela')
  }, [activeRedeId])

  const handleQuantidadeChange = useCallback((lojaId: number, produtoId: number, value: string) => {
    const qty = value === '' ? null : Number(value)
    setRows(prev => prev.map(row => {
      if (row.loja_id !== lojaId) return row
      const updatedRow = { ...row, quantidades: { ...row.quantidades, [produtoId]: qty } }
      // Auto-fill OC from placeholder when user enters first quantity
      if (value !== '' && !row.numero_oc && ocPlaceholders[lojaId]) {
        updatedRow.numero_oc = ocPlaceholders[lojaId]
      }
      return updatedRow
    }))
  }, [setRows, ocPlaceholders])

  // Enrich row with all active products so they appear in print even without a quantity
  const enrichRow = useCallback((row: LancamentoRow) => {
    const activeIds = rowProdIds[row.loja_id] ?? new Set<number>()
    const quantidades = { ...row.quantidades }
    for (const id of activeIds) {
      if (!(id in quantidades)) quantidades[id] = null
    }
    return { ...row, quantidades }
  }, [rowProdIds])

  const handleCellBlur = useCallback(async (lojaId: number) => {
    if (!activeRedeId) return

    // Read the LATEST row state via ref — avoids stale closure when onChange and
    // onBlur fire in quick succession (e.g. typing a qty then pressing TAB)
    const row = latestRowsRef.current.find(r => r.loja_id === lojaId)
    if (!row) return

    // Check if all quantities are empty/null
    const enriched = enrichRow(row)
    const hasAnyQty = Object.values(enriched.quantidades).some(q => q != null && q > 0)

    if (!hasAnyQty && row.pedido_id) {
      // All quantities cleared — cancel this store's order
      await window.electron.invoke(IPC.PEDIDOS_DELETE, row.pedido_id)
      // Clear OC so placeholder reappears
      setRows(prev => prev.map(r =>
        r.loja_id === lojaId ? { ...r, numero_oc: '', pedido_id: null } : r
      ))
      return
    }

    if (!row.numero_oc) return
    await saveRow(enriched, activeRedeId, dataPedido)
    await load(true)
  }, [activeRedeId, dataPedido, saveRow, load, enrichRow, setRows])

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
    await saveRow(enrichRow(row), activeRedeId, dataPedido)
    const updated = await window.electron.invoke<import('../../../shared/types').LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, activeRedeId, dataPedido)
    const freshRow = updated.find(r => r.loja_id === row.loja_id)
    if (!freshRow?.pedido_id) return
    await window.electron.invoke(IPC.PRINT_PEDIDO, freshRow.pedido_id)
  }, [activeRedeId, dataPedido, saveRow, enrichRow])

  const handleShare = useCallback(async (row: LancamentoRow) => {
    if (!activeRedeId || !row.numero_oc) return
    setShareLoading(true)
    setSharePreview(null)
    try {
      await saveRow(enrichRow(row), activeRedeId, dataPedido)
      const updated = await window.electron.invoke<import('../../../shared/types').LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, activeRedeId, dataPedido)
      const freshRow = updated.find(r => r.loja_id === row.loja_id)
      if (!freshRow?.pedido_id) return
      const image = await window.electron.invoke<string>(IPC.GET_NOTA_IMAGE, freshRow.pedido_id)
      setSharePreview({ image, pedidoId: freshRow.pedido_id })
      setShareCopied(false)
    } finally {
      setShareLoading(false)
    }
  }, [activeRedeId, dataPedido, saveRow, enrichRow])

  // Columns = union of all products selected, in the order the user added them
  const visibleProdutos = (() => {
    // Collect IDs in insertion order (Set preserves insertion order)
    const seenIds = new Set<number>()
    const orderedIds: number[] = []
    for (const s of Object.values(rowProdIds)) {
      for (const id of s) {
        if (!seenIds.has(id)) { seenIds.add(id); orderedIds.push(id) }
      }
    }
    // Map IDs → products, deduplicate by nome+unidade
    const prodMap = new Map(produtos.map(p => [p.id, p]))
    const seenNames = new Set<string>()
    return orderedIds
      .map(id => prodMap.get(id))
      .filter((p): p is Produto => {
        if (!p) return false
        const key = `${p.nome}|${p.unidade}`
        if (seenNames.has(key)) return false
        seenNames.add(key)
        return true
      })
  })()

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
      <LancamentosHeader
        dataPedido={dataPedido}
        editMode={editMode}
        hiddenRows={hiddenRows}
        showAddMenu={showAddMenu}
        showGlobalProdMenu={showGlobalProdMenu}
        globalProdSearch={globalProdSearch}
        rows={rows}
        produtos={produtos}
        rowProdIds={rowProdIds}
        layoutMode={layoutMode}
        onDateChange={setDataPedido}
        onToggleEditMode={() => setEditMode(v => !v)}
        onToggleAddMenu={() => { setShowAddMenu(v => !v); setShowGlobalProdMenu(false) }}
        onRestoreRow={handleRestoreRow}
        onToggleGlobalProdMenu={() => { setShowGlobalProdMenu(v => !v); setShowAddMenu(false); setGlobalProdSearch('') }}
        onGlobalProdSearch={setGlobalProdSearch}
        onToggleGlobalProd={handleToggleGlobalProd}
        onLayoutChange={mode => {
          setLayoutMode(mode)
          if (activeRedeId) localStorage.setItem(`lancamentos_layout_${activeRedeId}`, mode)
        }}
      />

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

      {/* Per-row product picker */}
      {showRowProdMenu !== null && rowProdMenuPos && (
        <ProdutoRowMenu
          lojaId={showRowProdMenu}
          lojaNome={rows.find(r => r.loja_id === showRowProdMenu)?.loja_nome ?? ''}
          pos={rowProdMenuPos}
          produtos={produtos}
          rowProdIds={rowProdIds}
          rowProdSearch={rowProdSearch}
          rowInlinePriceDraft={rowInlinePriceDraft}
          onSearch={setRowProdSearch}
          onToggle={handleToggleRowProd}
          onPriceDraftChange={(prodId, v) => setRowInlinePriceDraft(prev => ({ ...prev, [prodId]: v }))}
          onPriceBlur={async (prodId, val) => {
            if (val === '' || isNaN(Number(val))) return
            await window.electron.invoke(IPC.PRECOS_UPSERT, {
              produto_id: prodId,
              loja_id: showRowProdMenu!,
              preco_venda: Number(val),
            })
            const updated = await window.electron.invoke<Preco[]>(IPC.PRECOS_LIST)
            setPrecos(updated)
          }}
        />
      )}

      {/* Estoque tab */}
      {activeRedeId === -1 ? (
        <EstoqueTab dataPedido={dataPedido} redes={redes} produtos={produtos} />
      ) : null}

      {/* Layout: Tabela / Lista / Cards */}
      {activeRedeId !== -1 && (loading ? (
        <div className="text-gray-500">Carregando...</div>
      ) : (() => {
        const openRowProdMenu = (e: React.MouseEvent, lojaId: number) => {
          e.stopPropagation()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const pickerW = 288; const pickerH = 400
          const rawLeft = rect.left - 150
          const left = Math.min(window.innerWidth - pickerW - 4, Math.max(4, rawLeft))
          const top = rect.bottom + 4 + pickerH > window.innerHeight
            ? Math.max(4, rect.top - pickerH - 4) : rect.bottom + 4
          setRowProdMenuPos({ top, left })
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
        }

        const sharedProps = {
          rows,
          visibleProdutos,
          rowProdIds,
          editMode,
          ocPlaceholders,
          editingLojaId,
          editingLojaNome,
          shareLoading,
          onQuantidadeChange: handleQuantidadeChange,
          onOcChange: handleOcChange,
          onCellBlur: (lojaId: number) => handleCellBlur(lojaId),
          onDeleteRow: handleDeleteRow,
          onToggleRowProd: handleToggleRowProd,
          onRemoveColumn: handleRemoveColumn,
          onSaveLojaNome: handleSaveLojaNome,
          onPrint: handlePrint,
          onShare: handleShare,
          onOpenRowProdMenu: openRowProdMenu,
          onEditLoja: (lojaId: number, nome: string) => { setEditingLojaId(lojaId); setEditingLojaNome(nome) },
          onEditLojaNameChange: setEditingLojaNome,
          onEditLojaKeyDown: (e: React.KeyboardEvent, lojaId: number) => {
            if (e.key === 'Enter') handleSaveLojaNome(lojaId)
            if (e.key === 'Escape') setEditingLojaId(null)
          },
        }

        if (layoutMode === 'lista') return <LancamentosLista {...sharedProps} />
        if (layoutMode === 'cards') return <LancamentosCards {...sharedProps} />

        return (
          <LancamentosTable
            {...sharedProps}
            totals={totals}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onRemoveColumn={handleRemoveColumn}
            onApplyAll={(prodId, qty) => {
              setRows(prev => prev.map(row => {
                if (!rowProdIds[row.loja_id]?.has(prodId)) return row
                return { ...row, quantidades: { ...row.quantidades, [prodId]: qty } }
              }))
            }}
          />
        )
      })())}

      <ShareModal
        sharePreview={sharePreview}
        shareCopied={shareCopied}
        onClose={() => setSharePreview(null)}
        onCopy={async () => {
          if (!sharePreview) return
          await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview.image)
          setShareCopied(true)
          setTimeout(() => setShareCopied(false), 2000)
        }}
      />
    </div>
  )
}

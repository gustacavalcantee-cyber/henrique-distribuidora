import { useState, useCallback, useEffect, useRef, useReducer } from 'react'
import type { Produto, LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface UseRowProdutosArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  produtos: Produto[]
  historicProdIds: Set<number>
}

export function useRowProdutos({ activeRedeId, rows, produtos, historicProdIds }: UseRowProdutosArgs) {
  const [rowProdIds, setRowProdIds] = useState<Record<number, Set<number>>>({})
  const [showRowProdMenu, setShowRowProdMenu] = useState<number | null>(null)
  const [rowProdSearch, setRowProdSearch] = useState('')
  const [rowProdMenuPos, setRowProdMenuPos] = useState<{ top: number; left: number } | null>(null)

  // Track which lojaIds have been initialized to avoid re-running on each dependency change
  const initializedRef = useRef<Set<number>>(new Set())
  // Prevents concurrent init runs (async race condition)
  const initRunningRef = useRef(false)
  // Incrementing this forces the init effect to re-run (e.g. after DB_READY or DB_SYNCED)
  const [initTrigger, forceInit] = useReducer((n: number) => n + 1, 0)

  // Re-read layout from SQLite after startup pull completes (DB_READY)
  useEffect(() => {
    window.electron.on(IPC.DB_READY, () => {
      initializedRef.current = new Set()
      initRunningRef.current = false
      setRowProdIds({})
      forceInit()
    })
  }, [])

  useEffect(() => {
    if (!activeRedeId || rows.length === 0 || produtos.length === 0) return

    // Only initialize lojas not yet initialized — prevents flicker when historicProdIds
    // or other deps change after first render
    const pending = rows.filter(row => !initializedRef.current.has(row.loja_id))
    if (pending.length === 0) return

    async function init() {
      if (initRunningRef.current) return
      initRunningRef.current = true
      const additions: Record<number, Set<number>> = {}
      for (const row of pending) {
        // Try layout_config table (per-franchise, isolated)
        const saved: string | null = await window.electron.invoke(IPC.LAYOUT_GET, activeRedeId!, row.loja_id)
        if (saved) {
          const ids: number[] = JSON.parse(saved)
          additions[row.loja_id] = new Set(ids.filter(id => produtos.some(p => p.id === id)))
        } else {
          // No saved config: start with no columns so the user configures
          // each franchise independently via edit mode.
          additions[row.loja_id] = new Set()
        }
        initializedRef.current.add(row.loja_id)
      }
      if (Object.keys(additions).length > 0) {
        setRowProdIds(prev => ({ ...prev, ...additions }))
      }
      initRunningRef.current = false
    }

    init()
  }, [activeRedeId, rows, produtos, historicProdIds, initTrigger])

  // Chame isso ao trocar de rede ou data
  const resetRowProdIds = useCallback(() => {
    initializedRef.current = new Set()
    initRunningRef.current = false
    setRowProdIds({})
    setShowRowProdMenu(null)
  }, [])

  // Liga/desliga um produto para uma loja especifica
  const handleToggleRowProd = useCallback((lojaId: number, prodId: number) => {
    if (!activeRedeId) return
    setRowProdIds(prev => {
      const current = new Set(prev[lojaId] ?? [])
      current.has(prodId) ? current.delete(prodId) : current.add(prodId)
      const next = { ...prev, [lojaId]: current }
      window.electron.invoke(IPC.LAYOUT_SET, activeRedeId, lojaId, [...current])
      return next
    })
  }, [activeRedeId])

  // Remove uma coluna de produto de TODAS as lojas
  const handleRemoveColumn = useCallback((prodId: number) => {
    if (!activeRedeId) return
    setRowProdIds(prev => {
      const next = { ...prev }
      for (const lojaId of Object.keys(next).map(Number)) {
        const s = new Set(next[lojaId])
        s.delete(prodId)
        next[lojaId] = s
        window.electron.invoke(IPC.LAYOUT_SET, activeRedeId, lojaId, [...s])
      }
      return next
    })
  }, [activeRedeId])

  // Liga/desliga um produto para TODAS as lojas simultaneamente
  const handleToggleGlobalProd = useCallback((prodId: number) => {
    if (!activeRedeId) return
    setRowProdIds(prev => {
      const inAll = rows.length > 0 && rows.every(row => prev[row.loja_id]?.has(prodId))
      const addToAll = !inAll
      const next = { ...prev }
      for (const row of rows) {
        const s = new Set(next[row.loja_id] ?? [])
        addToAll ? s.add(prodId) : s.delete(prodId)
        next[row.loja_id] = s
        window.electron.invoke(IPC.LAYOUT_SET, activeRedeId, row.loja_id, [...s])
      }
      return next
    })
  }, [activeRedeId, rows])

  return {
    rowProdIds,
    showRowProdMenu, setShowRowProdMenu,
    rowProdSearch, setRowProdSearch,
    rowProdMenuPos, setRowProdMenuPos,
    resetRowProdIds,
    handleToggleRowProd,
    handleRemoveColumn,
    handleToggleGlobalProd,
  }
}

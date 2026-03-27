import { useState, useCallback, useEffect, useRef, useReducer } from 'react'
import type { Produto, LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface UseRowProdutosArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  produtos: Produto[]
  historicProdIds: Set<number>
}

/** Computes the global column order (union of all lojas in numeric loja_id order). */
function buildGlobalOrder(state: Record<number, Set<number>>): number[] {
  const seenIds = new Set<number>()
  const globalOrder: number[] = []
  for (const s of Object.values(state)) {
    for (const id of s) {
      if (!seenIds.has(id)) { seenIds.add(id); globalOrder.push(id) }
    }
  }
  return globalOrder
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
          // Use saved config
          const ids: number[] = JSON.parse(saved)
          additions[row.loja_id] = new Set(ids.filter(id => produtos.some(p => p.id === id)))
          initializedRef.current.add(row.loja_id)
        } else if (historicProdIds.size > 0) {
          // No saved config but we have history for this rede — auto-populate and persist.
          // historicProdIds is fetched per activeRedeId so it is franchise-isolated.
          const filtered = new Set([...historicProdIds].filter(id => produtos.some(p => p.id === id)))
          additions[row.loja_id] = filtered
          // Save immediately so the config persists on next switch / restart
          window.electron.invoke(IPC.LAYOUT_SET, activeRedeId!, row.loja_id, [...filtered])
          initializedRef.current.add(row.loja_id)
        } else {
          // historicProdIds not loaded yet — show empty for now but do NOT mark as
          // initialized so we retry automatically once historicProdIds arrives.
          additions[row.loja_id] = new Set()
        }
      }
      if (Object.keys(additions).length > 0) {
        setRowProdIds(prev => {
          const next = { ...prev, ...additions }
          // Always persist the global column order after init so print matches the grid
          const globalOrder = buildGlobalOrder(next)
          if (globalOrder.length > 0) {
            window.electron.invoke(IPC.LAYOUT_SAVE_COL_ORDER, activeRedeId!, globalOrder)
          }
          return next
        })
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
      const globalOrder = buildGlobalOrder(next)
      window.electron.invoke(IPC.LAYOUT_SAVE_COL_ORDER, activeRedeId, globalOrder)
      return next
    })
  }, [activeRedeId])

  // Reordena colunas de produto em TODAS as lojas (drag & drop de colunas)
  const handleReorderColumn = useCallback((fromProdId: number, toProdId: number) => {
    if (!activeRedeId || fromProdId === toProdId) return
    setRowProdIds(prev => {
      const next = { ...prev }
      for (const lojaIdStr of Object.keys(next)) {
        const lojaId = Number(lojaIdStr)
        const arr = [...next[lojaId]]
        const fromIdx = arr.indexOf(fromProdId)
        const toIdx = arr.indexOf(toProdId)
        if (fromIdx === -1 || toIdx === -1) continue
        arr.splice(fromIdx, 1)
        arr.splice(toIdx, 0, fromProdId)
        next[lojaId] = new Set(arr)
        window.electron.invoke(IPC.LAYOUT_SET, activeRedeId, lojaId, arr)
      }
      const globalOrder = buildGlobalOrder(next)
      window.electron.invoke(IPC.LAYOUT_SAVE_COL_ORDER, activeRedeId, globalOrder)
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
      const globalOrder = buildGlobalOrder(next)
      window.electron.invoke(IPC.LAYOUT_SAVE_COL_ORDER, activeRedeId, globalOrder)
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
    handleReorderColumn,
    handleToggleGlobalProd,
  }
}

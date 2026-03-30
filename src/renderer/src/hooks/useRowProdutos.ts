import { useState, useCallback, useEffect, useRef, useReducer } from 'react'
import type { Produto, LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface UseRowProdutosArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  produtos: Produto[]
  historicProdIds: Set<number>
}

/**
 * Inserts prodId into the Set at the correct position based on ordem_exibicao.
 * Products are sorted ascending by ordem_exibicao so the registered order is preserved.
 */
function insertInOrder(existing: Set<number>, prodId: number, produtos: Produto[]): Set<number> {
  const arr = [...existing]
  const prodOrdem = produtos.find(p => p.id === prodId)?.ordem_exibicao ?? 999
  const insertIdx = arr.findIndex(id => (produtos.find(p => p.id === id)?.ordem_exibicao ?? 999) > prodOrdem)
  if (insertIdx === -1) arr.push(prodId)
  else arr.splice(insertIdx, 0, prodId)
  return new Set(arr)
}

/**
 * Computes the global column order for DB persistence (used by print service
 * as fallback for Histórico prints). Uses the provided row order so that
 * the canonical loja (first in UI) determines column ordering.
 */
function buildGlobalOrderFromRows(
  state: Record<number, Set<number>>,
  rows: LancamentoRow[]
): number[] {
  const seenIds = new Set<number>()
  const globalOrder: number[] = []
  // Process in UI display order (rows) so first loja in UI dominates
  for (const row of rows) {
    const s = state[row.loja_id]
    if (!s) continue
    for (const id of s) {
      if (!seenIds.has(id)) { seenIds.add(id); globalOrder.push(id) }
    }
  }
  // Append any lojas not covered by rows (defensive)
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
  // Always-current snapshot of rows for use inside async init
  const rowsRef = useRef<LancamentoRow[]>(rows)
  rowsRef.current = rows

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
          // Load saved config as-is — trust the saved order. Manual reorders and
          // deletions are persisted; re-sorting here would override the user's choices.
          // New products added via toggle already use insertInOrder to respect ordem_exibicao.
          const ids: number[] = JSON.parse(saved)
          const filtered = ids.filter(id => produtos.some(p => p.id === id))
          if (filtered.length > 0) {
            additions[row.loja_id] = new Set(filtered)
            // Only re-save if stale IDs were pruned (filtered shorter than saved ids)
            if (filtered.length < ids.length) {
              window.electron.invoke(IPC.LAYOUT_SET, activeRedeId!, row.loja_id, filtered)
              window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId!, row.loja_id, filtered)
            } else {
              window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId!, row.loja_id, filtered)
            }
            initializedRef.current.add(row.loja_id)
          } else if (historicProdIds.size > 0) {
            // Saved config is empty or has stale IDs — re-populate from history and persist.
            const fromHistory = [...historicProdIds]
              .filter(id => produtos.some(p => p.id === id))
              .sort((a, b) => {
                const oa = produtos.find(p => p.id === a)?.ordem_exibicao ?? 999
                const ob = produtos.find(p => p.id === b)?.ordem_exibicao ?? 999
                return oa - ob
              })
            additions[row.loja_id] = new Set(fromHistory)
            window.electron.invoke(IPC.LAYOUT_SET, activeRedeId!, row.loja_id, fromHistory)
            window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId!, row.loja_id, fromHistory)
            initializedRef.current.add(row.loja_id)
          } else {
            // historicProdIds not loaded yet — show empty for now but do NOT mark as
            // initialized so we retry automatically once historicProdIds arrives.
            additions[row.loja_id] = new Set()
          }
        } else if (historicProdIds.size > 0) {
          // No saved config but we have history for this rede — auto-populate in ordem_exibicao order.
          const fromHistory = [...historicProdIds]
            .filter(id => produtos.some(p => p.id === id))
            .sort((a, b) => {
              const oa = produtos.find(p => p.id === a)?.ordem_exibicao ?? 999
              const ob = produtos.find(p => p.id === b)?.ordem_exibicao ?? 999
              return oa - ob
            })
          additions[row.loja_id] = new Set(fromHistory)
          window.electron.invoke(IPC.LAYOUT_SET, activeRedeId!, row.loja_id, fromHistory)
          window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId!, row.loja_id, fromHistory)
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
          // Persist global column order for print-service fallback (Histórico).
          // Uses rows UI order so the first visible loja determines column sequence.
          const globalOrder = buildGlobalOrderFromRows(next, rowsRef.current)
          if (globalOrder.length > 0) {
            window.electron.invoke(IPC.REDE_COL_ORDER_SET, activeRedeId!, globalOrder)
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
      let updated: Set<number>
      if (current.has(prodId)) {
        current.delete(prodId)
        updated = current
      } else {
        // Insert in ordem_exibicao position so re-adding respects the registered order
        updated = insertInOrder(current, prodId, produtos)
      }
      const next = { ...prev, [lojaId]: updated }
      window.electron.invoke(IPC.LAYOUT_SET, activeRedeId, lojaId, [...updated])
      window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId, lojaId, [...updated])
      const globalOrder = buildGlobalOrderFromRows(next, rowsRef.current)
      window.electron.invoke(IPC.REDE_COL_ORDER_SET, activeRedeId, globalOrder)
      return next
    })
  }, [activeRedeId, produtos])

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
        window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId, lojaId, [...s])
      }
      const globalOrder = buildGlobalOrderFromRows(next, rowsRef.current)
      window.electron.invoke(IPC.REDE_COL_ORDER_SET, activeRedeId, globalOrder)
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
        window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId, lojaId, arr)
      }
      const globalOrder = buildGlobalOrderFromRows(next, rowsRef.current)
      window.electron.invoke(IPC.REDE_COL_ORDER_SET, activeRedeId, globalOrder)
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
        if (addToAll) {
          // Insert in ordem_exibicao position so re-adding respects the registered order
          next[row.loja_id] = insertInOrder(s, prodId, produtos)
        } else {
          s.delete(prodId)
          next[row.loja_id] = s
        }
        window.electron.invoke(IPC.LAYOUT_SET, activeRedeId, row.loja_id, [...next[row.loja_id]])
        window.electron.invoke(IPC.PRINT_ORDER_SAVE, activeRedeId, row.loja_id, [...next[row.loja_id]])
      }
      const globalOrder = buildGlobalOrderFromRows(next, rowsRef.current)
      window.electron.invoke(IPC.REDE_COL_ORDER_SET, activeRedeId, globalOrder)
      return next
    })
  }, [activeRedeId, rows, produtos])

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

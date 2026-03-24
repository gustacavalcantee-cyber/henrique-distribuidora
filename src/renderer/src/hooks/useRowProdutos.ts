import { useState, useCallback, useEffect, useRef, useReducer } from 'react'
import type { Produto, LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface UseRowProdutosArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  produtos: Produto[]
  historicProdIds: Set<number>
}

function configKey(redeId: number, lojaId: number) {
  return `row_prods_${redeId}_${lojaId}`
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
  // Incrementing this forces the init effect to re-run (e.g. after DB_READY)
  const [initTrigger, forceInit] = useReducer((n: number) => n + 1, 0)

  // When startup pull completes (DB_READY), clear initialized state and re-read from SQLite
  useEffect(() => {
    window.electron.on(IPC.DB_READY, () => {
      initializedRef.current = new Set()
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
        const key = configKey(activeRedeId!, row.loja_id)
        const saved: string | null = await window.electron.invoke(IPC.CONFIG_GET, key)
        if (saved) {
          const ids: number[] = JSON.parse(saved)
          additions[row.loja_id] = new Set(ids.filter(id => produtos.some(p => p.id === id)))
        } else {
          // Migration: check if localStorage still has data from before SQLite sync
          const fromLocalStorage = localStorage.getItem(key)
          if (fromLocalStorage) {
            const ids: number[] = JSON.parse(fromLocalStorage)
            const filtered = ids.filter(id => produtos.some(p => p.id === id))
            additions[row.loja_id] = new Set(filtered)
            // Persist to SQLite and remove from localStorage
            window.electron.invoke(IPC.CONFIG_SET, key, JSON.stringify(filtered))
            localStorage.removeItem(key)
          } else {
            // Fallback for brand-new lojas with no config anywhere:
            // 1) products assigned to this rede
            const redeProds = produtos.filter(p => p.rede_id === activeRedeId).map(p => p.id)
            // 2) products from today's order
            const fromOrder = Object.entries(row.quantidades)
              .filter(([, qty]) => qty != null)
              .map(([id]) => Number(id))
            additions[row.loja_id] = new Set([...redeProds, ...fromOrder])
          }
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
      window.electron.invoke(IPC.CONFIG_SET, configKey(activeRedeId, lojaId), JSON.stringify([...current]))
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
        window.electron.invoke(IPC.CONFIG_SET, configKey(activeRedeId, lojaId), JSON.stringify([...s]))
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
        window.electron.invoke(IPC.CONFIG_SET, configKey(activeRedeId, row.loja_id), JSON.stringify([...s]))
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

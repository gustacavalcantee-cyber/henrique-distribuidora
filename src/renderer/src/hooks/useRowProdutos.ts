import { useState, useCallback, useEffect } from 'react'
import type { Produto, LancamentoRow } from '../../../shared/types'

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

  // Inicializa do localStorage ou dos produtos da rede + quantidades existentes + histórico
  useEffect(() => {
    if (!activeRedeId || rows.length === 0 || produtos.length === 0) return
    setRowProdIds(prev => {
      const next = { ...prev }
      for (const row of rows) {
        if (next[row.loja_id] !== undefined) continue
        const key = `row_prods_${activeRedeId}_${row.loja_id}`
        const saved = localStorage.getItem(key)
        if (saved) {
          const ids: number[] = JSON.parse(saved)
          next[row.loja_id] = new Set(ids.filter(id => produtos.some(p => p.id === id)))
        } else {
          // 1) products assigned to this rede
          const redeProds = produtos.filter(p => p.rede_id === activeRedeId).map(p => p.id)
          // 2) products from today's order
          const fromOrder = Object.entries(row.quantidades)
            .filter(([, qty]) => qty != null)
            .map(([id]) => Number(id))
          // 3) products from any historical order for this rede (fallback for fresh devices)
          const fromHistory = [...historicProdIds].filter(id => produtos.some(p => p.id === id))
          next[row.loja_id] = new Set([...redeProds, ...fromOrder, ...fromHistory])
        }
      }
      return next
    })
  }, [activeRedeId, rows, produtos, historicProdIds])

  // Chame isso ao trocar de rede ou data
  const resetRowProdIds = useCallback(() => {
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
      localStorage.setItem(`row_prods_${activeRedeId}_${lojaId}`, JSON.stringify([...current]))
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
        localStorage.setItem(`row_prods_${activeRedeId}_${lojaId}`, JSON.stringify([...s]))
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
        localStorage.setItem(`row_prods_${activeRedeId}_${row.loja_id}`, JSON.stringify([...s]))
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

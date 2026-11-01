import { useState, useCallback, useRef } from 'react'
import type { LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { isRowEdited, mergeSilentRefresh } from '../utils/lancamentoMerge'

export function useLancamentos(redeId: number | null, dataPedido: string) {
  const [rows, setRows] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)
  // Last known database state per loja; a row that differs from it has unsaved edits.
  const savedRowsRef = useRef(new Map<number, LancamentoRow>())

  const load = useCallback(async (preserveOrder?: boolean, silent?: boolean) => {
    if (!redeId || !dataPedido) return
    if (!silent) setLoading(true)
    try {
      const data = await window.electron.invoke<LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, redeId, dataPedido)
      const previouslySaved = savedRowsRef.current
      savedRowsRef.current = new Map(data.map(r => [r.loja_id, r]))
      if (preserveOrder) {
        setRows(prev => mergeSilentRefresh(prev, data, previouslySaved))
      } else {
        // Apply saved order from localStorage if available
        const saved = localStorage.getItem(`row_order_${redeId}`)
        if (saved) {
          const orderIds: number[] = JSON.parse(saved)
          const map = new Map(data.map(r => [r.loja_id, r]))
          const ordered = orderIds.filter(id => map.has(id)).map(id => map.get(id)!)
          const remaining = data.filter(r => !orderIds.includes(r.loja_id))
          setRows([...ordered, ...remaining])
        } else {
          setRows(data)
        }
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [redeId, dataPedido])

  const saveRow = useCallback(async (row: LancamentoRow, redeId: number, dataPedido: string): Promise<number | null> => {
    // Build itens: positive quantities + active products with no qty saved as 0 (so they appear in print)
    const itens = Object.entries(row.quantidades)
      .map(([prodId, qty]) => ({ produto_id: Number(prodId), quantidade: qty ?? 0 }))

    const pedidoId = await window.electron.invoke<number>(IPC.PEDIDOS_CREATE, {
      rede_id: redeId,
      loja_id: row.loja_id,
      data_pedido: dataPedido,
      numero_oc: row.numero_oc,
      itens,
    })
    savedRowsRef.current.set(row.loja_id, { ...row, pedido_id: pedidoId ?? null })
    return pedidoId ?? null
  }, [])

  const isRowUnsaved = useCallback((row: LancamentoRow) => (
    isRowEdited(row, savedRowsRef.current.get(row.loja_id))
  ), [])

  const markRowDeleted = useCallback((row: LancamentoRow) => {
    savedRowsRef.current.set(row.loja_id, { ...row, numero_oc: '', pedido_id: null, quantidades: {} })
  }, [])

  return { rows, setRows, loading, load, saveRow, isRowUnsaved, markRowDeleted }
}

import { useState, useCallback } from 'react'
import type { LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

export function useLancamentos(redeId: number | null, dataPedido: string) {
  const [rows, setRows] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (preserveOrder?: boolean) => {
    if (!redeId || !dataPedido) return
    setLoading(true)
    try {
      const data = await window.electron.invoke<LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, redeId, dataPedido)
      if (preserveOrder) {
        setRows(prev => {
          const map = new Map(data.map(r => [r.loja_id, r]))
          // Keep current order, update data; append any new rows at end
          const updated = prev
            .filter(r => map.has(r.loja_id))
            .map(r => ({ ...map.get(r.loja_id)!, quantidades: r.quantidades, numero_oc: r.numero_oc }))
          const existingIds = new Set(prev.map(r => r.loja_id))
          const newRows = data.filter(r => !existingIds.has(r.loja_id))
          return [...updated, ...newRows]
        })
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
      setLoading(false)
    }
  }, [redeId, dataPedido])

  const saveRow = useCallback(async (row: LancamentoRow, redeId: number, dataPedido: string) => {
    // Build itens: positive quantities + active products with no qty saved as 0 (so they appear in print)
    const itens = Object.entries(row.quantidades)
      .map(([prodId, qty]) => ({ produto_id: Number(prodId), quantidade: qty ?? 0 }))

    await window.electron.invoke(IPC.PEDIDOS_CREATE, {
      rede_id: redeId,
      loja_id: row.loja_id,
      data_pedido: dataPedido,
      numero_oc: row.numero_oc,
      itens,
    })
  }, [])

  return { rows, setRows, loading, load, saveRow }
}

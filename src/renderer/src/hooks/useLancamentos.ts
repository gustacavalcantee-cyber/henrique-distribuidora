import { useState, useCallback } from 'react'
import type { LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

export function useLancamentos(redeId: number | null, dataPedido: string) {
  const [rows, setRows] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!redeId || !dataPedido) return
    setLoading(true)
    try {
      const data = await window.electron.invoke<LancamentoRow[]>(IPC.PEDIDOS_BY_DATE_REDE, redeId, dataPedido)
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [redeId, dataPedido])

  const saveRow = useCallback(async (row: LancamentoRow, redeId: number, dataPedido: string) => {
    // Build itens from non-null quantities
    const itens = Object.entries(row.quantidades)
      .filter(([, qty]) => qty !== null && qty > 0)
      .map(([prodId, qty]) => ({ produto_id: Number(prodId), quantidade: qty as number }))

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

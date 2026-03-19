import { useState, useEffect, useCallback } from 'react'
import type { LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface UseOcNumbersArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  setRows: React.Dispatch<React.SetStateAction<LancamentoRow[]>>
}

export function useOcNumbers({ activeRedeId, rows, setRows }: UseOcNumbersArgs) {
  const [lastOcBase, setLastOcBase] = useState<{ prefix: string; num: number; pad: number } | null>(null)
  const [autoFilledOcIds, setAutoFilledOcIds] = useState<Set<number>>(new Set())

  // Busca o ultimo OC desta rede para montar o placeholder
  useEffect(() => {
    if (!activeRedeId) return
    window.electron.invoke<string | null>(IPC.PEDIDOS_LAST_OC, activeRedeId).then(lastOc => {
      if (!lastOc) { setLastOcBase(null); return }
      const match = lastOc.match(/^(.*?)(\d+)$/)
      if (!match) { setLastOcBase(null); return }
      setLastOcBase({ prefix: match[1], num: parseInt(match[2], 10), pad: match[2].length })
    })
  }, [activeRedeId])

  // Calcula os placeholders para linhas sem OC preenchido
  const ocPlaceholders = (() => {
    let baseNum = lastOcBase?.num ?? 0
    let basePrefix = lastOcBase?.prefix ?? ''
    let basePad = lastOcBase?.pad ?? 5
    for (const row of rows) {
      if (!row.numero_oc) continue
      const m = row.numero_oc.match(/^(.*?)(\d+)$/)
      if (m) {
        const n = parseInt(m[2], 10)
        if (n >= baseNum) { baseNum = n; basePrefix = m[1]; basePad = m[2].length }
      }
    }
    if (baseNum === 0) return {} as Record<number, string>
    const result: Record<number, string> = {}
    let counter = 1
    for (const row of rows) {
      if (!row.numero_oc) {
        result[row.loja_id] = basePrefix + String(baseNum + counter).padStart(basePad, '0')
        counter++
      }
    }
    return result
  })()

  // Auto-preenche OC nas linhas vazias quando ha placeholders disponiveis
  useEffect(() => {
    if (!activeRedeId || Object.keys(ocPlaceholders).length === 0) return
    const newAutoIds = new Set<number>()
    setRows(prev => prev.map(row => {
      if (row.numero_oc) return row
      const placeholder = ocPlaceholders[row.loja_id]
      if (!placeholder) return row
      newAutoIds.add(row.loja_id)
      return { ...row, numero_oc: placeholder }
    }))
    setAutoFilledOcIds(prev => new Set([...prev, ...newAutoIds]))
  }, [JSON.stringify(ocPlaceholders)])

  // Atualiza OC de uma linha e propaga sequencia para as seguintes
  const handleOcChange = useCallback((lojaId: number, value: string) => {
    setAutoFilledOcIds(prev => { const s = new Set(prev); s.delete(lojaId); return s })
    setRows(prev => {
      const idx = prev.findIndex(r => r.loja_id === lojaId)
      if (idx === -1) return prev
      const updated = [...prev]
      updated[idx] = { ...updated[idx], numero_oc: value }
      const match = value.match(/^(.*?)(\d+)$/)
      if (match) {
        const prefix = match[1]
        const numStr = match[2]
        const baseNum = parseInt(numStr, 10)
        const pad = numStr.length
        for (let i = idx + 1; i < updated.length; i++) {
          updated[i] = { ...updated[i], numero_oc: prefix + String(baseNum + (i - idx)).padStart(pad, '0') }
        }
      }
      return updated
    })
  }, [setRows])

  const resetAutoFill = useCallback(() => {
    setAutoFilledOcIds(new Set())
  }, [])

  return { ocPlaceholders, autoFilledOcIds, handleOcChange, resetAutoFill }
}

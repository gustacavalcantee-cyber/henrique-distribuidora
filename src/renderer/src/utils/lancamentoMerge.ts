import type { LancamentoRow } from '../../../shared/types'

// The server reports 0 as null and omits unused products, so all three mean "empty".
function sameQuantidades(a: LancamentoRow['quantidades'], b: LancamentoRow['quantidades']): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const id = Number(key)
    if ((a[id] || null) !== (b[id] || null)) return false
  }
  return true
}

export function isRowEdited(row: LancamentoRow, saved: LancamentoRow | undefined): boolean {
  if (!saved) return true
  return row.numero_oc !== saved.numero_oc || !sameQuantidades(row.quantidades, saved.quantidades)
}

export function mergeSilentRefresh(
  current: LancamentoRow[],
  fresh: LancamentoRow[],
  saved: Map<number, LancamentoRow>
): LancamentoRow[] {
  const freshByLoja = new Map(fresh.map(r => [r.loja_id, r]))
  const merged = current
    .filter(r => freshByLoja.has(r.loja_id))
    .map(r => {
      const server = freshByLoja.get(r.loja_id)!
      return isRowEdited(r, saved.get(r.loja_id))
        ? { ...server, quantidades: r.quantidades, numero_oc: r.numero_oc }
        : server
    })
  const currentIds = new Set(current.map(r => r.loja_id))
  return [...merged, ...fresh.filter(r => !currentIds.has(r.loja_id))]
}

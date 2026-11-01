import { describe, it, expect } from 'vitest'
import { isRowEdited, mergeSilentRefresh } from '../src/renderer/src/utils/lancamentoMerge'
import type { LancamentoRow } from '../src/shared/types'

function row(loja_id: number, overrides: Partial<LancamentoRow> = {}): LancamentoRow {
  return { loja_id, loja_nome: `Loja ${loja_id}`, pedido_id: null, numero_oc: '', quantidades: {}, ...overrides }
}

const savedMap = (...rows: LancamentoRow[]) => new Map(rows.map(r => [r.loja_id, r]))

describe('isRowEdited', () => {
  it('treats null, zero and missing quantities as the same empty value', () => {
    expect(isRowEdited(row(1, { quantidades: { 5: null, 6: 0 } }), row(1))).toBe(false)
  })

  it('detects a changed quantity, a cleared quantity and a changed OC', () => {
    const saved = row(1, { numero_oc: 'OC 1', quantidades: { 5: 2 } })
    expect(isRowEdited({ ...saved, quantidades: { 5: 3 } }, saved)).toBe(true)
    expect(isRowEdited({ ...saved, quantidades: { 5: null } }, saved)).toBe(true)
    expect(isRowEdited({ ...saved, numero_oc: 'OC 2' }, saved)).toBe(true)
  })

  it('protects a row with no saved version', () => {
    expect(isRowEdited(row(1), undefined)).toBe(true)
  })
})

describe('mergeSilentRefresh', () => {
  it('shows a pedido created on another machine in an untouched row', () => {
    const blank = row(1)
    const fromOtherMachine = row(1, { pedido_id: 99, numero_oc: 'OC 9', quantidades: { 5: 4 } })

    const [merged] = mergeSilentRefresh([blank], [fromOtherMachine], savedMap(blank))

    expect(merged).toEqual(fromOtherMachine)
    expect(isRowEdited(merged, fromOtherMachine)).toBe(false)
  })

  it('keeps unsaved typing while taking the latest pedido_id', () => {
    const saved = row(1)
    const typing = row(1, { numero_oc: 'OC 1', quantidades: { 5: 3 } })
    const server = row(1, { pedido_id: 99, numero_oc: 'OC 9', quantidades: { 5: 4 } })

    const [merged] = mergeSilentRefresh([typing], [server], savedMap(saved))

    expect(merged).toEqual({ ...server, numero_oc: 'OC 1', quantidades: { 5: 3 } })
  })

  it('keeps the on-screen order, drops removed lojas and appends new ones', () => {
    const a = row(1), b = row(2), c = row(3)

    const merged = mergeSilentRefresh([b, a], [a, b, c].filter(r => r !== b).concat(b), savedMap(a, b))

    expect(merged.map(r => r.loja_id)).toEqual([2, 1, 3])
    expect(mergeSilentRefresh([b, a], [a], savedMap(a, b)).map(r => r.loja_id)).toEqual([1])
  })
})

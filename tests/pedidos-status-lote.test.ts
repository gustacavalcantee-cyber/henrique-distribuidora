import { describe, it, expect, beforeEach } from 'vitest'
import { getRawSqlite } from '../src/main/db/client-local'
import { updateStatusLote } from '../src/main/services/pedidos.service'

const statusOf = () => getRawSqlite().prepare('SELECT id, status_pagamento, synced FROM pedidos ORDER BY id').all()

describe('updateStatusLote', () => {
  beforeEach(() => {
    const sqlite = getRawSqlite()
    sqlite.exec('DELETE FROM pedidos')
    const insert = sqlite.prepare(`INSERT INTO pedidos (id, data_pedido, numero_oc, status_pagamento, synced) VALUES (?, '2026-11-01', ?, ?, 1)`)
    insert.run(1, 'OC 1', 'aberto')
    insert.run(2, 'OC 2', 'paga')
    insert.run(3, 'OC 3', 'atrasada')
  })

  it('updates only the given pedidos and flags them for sync', () => {
    expect(updateStatusLote([1, 3], 'paga')).toBe(2)
    expect(statusOf()).toEqual([
      { id: 1, status_pagamento: 'paga', synced: 0 },
      { id: 2, status_pagamento: 'paga', synced: 1 },
      { id: 3, status_pagamento: 'paga', synced: 0 },
    ])
  })

  it('does not flag pedidos already in that status', () => {
    expect(updateStatusLote([1, 2], 'paga')).toBe(1)
    expect(statusOf()[1]).toEqual({ id: 2, status_pagamento: 'paga', synced: 1 })
  })

  it('does nothing for an empty list', () => {
    expect(updateStatusLote([], 'paga')).toBe(0)
  })
})

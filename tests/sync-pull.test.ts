import { describe, it, expect, beforeEach } from 'vitest'
import { getRawSqlite } from '../src/main/db/client-local'
import { pullFromSupabase } from '../src/main/sync/sync.service'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

function fakeSupabase(tables: Tables, failFromOffset?: number) {
  return {
    from: (table: string) => ({
      select: () => ({
        range: async (from: number, to: number) => {
          if (table === 'pedidos' && failFromOffset !== undefined && from >= failFromOffset) {
            return { data: null, error: { message: 'network down' } }
          }
          return { data: (tables[table] ?? []).slice(from, to + 1), error: null }
        },
      }),
    }),
  }
}

function pedido(id: number, overrides: Row = {}): Row {
  return {
    id, rede_id: 1, loja_id: 1, data_pedido: '2026-11-01', numero_oc: `OC ${id}`,
    observacoes: null, criado_em: null, status_pagamento: 'pendente', ...overrides,
  }
}

function item(id: number, pedido_id: number, quantidade = 2): Row {
  return { id, pedido_id, produto_id: 1, quantidade, preco_unit: 5.5, custo_unit: 3 }
}

function baseTables(): Tables {
  return {
    redes: [{ id: 1, nome: 'Subway', cor_tema: '#000', ativo: 1 }],
    lojas: [{ id: 1, rede_id: 1, nome: 'Mundi', ativo: 1 }],
    produtos: [{ id: 1, nome: 'Alface', unidade: 'UN', ordem_exibicao: 1 }],
    pedidos: [pedido(10)],
    itens_pedido: [item(100, 10)],
  }
}

const pull = (supabase: unknown) => pullFromSupabase(supabase, { force: true })

const itensSeq = () =>
  (getRawSqlite().prepare("SELECT seq FROM sqlite_sequence WHERE name = 'itens_pedido'").get() as { seq: number }).seq

describe('pullFromSupabase', () => {
  beforeEach(() => {
    const sqlite = getRawSqlite()
    for (const t of ['itens_pedido', 'pedidos', 'lojas', 'produtos', 'redes']) sqlite.exec(`DELETE FROM ${t}`)
  })

  it('reports a change when new remote data arrives', async () => {
    const result = await pull(fakeSupabase(baseTables()))
    expect(result.changed).toBe(true)
    expect(getRawSqlite().prepare('SELECT COUNT(*) AS c FROM itens_pedido').get()).toEqual({ c: 1 })
  })

  it('writes nothing and reports no change when remote data is identical', async () => {
    const tables = baseTables()
    await pull(fakeSupabase(tables))
    const seqBefore = itensSeq()
    const totalBefore = (getRawSqlite().prepare('SELECT total_changes() AS c').get() as { c: number }).c

    const result = await pull(fakeSupabase(tables))

    expect(result.changed).toBe(false)
    expect(itensSeq()).toBe(seqBefore)
    expect((getRawSqlite().prepare('SELECT total_changes() AS c').get() as { c: number }).c).toBe(totalBefore)
  })

  it('replaces items when a quantity changes remotely', async () => {
    const tables = baseTables()
    await pull(fakeSupabase(tables))

    tables.itens_pedido = [item(100, 10, 7)]
    const result = await pull(fakeSupabase(tables))

    expect(result.changed).toBe(true)
    expect(getRawSqlite().prepare('SELECT quantidade FROM itens_pedido WHERE pedido_id = 10').all()).toEqual([{ quantidade: 7 }])
  })

  it('ignores item order when comparing', async () => {
    const tables = baseTables()
    tables.itens_pedido = [item(100, 10, 1), { ...item(101, 10, 2), produto_id: 2 }]
    await pull(fakeSupabase(tables))

    tables.itens_pedido = [...tables.itens_pedido].reverse()
    expect((await pull(fakeSupabase(tables))).changed).toBe(false)
  })

  it('reports a change when only a pedido field changes', async () => {
    const tables = baseTables()
    await pull(fakeSupabase(tables))

    tables.pedidos = [pedido(10, { status_pagamento: 'pago' })]
    const result = await pull(fakeSupabase(tables))

    expect(result.changed).toBe(true)
    expect(getRawSqlite().prepare('SELECT status_pagamento FROM pedidos WHERE id = 10').get()).toEqual({ status_pagamento: 'pago' })
  })

  it('reports a change when a pedido is deleted remotely', async () => {
    const tables = baseTables()
    tables.pedidos = [pedido(10), pedido(11)]
    await pull(fakeSupabase(tables))

    tables.pedidos = [pedido(10)]
    const result = await pull(fakeSupabase(tables))

    expect(result.changed).toBe(true)
    expect(getRawSqlite().prepare('SELECT id FROM pedidos').all()).toEqual([{ id: 10 }])
  })

  it('keeps unsynced local edits', async () => {
    const tables = baseTables()
    await pull(fakeSupabase(tables))
    const sqlite = getRawSqlite()
    sqlite.prepare("UPDATE pedidos SET numero_oc = 'LOCAL', synced = 0 WHERE id = 10").run()
    sqlite.prepare('UPDATE itens_pedido SET quantidade = 99 WHERE pedido_id = 10').run()

    tables.itens_pedido = [item(100, 10, 7)]
    await pull(fakeSupabase(tables))

    expect(sqlite.prepare('SELECT numero_oc FROM pedidos WHERE id = 10').get()).toEqual({ numero_oc: 'LOCAL' })
    expect(sqlite.prepare('SELECT quantidade FROM itens_pedido WHERE pedido_id = 10').get()).toEqual({ quantidade: 99 })
  })

  it('flags local items for re-push when Supabase has none', async () => {
    const tables = baseTables()
    await pull(fakeSupabase(tables))

    tables.itens_pedido = []
    const result = await pull(fakeSupabase(tables))

    expect(result.healed).toBe(1)
    expect(getRawSqlite().prepare('SELECT synced FROM pedidos WHERE id = 10').get()).toEqual({ synced: 0 })
    expect(getRawSqlite().prepare('SELECT COUNT(*) AS c FROM itens_pedido').get()).toEqual({ c: 1 })
    getRawSqlite().prepare('UPDATE pedidos SET synced = 1 WHERE id = 10').run()
  })

  it('skips the comparison when the download is unchanged, unless forced', async () => {
    const tables = baseTables()
    await pull(fakeSupabase(tables))
    const sqlite = getRawSqlite()
    sqlite.prepare('UPDATE itens_pedido SET quantidade = 99 WHERE pedido_id = 10').run()

    expect((await pullFromSupabase(fakeSupabase(tables))).changed).toBe(false)
    expect(sqlite.prepare('SELECT quantidade FROM itens_pedido').get()).toEqual({ quantidade: 99 })

    expect((await pull(fakeSupabase(tables))).changed).toBe(true)
    expect(sqlite.prepare('SELECT quantidade FROM itens_pedido').get()).toEqual({ quantidade: 2 })
  })

  it('applies a changed download without forcing', async () => {
    const tables = baseTables()
    await pullFromSupabase(fakeSupabase(tables))

    tables.itens_pedido = [item(100, 10, 7)]
    expect((await pullFromSupabase(fakeSupabase(tables))).changed).toBe(true)
  })

  it('aborts without deleting anything when a page fails mid-download', async () => {
    const tables = baseTables()
    tables.pedidos = [...Array.from({ length: 1000 }, (_, i) => pedido(i + 1)), pedido(5000)]
    tables.itens_pedido = [item(100, 5000)]
    await pull(fakeSupabase(tables))

    await expect(pull(fakeSupabase(tables, 1000))).rejects.toThrow('network down')

    expect(getRawSqlite().prepare('SELECT id FROM pedidos WHERE id = 5000').get()).toEqual({ id: 5000 })
  })
})

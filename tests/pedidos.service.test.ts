import { describe, it, expect, beforeEach, vi } from 'vitest'

// We'll test by setting up the in-memory DB and then calling service functions
// but since getDb() returns the module singleton, we use vi.mock on the client
vi.mock('../src/main/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/main/db/client')>()
  const Database = (await import('better-sqlite3')).default
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const { join } = await import('path')

  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const testDb = actual.createTestDb(sqlite)
  migrate(testDb, { migrationsFolder: join(process.cwd(), 'drizzle') })

  return {
    ...actual,
    getDb: () => testDb,
  }
})

import { listPedidos, salvarPedido, deletePedido, checkDuplicate, getLancamentosParaData } from '../src/main/services/pedidos.service'
import { getDb } from '../src/main/db/client'
import * as schema from '../src/main/db/schema'

describe('pedidos.service', () => {
  let redeId: number
  let lojaId: number
  let produtoId: number

  beforeEach(() => {
    const db = getDb()
    // Clean tables (order matters due to FK constraints)
    db.delete(schema.itensPedido).run()
    db.delete(schema.pedidos).run()
    db.delete(schema.precos).run()
    db.delete(schema.custos).run()
    db.delete(schema.lojas).run()
    db.delete(schema.redes).run()

    // Seed test data
    ;[{ id: redeId }] = db.insert(schema.redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).returning().all()
    ;[{ id: lojaId }] = db.insert(schema.lojas).values({ rede_id: redeId, nome: 'Loja Teste' }).returning().all()
    ;[{ id: produtoId }] = db.insert(schema.produtos).values({ nome: 'Alface', unidade: 'UN' }).returning().all()
  })

  it('salvarPedido creates pedido with items', () => {
    const id = salvarPedido({
      rede_id: redeId,
      loja_id: lojaId,
      data_pedido: '2026-03-17',
      numero_oc: 'OC001',
      itens: [{ produto_id: produtoId, quantidade: 10, preco_unit: 5.0, custo_unit: 3.0 }],
    })
    expect(id).toBeTypeOf('number')
    const pedidosList = listPedidos({ rede_id: redeId })
    expect(pedidosList).toHaveLength(1)
    expect(pedidosList[0].numero_oc).toBe('OC001')
  })

  it('salvarPedido updates existing pedido (same OC)', () => {
    salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC001',
      itens: [{ produto_id: produtoId, quantidade: 10, preco_unit: 5.0, custo_unit: 3.0 }],
    })
    salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC001',
      itens: [{ produto_id: produtoId, quantidade: 20, preco_unit: 5.0, custo_unit: 3.0 }],
    })
    // Should still be 1 pedido, with updated quantity
    expect(listPedidos({ rede_id: redeId })).toHaveLength(1)
    const db = getDb()
    const items = db.select().from(schema.itensPedido).all()
    expect(items[0].quantidade).toBe(20)
  })

  it('resolves preco_unit from DB when not provided', () => {
    const db = getDb()
    // Set a vigent price
    db.insert(schema.precos).values({ produto_id: produtoId, loja_id: lojaId, preco_venda: 7.5, vigencia_inicio: '2026-01-01' }).run()
    db.insert(schema.custos).values({ produto_id: produtoId, custo_compra: 4.0, vigencia_inicio: '2026-01-01' }).run()

    salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC002',
      itens: [{ produto_id: produtoId, quantidade: 5 }], // no preco_unit or custo_unit
    })
    const items = db.select().from(schema.itensPedido).all()
    expect(items[0].preco_unit).toBe(7.5)
    expect(items[0].custo_unit).toBe(4.0)
  })

  it('checkDuplicate returns true for existing pedido', () => {
    salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC003',
      itens: [],
    })
    expect(checkDuplicate(redeId, lojaId, '2026-03-17', 'OC003')).toBe(true)
    expect(checkDuplicate(redeId, lojaId, '2026-03-17', 'OC999')).toBe(false)
  })

  it('deletePedido removes pedido', () => {
    const id = salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC004',
      itens: [{ produto_id: produtoId, quantidade: 1, preco_unit: 1.0, custo_unit: 0.5 }],
    })
    deletePedido(id)
    expect(listPedidos({ rede_id: redeId })).toHaveLength(0)
  })

  it('getLancamentosParaData returns all lojas for a rede', () => {
    const rows = getLancamentosParaData(redeId, '2026-03-17')
    expect(rows).toHaveLength(1)
    expect(rows[0].loja_nome).toBe('Loja Teste')
    expect(rows[0].pedido_id).toBeNull()
  })

  it('listPedidos filters by date range', () => {
    salvarPedido({ rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-01', numero_oc: 'OC010', itens: [] })
    salvarPedido({ rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-16', numero_oc: 'OC011', itens: [] })
    salvarPedido({ rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC012', itens: [] })
    const quinzena1 = listPedidos({ data_inicio: '2026-03-01', data_fim: '2026-03-15' })
    expect(quinzena1).toHaveLength(1)
    expect(quinzena1[0].numero_oc).toBe('OC010')
  })
})

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { createTestDb } from '../src/main/db/client'
import {
  redes,
  lojas,
  produtos,
  pedidos,
  itensPedido,
  precos,
  custos,
  configuracoes,
} from '../src/main/db/schema'
import { eq, isNull } from 'drizzle-orm'

function createInMemoryDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = createTestDb(sqlite)
  // Run migrations — uses the drizzle folder
  migrate(db, { migrationsFolder: join(__dirname, '../drizzle') })
  return db
}

describe('Schema + Seed', () => {
  it('should create tables without error', () => {
    const db = createInMemoryDb()
    // If migration succeeded, tables exist
    const redesResult = db.select().from(redes).all()
    expect(redesResult).toEqual([])
  })

  it('should insert and query redes', () => {
    const db = createInMemoryDb()
    db.insert(redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).run()
    const result = db.select().from(redes).all()
    expect(result).toHaveLength(1)
    expect(result[0].nome).toBe('Subway')
  })

  it('should insert pedido with items and cascade delete', () => {
    const db = createInMemoryDb()
    const [rede] = db.insert(redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).returning().all()
    const [loja] = db.insert(lojas).values({ rede_id: rede.id, nome: 'Loja Test' }).returning().all()
    const [produto] = db
      .insert(produtos)
      .values({ nome: 'Alface', unidade: 'UN' })
      .returning()
      .all()
    const [pedido] = db
      .insert(pedidos)
      .values({
        rede_id: rede.id,
        loja_id: loja.id,
        data_pedido: '2026-03-17',
        numero_oc: 'OC001',
      })
      .returning()
      .all()
    db.insert(itensPedido)
      .values({
        pedido_id: pedido.id,
        produto_id: produto.id,
        quantidade: 10,
        preco_unit: 5.0,
        custo_unit: 3.0,
      })
      .run()

    // Verify item exists
    const items = db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido.id)).all()
    expect(items).toHaveLength(1)

    // Delete pedido — items should cascade
    db.delete(pedidos).where(eq(pedidos.id, pedido.id)).run()
    const itemsAfter = db
      .select()
      .from(itensPedido)
      .where(eq(itensPedido.pedido_id, pedido.id))
      .all()
    expect(itemsAfter).toHaveLength(0)
  })

  it('should enforce unique constraint on pedidos', () => {
    const db = createInMemoryDb()
    const [rede] = db.insert(redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).returning().all()
    const [loja] = db.insert(lojas).values({ rede_id: rede.id, nome: 'Loja Test' }).returning().all()
    db.insert(pedidos)
      .values({
        rede_id: rede.id,
        loja_id: loja.id,
        data_pedido: '2026-03-17',
        numero_oc: 'OC001',
      })
      .run()
    expect(() => {
      db.insert(pedidos)
        .values({
          rede_id: rede.id,
          loja_id: loja.id,
          data_pedido: '2026-03-17',
          numero_oc: 'OC001',
        })
        .run()
    }).toThrow()
  })

  it('should store precos with vigencia and query by NULL vigencia_fim', () => {
    const db = createInMemoryDb()
    const [loja] = db.insert(lojas).values({ nome: 'Loja Test' }).returning().all()
    const [produto] = db
      .insert(produtos)
      .values({ nome: 'Alface', unidade: 'UN' })
      .returning()
      .all()
    db.insert(precos)
      .values({
        produto_id: produto.id,
        loja_id: loja.id,
        preco_venda: 5.5,
        vigencia_inicio: '2026-01-01',
      })
      .run()
    const vigentes = db.select().from(precos).where(isNull(precos.vigencia_fim)).all()
    expect(vigentes).toHaveLength(1)
    expect(vigentes[0].preco_venda).toBe(5.5)
  })
})

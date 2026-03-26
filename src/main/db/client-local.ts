// src/main/db/client-local.ts
// SQLite primary store — all app reads/writes go here (offline-first)
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { join } from 'path'
import { randomUUID } from 'crypto'
import * as schema from './schema-local'

type LocalDb = ReturnType<typeof drizzle<typeof schema>>

let _db: LocalDb | null = null
let _sqlite: Database.Database | null = null

function getDbPath(): string {
  // In tests, use in-memory
  if (process.env['NODE_ENV'] === 'test') return ':memory:'
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    return join(app.getPath('userData'), 'henrique-local.db')
  } catch {
    return join(process.cwd(), 'henrique-local.db')
  }
}

function initSchema(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS redes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cor_tema TEXT,
      ativo INTEGER DEFAULT 1,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS franqueados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS lojas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rede_id INTEGER REFERENCES redes(id),
      nome TEXT NOT NULL,
      codigo TEXT,
      cnpj TEXT,
      ativo INTEGER DEFAULT 1,
      franqueado_id INTEGER REFERENCES franqueados(id),
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rede_id INTEGER REFERENCES redes(id),
      nome TEXT NOT NULL,
      unidade TEXT NOT NULL,
      ordem_exibicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rede_id INTEGER REFERENCES redes(id),
      loja_id INTEGER REFERENCES lojas(id),
      data_pedido TEXT NOT NULL,
      numero_oc TEXT NOT NULL,
      observacoes TEXT,
      criado_em TEXT,
      status_pagamento TEXT DEFAULT 'aberto',
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1,
      remote_id INTEGER,
      conflict_state TEXT,
      UNIQUE(rede_id, loja_id, data_pedido, numero_oc)
    );
    CREATE TABLE IF NOT EXISTS itens_pedido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
      produto_id INTEGER REFERENCES produtos(id),
      quantidade REAL NOT NULL,
      preco_unit REAL NOT NULL,
      custo_unit REAL NOT NULL,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS precos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER REFERENCES produtos(id),
      loja_id INTEGER REFERENCES lojas(id),
      preco_venda REAL NOT NULL,
      vigencia_inicio TEXT NOT NULL,
      vigencia_fim TEXT,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS custos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER REFERENCES produtos(id),
      custo_compra REAL NOT NULL,
      vigencia_inicio TEXT NOT NULL,
      vigencia_fim TEXT,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS despesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      categoria TEXT NOT NULL,
      rede_id INTEGER REFERENCES redes(id),
      loja_id INTEGER REFERENCES lojas(id),
      descricao TEXT,
      valor REAL NOT NULL,
      updated_at TEXT,
      device_id TEXT,
      synced INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT,
      synced INTEGER DEFAULT 1,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS layout_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rede_id INTEGER NOT NULL REFERENCES redes(id),
      loja_id INTEGER NOT NULL REFERENCES lojas(id),
      produto_ids TEXT NOT NULL DEFAULT '[]',
      synced INTEGER DEFAULT 0,
      updated_at TEXT,
      UNIQUE(rede_id, loja_id)
    );
    CREATE TABLE IF NOT EXISTS estoque_entradas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      data TEXT NOT NULL,
      quantidade REAL NOT NULL,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
      updated_at TEXT,
      UNIQUE(produto_id, data)
    );
  `)

  // Idempotent migrations for existing databases
  try { sqlite.exec(`ALTER TABLE configuracoes ADD COLUMN synced INTEGER DEFAULT 1`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE configuracoes ADD COLUMN updated_at TEXT`) } catch { /* already exists */ }

  // Forced cleanup v2: delete ALL layout_config on every device so contaminated data
  // (re-pushed from other devices after v1 ran) is fully wiped. Each franchise starts
  // completely fresh — user configures columns independently via edit mode.
  const layoutReset = sqlite.prepare("SELECT value FROM sync_meta WHERE key = 'layout_config_reset_v2'").get()
  if (!layoutReset) {
    sqlite.prepare('DELETE FROM layout_config').run()
    sqlite.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('layout_config_reset_v2', '1')").run()
  }

  // Init device_id if not present
  const existing = sqlite.prepare('SELECT value FROM sync_meta WHERE key = ?').get('device_id') as { value: string } | undefined
  if (!existing) {
    sqlite.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?)').run('device_id', `desktop-${randomUUID()}`)
    sqlite.prepare('INSERT OR IGNORE INTO sync_meta (key, value) VALUES (?, ?)').run('last_synced_at', '')
    sqlite.prepare('INSERT OR IGNORE INTO sync_meta (key, value) VALUES (?, ?)').run('seeded', '0')
  }
}

export function getDb(): LocalDb {
  if (_db) return _db
  const dbPath = getDbPath()
  _sqlite = new Database(dbPath)
  initSchema(_sqlite)
  _db = drizzle(_sqlite, { schema })
  return _db
}

export function getRawSqlite(): Database.Database {
  if (!_sqlite) getDb()
  return _sqlite!
}

export function getDeviceId(): string {
  const sqlite = getRawSqlite()
  const row = sqlite.prepare('SELECT value FROM sync_meta WHERE key = ?').get('device_id') as { value: string } | undefined
  return row?.value ?? 'desktop-unknown'
}

export function isSeeded(): boolean {
  const sqlite = getRawSqlite()
  const row = sqlite.prepare('SELECT value FROM sync_meta WHERE key = ?').get('seeded') as { value: string } | undefined
  return row?.value === '1'
}

export function markSeeded(): void {
  getRawSqlite().prepare('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)').run('seeded', '1')
}

export function closeDb(): void {
  _sqlite?.close()
  _sqlite = null
  _db = null
}

// For tests — creates an isolated in-memory instance
export function createTestDb(sqlite: Database.Database): LocalDb {
  initSchema(sqlite)
  return drizzle(sqlite, { schema })
}

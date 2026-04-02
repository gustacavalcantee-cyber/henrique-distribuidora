// src/main/db/migrate.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { getDb } from './client'

export function runMigrations() {
  const db = getDb()
  // @ts-ignore — access internal sqlite3 connection
  migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') })

  // Idempotent column additions (fallback for environments where migrations don't auto-apply)
  const sqlite = (db as any).$client

  const cols: { name: string }[] = sqlite.prepare("PRAGMA table_info('lojas')").all()
  if (!cols.some((c: { name: string }) => c.name === 'cnpj')) {
    sqlite.prepare("ALTER TABLE lojas ADD COLUMN cnpj TEXT").run()
  }

  // Create franqueados table if not exists
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS franqueados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL
  )`).run()

  // Add franqueado_id to lojas if not exists
  const lojaCols: { name: string }[] = sqlite.prepare("PRAGMA table_info('lojas')").all()
  if (!lojaCols.some((c: { name: string }) => c.name === 'franqueado_id')) {
    sqlite.prepare("ALTER TABLE lojas ADD COLUMN franqueado_id INTEGER REFERENCES franqueados(id)").run()
  }

  // Add status_pagamento to pedidos if not exists
  const pedidoCols: { name: string }[] = sqlite.prepare("PRAGMA table_info('pedidos')").all()
  if (!pedidoCols.some((c: { name: string }) => c.name === 'status_pagamento')) {
    sqlite.prepare("ALTER TABLE pedidos ADD COLUMN status_pagamento TEXT DEFAULT 'aberto'").run()
  }

  // NF-e: Add fiscal columns to lojas
  const lojaColsNow: { name: string }[] = sqlite.prepare("PRAGMA table_info('lojas')").all()
  const lojaFiscalCols = ['razao_social', 'endereco', 'bairro', 'cep', 'municipio', 'uf', 'ie', 'telefone']
  for (const col of lojaFiscalCols) {
    if (!lojaColsNow.some((c) => c.name === col)) {
      sqlite.prepare(`ALTER TABLE lojas ADD COLUMN ${col} TEXT`).run()
    }
  }

  // NF-e: Add fiscal columns to produtos
  const prodColsNow: { name: string }[] = sqlite.prepare("PRAGMA table_info('produtos')").all()
  const prodFiscalCols = ['ncm', 'cst_icms', 'cfop', 'unidade_nfe']
  for (const col of prodFiscalCols) {
    if (!prodColsNow.some((c) => c.name === col)) {
      sqlite.prepare(`ALTER TABLE produtos ADD COLUMN ${col} TEXT`).run()
    }
  }

  // NF-e: Create notas_fiscais table
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS notas_fiscais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL,
    serie TEXT NOT NULL DEFAULT '001',
    loja_id INTEGER REFERENCES lojas(id),
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    quinzena INTEGER NOT NULL,
    data_emissao TEXT NOT NULL,
    valor_total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'rascunho',
    items_json TEXT NOT NULL DEFAULT '[]',
    danfe_html TEXT,
    chave_acesso TEXT,
    protocolo TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  )`).run()
}

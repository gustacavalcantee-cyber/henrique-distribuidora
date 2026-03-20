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
}

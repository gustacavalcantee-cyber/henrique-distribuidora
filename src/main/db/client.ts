// src/main/db/client.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (_db) return _db
  const dbPath = join(app.getPath('userData'), 'henrique.db')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}

// For testing only — allows injecting in-memory DB
export function createTestDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema })
}

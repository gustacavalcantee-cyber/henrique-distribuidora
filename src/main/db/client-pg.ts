// src/main/db/client-pg.ts
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema-pg'

let _db: ReturnType<typeof drizzle> | null = null
let _sql: ReturnType<typeof postgres> | null = null

export function getDb() {
  if (_db) return _db
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL not set')
  _sql = postgres(url, { max: 5 })
  _db = drizzle(_sql, { schema })
  return _db
}

export async function closeDb() {
  if (_sql) {
    await _sql.end()
    _sql = null
    _db = null
  }
}

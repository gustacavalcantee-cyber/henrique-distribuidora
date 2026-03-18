// src/main/db/migrate.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { getDb } from './client'

export function runMigrations() {
  const db = getDb()
  // @ts-ignore — access internal sqlite3 connection
  migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') })
}

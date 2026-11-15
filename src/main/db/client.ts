// src/main/db/client.ts
// Old versions kept the NF-e settings in a henrique.db file inside the Google Drive folder
// "Programa/data" (or in userData when there was no Drive). Everything now lives in the local
// database (client-local.ts). This file only reads that old NF-e config once, read-only,
// so the note numbering carries over after the upgrade.
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as schema from './schema'

const NOMES_DRIVE = ['Meu Drive', 'My Drive', 'Mi unidad']

function caminhosLegados(): string[] {
  const caminhos: string[] = []
  const pastasDrive: string[] = []
  try {
    if (process.platform === 'darwin') {
      const cloudStorage = join(homedir(), 'Library', 'CloudStorage')
      if (existsSync(cloudStorage)) {
        for (const entry of readdirSync(cloudStorage)) {
          if (entry.startsWith('GoogleDrive-')) pastasDrive.push(join(cloudStorage, entry))
        }
      }
    } else if (process.platform === 'win32') {
      for (const letra of 'DEFGHIJKLMNOPQRSTUVWXYZ') pastasDrive.push(`${letra}:\\`)
      pastasDrive.push(join(homedir(), 'Google Drive'), homedir())
    }
  } catch { /* no Drive folder */ }
  for (const base of pastasDrive) {
    for (const nome of NOMES_DRIVE) caminhos.push(join(base, nome, 'Programa', 'data', 'henrique.db'))
  }
  caminhos.push(join(app.getPath('userData'), 'henrique.db'))
  return caminhos
}

// For the older tests that build an in-memory database with the original schema
export function createTestDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema })
}

/** The NF-e config JSON saved by old versions, or null when there is none. */
export function lerNfeConfigLegada(): string | null {
  for (const caminho of caminhosLegados()) {
    try {
      if (!existsSync(caminho)) continue
      const db = new Database(caminho, { readonly: true, fileMustExist: true })
      try {
        const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nfe_config'").get() as { valor: string } | undefined
        if (row?.valor) return row.valor
      } finally {
        db.close()
      }
    } catch { /* unreadable or missing table: try the next one */ }
  }
  return null
}

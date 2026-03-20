// src/main/db/client.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null

function findGoogleDriveDataPath(): string | null {
  try {
    if (process.platform === 'darwin') {
      const cloudStorage = join(homedir(), 'Library', 'CloudStorage')
      if (!existsSync(cloudStorage)) return null
      const entries = readdirSync(cloudStorage)
      for (const entry of entries) {
        if (!entry.startsWith('GoogleDrive-')) continue
        for (const driveName of ['Meu Drive', 'My Drive']) {
          const dataPath = join(cloudStorage, entry, driveName, 'Programa', 'data')
          const drivePath = join(cloudStorage, entry, driveName, 'Programa')
          if (existsSync(drivePath)) {
            mkdirSync(dataPath, { recursive: true })
            return dataPath
          }
        }
      }
    } else if (process.platform === 'win32') {
      // Google Drive for Desktop: busca nas letras de unidade comuns
      for (const letter of ['G', 'H', 'I', 'D', 'E', 'F']) {
        for (const driveName of ['Meu Drive', 'My Drive']) {
          const drivePath = join(`${letter}:\\`, driveName, 'Programa')
          if (existsSync(drivePath)) {
            const dataPath = join(drivePath, 'data')
            mkdirSync(dataPath, { recursive: true })
            return dataPath
          }
        }
      }
      // Google Drive Backup & Sync (caminho antigo)
      for (const driveName of ['Google Drive\\Meu Drive', 'Google Drive\\My Drive']) {
        const drivePath = join(homedir(), driveName, 'Programa')
        if (existsSync(drivePath)) {
          const dataPath = join(drivePath, 'data')
          mkdirSync(dataPath, { recursive: true })
          return dataPath
        }
      }
    }
  } catch {
    // silently fall through to userData
  }
  return null
}

export function getDbPath(): string {
  const legacyPath = join(app.getPath('userData'), 'henrique.db')
  const gdataPath = findGoogleDriveDataPath()

  if (!gdataPath) return legacyPath

  const gdrivePath = join(gdataPath, 'henrique.db')

  // Migra banco existente para o Google Drive (uma única vez)
  if (!existsSync(gdrivePath) && existsSync(legacyPath)) {
    copyFileSync(legacyPath, gdrivePath)
  }

  return gdrivePath
}

export function getDb() {
  if (_db) return _db
  const dbPath = getDbPath()
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

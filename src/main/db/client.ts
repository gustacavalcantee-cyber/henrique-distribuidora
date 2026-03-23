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
      const driveNames = ['Meu Drive', 'My Drive', 'Mi unidad']
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require('child_process')

      function tryDrivePath(base: string): string | null {
        for (const driveName of driveNames) {
          const drivePath = join(base, driveName, 'Programa')
          if (existsSync(drivePath)) {
            const dataPath = join(drivePath, 'data')
            mkdirSync(dataPath, { recursive: true })
            return dataPath
          }
        }
        return null
      }

      // 1. Registro: HKCU\Software\Google\DriveFS (Google Drive for Desktop)
      try {
        const result = execSync(
          'reg query "HKCU\\Software\\Google\\DriveFS" /v DefaultMountPoint',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        )
        const match = result.match(/DefaultMountPoint\s+REG_SZ\s+(.+)/)
        if (match) {
          const found = tryDrivePath(match[1].trim())
          if (found) return found
        }
      } catch { /* segue */ }

      // 2. Registro alternativo: HKCU\Software\Google\Drive (versões mais antigas)
      try {
        const result = execSync(
          'reg query "HKCU\\Software\\Google\\Drive" /v Path',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        )
        const match = result.match(/Path\s+REG_SZ\s+(.+)/)
        if (match) {
          const found = tryDrivePath(match[1].trim())
          if (found) return found
        }
      } catch { /* segue */ }

      // 3. Varre todas as letras de unidade (A-Z)
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
        const found = tryDrivePath(`${letter}:\\`)
        if (found) return found
      }

      // 4. Google Drive Backup & Sync (caminho antigo: ~/Google Drive/...)
      const found = tryDrivePath(join(homedir(), 'Google Drive'))
      if (found) return found

      // 5. Pasta direta no perfil do usuário (alguns setups)
      for (const driveName of driveNames) {
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

export function getDbSource(): 'google-drive' | 'local' {
  return findGoogleDriveDataPath() ? 'google-drive' : 'local'
}

/** Returns the raw better-sqlite3 instance from a Drizzle db (if open). */
function getRawSqlite(db: ReturnType<typeof drizzle> | null): Database.Database | null {
  try {
    return (db as unknown as { session: { db: Database.Database } }).session?.db ?? null
  } catch {
    return null
  }
}

export function getDb() {
  if (_db) return _db
  const dbPath = getDbPath()
  const sqlite = new Database(dbPath)
  // DELETE journal mode (vs WAL) is essential for Google Drive sync:
  //   - Writes go directly into the main .db file — no auxiliary .db-wal / .db-shm files
  //   - The main file's mtime updates on every write, so the cross-machine watcher works reliably
  //   - Cloud storage clients sync a single file cleanly without partial-WAL corruption
  // Checkpoint any leftover WAL from a previous session before switching modes.
  try { sqlite.pragma('wal_checkpoint(TRUNCATE)') } catch { /* may not exist */ }
  sqlite.pragma('journal_mode = DELETE')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}

export function reloadDb() {
  try {
    const raw = getRawSqlite(_db)
    if (raw) {
      // Flush any pending changes to the main file before closing
      try { raw.pragma('wal_checkpoint(TRUNCATE)') } catch { /* ignore */ }
      raw.close()
    }
  } catch { /* ignora erros ao fechar */ }
  _db = null
  // Reabre na próxima chamada de getDb()
}

/** Call on app quit to ensure all data is written to disk before cloud sync picks it up. */
export function closeDb() {
  try {
    const raw = getRawSqlite(_db)
    if (raw) {
      try { raw.pragma('wal_checkpoint(TRUNCATE)') } catch { /* ignore */ }
      raw.close()
    }
  } catch { /* ignore */ }
  _db = null
}

// For testing only — allows injecting in-memory DB
export function createTestDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema })
}

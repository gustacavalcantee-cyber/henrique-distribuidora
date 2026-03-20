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

export function getDb() {
  if (_db) return _db
  const dbPath = getDbPath()
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}

export function reloadDb() {
  try {
    if (_db) {
      // Fecha a conexão atual
      (_db as unknown as { session: { db: Database.Database } }).session?.db?.close()
    }
  } catch { /* ignora erros ao fechar */ }
  _db = null
  // Reabre na próxima chamada de getDb()
}

// For testing only — allows injecting in-memory DB
export function createTestDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema })
}

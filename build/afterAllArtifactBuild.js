/**
 * afterAllArtifactBuild.js
 * Runs after electron-builder finishes all artifacts.
 * Copies DMG and EXE to the Google Drive releases/ folder automatically.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

function findGoogleDriveReleasesPath() {
  if (process.platform === 'darwin') {
    const cloudStorage = path.join(os.homedir(), 'Library', 'CloudStorage')
    if (!fs.existsSync(cloudStorage)) return null
    for (const entry of fs.readdirSync(cloudStorage)) {
      if (!entry.startsWith('GoogleDrive-')) continue
      for (const driveName of ['Meu Drive', 'My Drive']) {
        const releasesPath = path.join(cloudStorage, entry, driveName, 'Programa', 'releases')
        const programaPath = path.join(cloudStorage, entry, driveName, 'Programa')
        if (fs.existsSync(programaPath)) {
          fs.mkdirSync(releasesPath, { recursive: true })
          return releasesPath
        }
      }
    }
  } else if (process.platform === 'win32') {
    const { execSync } = require('child_process')
    const driveNames = ['Meu Drive', 'My Drive', 'Mi unidad']

    function tryBase(base) {
      for (const name of driveNames) {
        const programaPath = path.join(base, name, 'Programa')
        if (fs.existsSync(programaPath)) {
          const releasesPath = path.join(programaPath, 'releases')
          fs.mkdirSync(releasesPath, { recursive: true })
          return releasesPath
        }
      }
      return null
    }

    // Registro
    try {
      const r = execSync('reg query "HKCU\\Software\\Google\\DriveFS" /v DefaultMountPoint', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
      const m = r.match(/DefaultMountPoint\s+REG_SZ\s+(.+)/)
      if (m) { const found = tryBase(m[1].trim()); if (found) return found }
    } catch {}

    // Letras A-Z
    for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
      const found = tryBase(`${l}:\\`)
      if (found) return found
    }
  }
  return null
}

exports.default = async function(buildResult) {
  const releasesPath = findGoogleDriveReleasesPath()

  if (!releasesPath) {
    console.log('[afterBuild] Google Drive não encontrado — backup ignorado.')
    return
  }

  const extensions = ['.dmg', '.exe', '.yml', '.blockmap']
  let copied = 0

  for (const artifactPath of buildResult.artifactPaths) {
    const ext = path.extname(artifactPath).toLowerCase()
    if (!extensions.includes(ext)) continue

    const dest = path.join(releasesPath, path.basename(artifactPath))
    try {
      fs.copyFileSync(artifactPath, dest)
      console.log(`[afterBuild] Copiado para Google Drive: ${path.basename(artifactPath)}`)
      copied++
    } catch (e) {
      console.warn(`[afterBuild] Erro ao copiar ${path.basename(artifactPath)}: ${e.message}`)
    }
  }

  if (copied > 0) {
    console.log(`[afterBuild] ✅ ${copied} arquivo(s) salvo(s) em: ${releasesPath}`)
  }
}

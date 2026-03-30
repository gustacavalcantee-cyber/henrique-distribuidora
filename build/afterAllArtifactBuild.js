/**
 * afterAllArtifactBuild.js
 * Copia DMG/EXE para Google Drive releases/ e gera update-info.json (backup secundário).
 * GitHub Releases continua como fonte principal de atualização.
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
        const programaPath = path.join(cloudStorage, entry, driveName, 'Programa')
        if (fs.existsSync(programaPath)) {
          const releasesPath = path.join(programaPath, 'releases')
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

    try {
      const r = execSync('reg query "HKCU\\Software\\Google\\DriveFS" /v DefaultMountPoint', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
      const m = r.match(/DefaultMountPoint\s+REG_SZ\s+(.+)/)
      if (m) { const f = tryBase(m[1].trim()); if (f) return f }
    } catch {}

    for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
      const f = tryBase(`${l}:\\`)
      if (f) return f
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

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
  const version = pkg.version
  const extensions = ['.dmg', '.exe', '.yml', '.blockmap']

  let copied = 0
  let macFile = ''
  let winFile = ''

  for (const artifactPath of buildResult.artifactPaths) {
    const ext = path.extname(artifactPath).toLowerCase()
    const basename = path.basename(artifactPath)
    if (!extensions.includes(ext)) continue

    const dest = path.join(releasesPath, basename)
    try {
      fs.copyFileSync(artifactPath, dest)
      console.log(`[afterBuild] ✅ ${basename}`)
      copied++
      if (ext === '.dmg') macFile = basename
      if (ext === '.exe' && basename.includes('setup')) winFile = basename
    } catch (e) {
      console.warn(`[afterBuild] Erro ao copiar ${basename}: ${e.message}`)
    }
  }

  // Copia latest.yml e latest-mac.yml do dist/ (não estão em buildResult.artifactPaths)
  const distDir = path.join(__dirname, '..', 'dist')
  for (const ymlName of ['latest.yml', 'latest-mac.yml']) {
    const src = path.join(distDir, ymlName)
    if (fs.existsSync(src)) {
      const dest = path.join(releasesPath, ymlName)
      try {
        fs.copyFileSync(src, dest)
        console.log(`[afterBuild] ✅ ${ymlName}`)
        copied++
      } catch (e) {
        console.warn(`[afterBuild] Erro ao copiar ${ymlName}: ${e.message}`)
      }
    }
  }

  // Preserva win_file de versão anterior se não temos um novo (build foi só no Mac)
  const infoPath = path.join(releasesPath, 'update-info.json')
  if (!winFile && fs.existsSync(infoPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(infoPath, 'utf-8'))
      if (prev.win_file) winFile = prev.win_file
    } catch {}
  }

  // Gera update-info.json no Drive (backup/referência)
  const updateInfo = {
    version,
    notes: '',
    mac_file: macFile,
    win_file: winFile,
    updated_at: new Date().toISOString(),
  }
  fs.writeFileSync(infoPath, JSON.stringify(updateInfo, null, 2))

  console.log(`[afterBuild] 📦 ${copied} arquivo(s) + update-info.json → v${version}`)
  console.log(`[afterBuild] 📁 ${releasesPath}`)
}

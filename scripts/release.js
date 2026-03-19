#!/usr/bin/env node
'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT = path.join(__dirname, '..')
const PKG_PATH = path.join(ROOT, 'package.json')
const RELEASES_DIR = path.join(ROOT, 'releases')
const UPDATE_INFO_PATH = path.join(RELEASES_DIR, 'update-info.json')

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

function bumpPatch(version) {
  const parts = version.split('.').map(Number)
  parts[2]++
  return parts.join('.')
}

function readExistingDownloadUrl() {
  if (!fs.existsSync(UPDATE_INFO_PATH)) return null
  try {
    const data = JSON.parse(fs.readFileSync(UPDATE_INFO_PATH, 'utf-8'))
    if (data.download_url && !data.download_url.includes('REPLACE_WITH')) {
      return data.download_url
    }
  } catch {}
  return null
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'))
  const currentVersion = pkg.version
  const suggested = bumpPatch(currentVersion)

  console.log('\n=== RELEASE ===')
  console.log('Versao atual: ' + currentVersion)

  const inputVersion = await ask(rl, 'Nova versao [' + suggested + ']: ')
  const newVersion = inputVersion.trim() || suggested

  const inputNotes = await ask(rl, 'Notas desta versao: ')
  const notes = inputNotes.trim() || 'Versao ' + newVersion

  rl.close()

  // 1. Update package.json
  pkg.version = newVersion
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
  console.log('\nVersao atualizada para ' + newVersion)

  // 2. Build (typecheck + vite)
  console.log('\nCompilando...')
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

  // 3. Build Mac DMG
  console.log('\nGerando instalador Mac...')
  try {
    execSync('electron-builder --mac', { cwd: ROOT, stdio: 'inherit' })
    console.log('Mac: OK')
  } catch (e) {
    console.error('Mac build falhou:', e.message)
  }

  // 4. Build Windows EXE (optional — needs Wine on Mac)
  console.log('\nGerando instalador Windows...')
  try {
    execSync('electron-builder --win', { cwd: ROOT, stdio: 'inherit' })
    console.log('Windows: OK')
  } catch (e) {
    console.log('Windows build falhou (normal se Wine nao estiver instalado).')
    console.log('Para gerar o .exe, instale Wine: brew install --cask wine-stable')
  }

  // 5. Copy installers to releases/
  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true })
  }

  const distDir = path.join(ROOT, 'dist')
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir)
    let copied = 0
    for (const file of files) {
      if (file.endsWith('.dmg') || file.endsWith('-setup.exe')) {
        const src = path.join(distDir, file)
        const dst = path.join(RELEASES_DIR, file)
        fs.copyFileSync(src, dst)
        console.log('Copiado: ' + file)
        copied++
      }
    }
    if (copied === 0) {
      console.log('Nenhum instalador encontrado em dist/ para copiar.')
    }
  }

  // 6. Write update-info.json
  const downloadUrl =
    readExistingDownloadUrl() ||
    'https://drive.google.com/drive/folders/REPLACE_WITH_FOLDER_ID'
  const updateInfo = { version: newVersion, notes, download_url: downloadUrl }
  fs.writeFileSync(UPDATE_INFO_PATH, JSON.stringify(updateInfo, null, 2) + '\n')

  console.log('\n=== PRONTO ===')
  console.log('Versao ' + newVersion + ' compilada e copiada para releases/')
  console.log('Aguarde o Google Drive sincronizar antes de anunciar a atualizacao.\n')

  if (downloadUrl.includes('REPLACE_WITH')) {
    console.log('ATENCAO: Configuracao inicial necessaria (apenas uma vez):')
    console.log('1. Abra drive.google.com -> Meu Drive / Programa / releases/')
    console.log('2. Clique direito na PASTA releases/ -> Compartilhar -> Qualquer pessoa com o link')
    console.log('   Cole o link da pasta no campo "download_url" em releases/update-info.json')
    console.log('3. Clique direito em update-info.json -> Compartilhar -> Qualquer pessoa com o link')
    console.log('   Extraia o ID do arquivo e coloque em UPDATE_INFO_URL no atualizacao.ts')
    console.log('   Exemplo: https://drive.google.com/uc?export=download&id=SEU_ID_AQUI')
    console.log('4. Rode npm run release novamente para aplicar as URLs configuradas.')
  }
}

main().catch((err) => {
  console.error('Erro:', err.message)
  process.exit(1)
})

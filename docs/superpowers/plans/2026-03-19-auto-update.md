# Auto-Update via Google Drive — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the developer to run `npm run release` to build installers for Mac and Windows, place them in `releases/` (auto-synced to Google Drive), and have the app fetch `update-info.json` from a public Drive URL to detect and present new versions to users.

**Architecture:** A Node.js release script generates `update-info.json` and copies installers to `releases/`. The Electron main process handler fetches this JSON via HTTPS instead of reading a local file. The existing `Atualizacao.tsx` UI is updated to use `download_url` (opens browser) instead of a local file path.

**Tech Stack:** Node.js (`https`, `fs`, `child_process`, `readline`), Electron `shell.openExternal`, electron-builder (dmg + nsis targets), Google Drive public sharing.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `electron-builder.yml` | Modify | Change Mac target from `dir` to `dmg` |
| `releases/update-info.json` | Create | Initial version info + placeholder URL |
| `src/main/handlers/atualizacao.ts` | Rewrite | Fetch JSON via HTTPS, open browser for download |
| `src/renderer/src/pages/Atualizacao.tsx` | Modify | Use `download_url` instead of local file |
| `scripts/release.js` | Create | Interactive release script |
| `package.json` | Modify | Add `release` npm script |

---

## Chunk 1: Build Config + Initial Files

### Task 1: Change Mac build target to DMG

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Open `electron-builder.yml` and locate the `mac` section**

Current content (lines 24-34):
```yaml
mac:
  identity: null
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSCameraUsageDescription: Application requests access to the device's camera.
    - NSMicrophoneUsageDescription: Application requests access to the device's microphone.
    - NSDocumentsFolderUsageDescription: Application requests access to the user's Documents folder.
    - NSDownloadsFolderUsageDescription: Application requests access to the user's Downloads folder.
  target:
    - target: dir
      arch: [arm64]
```

- [ ] **Step 2: Change `target: dir` to `target: dmg`**

Replace just the `target:` block under `mac:`:
```yaml
  target:
    - target: dmg
      arch: [arm64]
```

- [ ] **Step 3: Verify the file looks correct**

Run:
```bash
grep -A 2 "target:" electron-builder.yml
```
Expected output includes `target: dmg` and `target: nsis`.

---

### Task 2: Create initial `releases/update-info.json`

**Files:**
- Create: `releases/update-info.json`

- [ ] **Step 1: Read current version from package.json**

Run:
```bash
node -e "console.log(require('./package.json').version)"
```
Expected: `1.0.0`

- [ ] **Step 2: Create `releases/update-info.json`**

```json
{
  "version": "1.0.0",
  "notes": "Versao inicial",
  "download_url": "https://drive.google.com/drive/folders/REPLACE_WITH_FOLDER_ID"
}
```

- [ ] **Step 3: Verify file is in place**

Run:
```bash
cat releases/update-info.json
```
Expected: JSON with version 1.0.0.

---

## Chunk 2: Update Handler (Main Process)

### Task 3: Rewrite `atualizacao.ts` to fetch via HTTPS

**Files:**
- Modify: `src/main/handlers/atualizacao.ts`

**Context:** The current handler reads `version.json` from a local folder path. We replace it with an HTTPS fetch from a Google Drive public URL. Node's `https` module does not follow redirects automatically — Google Drive redirects once before serving the file, so we implement a simple redirect follower.

- [ ] **Step 1: Replace the entire file with the new implementation**

```typescript
import { ipcMain, shell, app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import * as https from 'https'
import * as http from 'http'

// Set this after sharing releases/update-info.json publicly on Google Drive.
// 1. Right-click update-info.json in Google Drive web -> Share -> Anyone with the link
// 2. Copy the link, extract the file ID (the long string after /d/ or id=)
// 3. Replace REPLACE_WITH_FILE_ID below with that ID
// Example URL: https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
const UPDATE_INFO_URL =
  'https://drive.google.com/uc?export=download&id=REPLACE_WITH_FILE_ID'

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const doGet = (u: string, redirectCount = 0): void => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }
      const mod = u.startsWith('https') ? https : http
      mod
        .get(u, (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302) &&
            res.headers.location
          ) {
            doGet(res.headers.location, redirectCount + 1)
            return
          }
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => resolve(data))
          res.on('error', reject)
        })
        .on('error', reject)
    }
    doGet(url)
  })
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

export function registerAtualizacaoHandlers(): void {
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    const versaoAtual = app.getVersion()

    if (UPDATE_INFO_URL.includes('REPLACE_WITH_FILE_ID')) {
      return {
        disponivel: false,
        versaoAtual,
        erro: 'URL de atualizacao nao configurada. Contate o desenvolvedor.',
      }
    }

    try {
      const text = await fetchText(UPDATE_INFO_URL)
      const data = JSON.parse(text) as {
        version: string
        notes?: string
        download_url?: string
      }

      const versaoNova = data.version
      const notas = data.notes ?? ''
      const download_url = data.download_url ?? ''
      const temUpdate = compareVersions(versaoNova, versaoAtual) > 0

      return { disponivel: temUpdate, versaoAtual, versaoNova, notas, download_url }
    } catch (err) {
      return {
        disponivel: false,
        versaoAtual,
        erro: 'Erro ao verificar atualizacao: ' + String(err),
      }
    }
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, (_event, url: string) => {
    shell.openExternal(url)
    return { ok: true }
  })
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm run typecheck
```
Expected: zero errors.

---

## Chunk 3: Update UI

### Task 4: Update `Atualizacao.tsx` for new response shape

**Files:**
- Modify: `src/renderer/src/pages/Atualizacao.tsx`

**Context:** The existing UI has `arquivo` (local file path) and `dmgExiste` (boolean). We replace these with `download_url` and open the browser instead of a local file. The rest of the UI (version display, notes, spinner, last-check time) stays the same.

- [ ] **Step 1: Replace the entire file**

```tsx
import { useState, useEffect } from 'react'
import { IPC } from '../../../shared/ipc-channels'
import { RefreshCw, CheckCircle, Download, AlertCircle, Clock } from 'lucide-react'

interface UpdateInfo {
  disponivel: boolean
  versaoAtual?: string
  versaoNova?: string
  notas?: string
  download_url?: string
  erro?: string
}

export function Atualizacao() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  async function checkUpdate() {
    setLoading(true)
    try {
      const result = (await window.electron.invoke(IPC.UPDATE_CHECK)) as UpdateInfo
      setInfo(result)
      setLastCheck(new Date())
    } catch {
      setInfo({ disponivel: false, erro: 'Erro ao verificar atualizacao' })
    } finally {
      setLoading(false)
    }
  }

  async function openDownload() {
    if (!info?.download_url) return
    setOpening(true)
    try {
      await window.electron.invoke(IPC.UPDATE_INSTALL, info.download_url)
    } finally {
      setOpening(false)
    }
  }

  useEffect(() => {
    checkUpdate()
  }, [])

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Atualizacao</h1>
      <p className="text-sm text-slate-500 mb-8">Verifique se ha uma nova versao disponivel</p>

      {/* Current version card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Versao instalada</p>
            <p className="text-2xl font-bold text-slate-800">{info?.versaoAtual ?? '—'}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
            <CheckCircle size={22} className="text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Update status */}
      {info && !loading && (
        <div
          className={`border rounded-xl p-5 mb-4 ${
            info.disponivel
              ? 'bg-blue-50 border-blue-200'
              : info.erro
                ? 'bg-red-50 border-red-200'
                : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          {info.disponivel ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Download size={18} className="text-blue-600" />
                <p className="font-semibold text-blue-800">
                  Nova versao disponivel: {info.versaoNova}
                </p>
              </div>
              {info.notas && (
                <p className="text-sm text-blue-700 mb-4 leading-relaxed">{info.notas}</p>
              )}
              <button
                onClick={openDownload}
                disabled={opening}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {opening ? 'Abrindo...' : 'Ir para download'}
              </button>
              <p className="text-xs text-blue-500 mt-2 text-center">
                O navegador vai abrir com os arquivos de instalacao. Baixe o instalador correto para o seu sistema e instale.
              </p>
            </>
          ) : info.erro ? (
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-red-500" />
              <p className="text-sm text-red-700">{info.erro}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-600" />
              <p className="text-sm text-emerald-700 font-medium">O programa esta atualizado.</p>
            </div>
          )}
        </div>
      )}

      {/* Check button */}
      <button
        onClick={checkUpdate}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Verificando...' : 'Verificar agora'}
      </button>

      {lastCheck && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Clock size={12} className="text-slate-300" />
          <p className="text-xs text-slate-400">
            Ultima verificacao: {lastCheck.toLocaleTimeString('pt-BR')}
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 bg-slate-50 rounded-xl p-4 border border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Como funciona
        </p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
          <li>O programa verifica automaticamente por novas versoes</li>
          <li>Quando disponivel, clique em "Ir para download"</li>
          <li>Baixe o instalador correto para o seu sistema (Mac ou Windows)</li>
          <li>Execute o instalador e reabra o programa</li>
        </ol>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npm run typecheck
```
Expected: zero errors.

---

## Chunk 4: Release Script

### Task 5: Create `scripts/release.js`

**Files:**
- Create: `scripts/release.js`

**Context:** This is a Node.js CLI script (no TypeScript, runs with `node`). It prompts the developer for a new version and release notes, builds the app, copies installers to `releases/`, and writes `update-info.json`. The Windows build is attempted but failures are non-fatal (Wine may not be installed).

- [ ] **Step 1: Create `scripts/` directory if it doesn't exist**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Create `scripts/release.js`**

```javascript
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

  // 2. Build
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
    console.log('Para gerar o Windows, instale Wine: brew install --cask wine-stable')
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
  const downloadUrl = readExistingDownloadUrl() || 'https://drive.google.com/drive/folders/REPLACE_WITH_FOLDER_ID'
  const updateInfo = { version: newVersion, notes, download_url: downloadUrl }
  fs.writeFileSync(UPDATE_INFO_PATH, JSON.stringify(updateInfo, null, 2) + '\n')

  console.log('\n=== PRONTO ===')
  console.log('Versao ' + newVersion + ' compilada e copiada para releases/')
  console.log('Aguarde o Google Drive sincronizar antes de anunciar a atualizacao.\n')

  if (downloadUrl.includes('REPLACE_WITH')) {
    console.log('ATENCAO: Configure o download_url e o UPDATE_INFO_URL:')
    console.log('1. Acesse o Google Drive web -> pasta releases/')
    console.log('2. Clique direito na pasta -> Compartilhar -> Qualquer pessoa com o link')
    console.log('3. Cole o link da pasta no campo "download_url" em releases/update-info.json')
    console.log('4. Clique direito em update-info.json -> Compartilhar -> Qualquer pessoa com o link')
    console.log('5. Extraia o ID do arquivo e coloque em UPDATE_INFO_URL no atualizacao.ts')
    console.log('   Exemplo: https://drive.google.com/uc?export=download&id=SEU_ID_AQUI')
  }
}

main().catch((err) => {
  console.error('Erro:', err.message)
  process.exit(1)
})
```

- [ ] **Step 3: Verify script syntax**

```bash
node --check scripts/release.js
```
Expected: no output (no syntax errors).

---

### Task 6: Add `release` script to `package.json`

**Files:**
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Add the release script**

In `package.json`, add `"release"` to the `"scripts"` object:

```json
"release": "node scripts/release.js"
```

The full `scripts` block becomes:
```json
"scripts": {
  "format": "prettier --write .",
  "lint": "eslint --cache .",
  "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
  "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
  "typecheck": "npm run typecheck:node && npm run typecheck:web",
  "test": "npm rebuild better-sqlite3 && vitest run",
  "start": "electron-vite preview",
  "dev": "electron-vite dev",
  "rebuild:electron": "node -e \"require('fs').rmSync('node_modules/better-sqlite3/build',{recursive:true,force:true})\" && electron-builder install-app-deps",
  "predev": "npm run rebuild:electron",
  "build": "npm run typecheck && electron-vite build",
  "postinstall": "electron-builder install-app-deps",
  "build:unpack": "npm run build && electron-builder --dir",
  "build:win": "npm run build && electron-builder --win",
  "build:mac": "npm run build && electron-builder --mac",
  "build:linux": "npm run build && electron-builder --linux",
  "release": "node scripts/release.js"
}
```

- [ ] **Step 2: Final typecheck**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Commit all changes**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
git add electron-builder.yml releases/update-info.json src/main/handlers/atualizacao.ts src/renderer/src/pages/Atualizacao.tsx scripts/release.js package.json
git commit -m "feat: sistema de atualizacao via Google Drive

- Script npm run release: compila Mac+Win, copia para releases/, gera update-info.json
- Handler atualizacao.ts: busca update-info.json via HTTPS (Google Drive publico)
- UI Atualizacao.tsx: abre navegador para download em vez de arquivo local
- electron-builder.yml: target Mac mudado de dir para dmg

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## One-Time Setup (after first `npm run release`)

After running `npm run release` for the first time and Google Drive syncing the `releases/` folder:

1. Open [drive.google.com](https://drive.google.com)
2. Navigate to `Meu Drive / Programa / releases /`
3. Right-click on the **`releases/` folder** → Share → "Anyone with the link can view" → copy link
   - Extract the folder ID from the URL (the long string after `/folders/`)
   - Open `releases/update-info.json` and replace `REPLACE_WITH_FOLDER_ID` with this ID
4. Right-click on **`update-info.json`** → Share → "Anyone with the link can view" → copy link
   - Extract the file ID from the URL (after `/d/` or `id=`)
   - Open `src/main/handlers/atualizacao.ts` and replace `REPLACE_WITH_FILE_ID` with this ID
5. Run `npm run release` again (to rebuild with the correct URL) or manually rebuild with `npm run build:mac`
6. Done — from now on `npm run release` handles everything automatically

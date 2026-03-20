# Auto-Update System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every push to `main` automatically builds Mac + Windows installers, publishes a GitHub Release, and the app downloads + installs the update silently (Windows) or prompts one action (Mac).

**Architecture:** `electron-updater` integrates with GitHub Releases as the update server. The main process runs `autoUpdater` and forwards progress events to the renderer via `webContents.send`. The `Atualizacao.tsx` page listens to these events and replaces the old manual HTTP check.

**Tech Stack:** `electron-updater`, GitHub Actions, GitHub Releases, `electron-builder` github publish provider

---

## Chunk 1: Dependencies + Build Config

### Task 1: Install electron-updater and update electron-builder publish config

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Modify: `build/dev-app-update.yml` (create if missing)

- [ ] **Step 1: Install electron-updater as a runtime dependency**

```bash
npm install electron-updater
```

Expected: `electron-updater` appears in `dependencies` in `package.json` (not devDependencies).

- [ ] **Step 2: Update electron-builder.yml publish section**

Replace the existing `publish` block at the bottom of `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: gustacavalcantee-cyber
  repo: henrique-distribuidora
```

Also add `zip` as a secondary Mac target so `electron-updater` can auto-update on Mac (DMG stays for manual install, zip is used by updater):

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
    - target: dmg
      arch: [arm64]
    - target: zip
      arch: [arm64]
```

- [ ] **Step 3: Create build/dev-app-update.yml for local dev testing**

Create file `build/dev-app-update.yml`:

```yaml
owner: gustacavalcantee-cyber
repo: henrique-distribuidora
provider: github
updaterCacheDirName: henrique-distribuidora-updater
```

- [ ] **Step 4: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron-builder.yml build/dev-app-update.yml
git commit -m "chore: install electron-updater, configure github publish provider"
```

---

### Task 2: Update GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Replace build.yml with the new auto-release workflow**

Replace the entire contents of `.github/workflows/build.yml`:

```yaml
name: Build and Release

on:
  push:
    branches: [main]

jobs:
  bump-version:
    name: Bump patch version
    runs-on: ubuntu-latest
    # Skip if this is the version-bump commit itself
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    outputs:
      new_version: ${{ steps.bump.outputs.new_version }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Bump patch version and tag
        id: bump
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          CURRENT=$(node -e "console.log(require('./package.json').version)")
          IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
          NEW_PATCH=$((PATCH + 1))
          NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"

          node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
            pkg.version = '$NEW_VERSION';
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
          "

          git add package.json
          git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
          git tag "v$NEW_VERSION"
          git push origin main --tags

          echo "new_version=$NEW_VERSION" >> $GITHUB_OUTPUT

  build-mac:
    name: Build Mac (DMG + ZIP)
    needs: bump-version
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: main

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build Mac
        run: npm run build:mac
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Mac artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mac-artifacts
          path: |
            dist/*.dmg
            dist/*.zip
            dist/*.yml
          retention-days: 7

  build-windows:
    name: Build Windows (EXE)
    needs: bump-version
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: main

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build Windows
        run: npm run build:win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Windows artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-artifacts
          path: |
            dist/*.exe
            dist/*.yml
          retention-days: 7

  publish-release:
    name: Publish GitHub Release
    needs: [bump-version, build-mac, build-windows]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download Mac artifacts
        uses: actions/download-artifact@v4
        with:
          name: mac-artifacts
          path: dist/

      - name: Download Windows artifacts
        uses: actions/download-artifact@v4
        with:
          name: windows-artifacts
          path: dist/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.bump-version.outputs.new_version }}
          name: v${{ needs.bump-version.outputs.new_version }}
          body: |
            Atualização automática — ${{ github.event.head_commit.message }}
          files: dist/*
          token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: auto-release on push to main with version bump"
```

---

## Chunk 2: Main Process + IPC

### Task 3: Add updater IPC channels

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add new update event channels to IPC**

In `src/shared/ipc-channels.ts`, add inside the `IPC` object after `UPDATE_INSTALL`:

```ts
  UPDATE_AVAILABLE:  'update:available',
  UPDATE_PROGRESS:   'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR:      'update:error',
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat: add electron-updater IPC event channels"
```

---

### Task 4: Set up autoUpdater in main process

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/handlers/atualizacao.ts`

- [ ] **Step 1: Update src/main/index.ts to initialise autoUpdater after window is created**

Replace the entire file with:

```ts
import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerAllHandlers } from './handlers'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // In dev, don't check for updates
  if (is.dev) return

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send(IPC.UPDATE_PROGRESS, { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send(IPC.UPDATE_ERROR, { message: err.message })
  })

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register IPC handlers before app is ready
registerAllHandlers()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.henrique.vendas')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  runMigrations()
  seedIfEmpty()
  createWindow()
  setupAutoUpdater()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 2: Update src/main/handlers/atualizacao.ts to use autoUpdater for install**

Replace the entire file with:

```ts
import { ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../shared/ipc-channels'

export function registerAtualizacaoHandlers(): void {
  // Trigger install: on Windows quits and installs; on Mac opens the downloaded DMG
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  // Manual check trigger from renderer
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, erro: String(err) }
    }
  })
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/main/handlers/atualizacao.ts
git commit -m "feat: integrate electron-updater in main process"
```

---

## Chunk 3: Renderer UI

### Task 5: Update Atualizacao.tsx with event-driven UI

**Files:**
- Modify: `src/renderer/src/pages/Atualizacao.tsx`

- [ ] **Step 1: Replace Atualizacao.tsx with the new event-driven version**

Replace the entire file contents:

```tsx
import { useState, useEffect } from 'react'
import { IPC } from '../../../shared/ipc-channels'
import { RefreshCw, CheckCircle, Download, AlertCircle, Clock, RotateCcw } from 'lucide-react'

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

export function Atualizacao() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [installing, setInstalling] = useState(false)
  const isMac = navigator.platform.toLowerCase().includes('mac')

  useEffect(() => {
    // Listen to main-process push events
    window.electron.on(IPC.UPDATE_AVAILABLE, (data: { version: string }) => {
      setState({ status: 'available', version: data.version })
      setLastCheck(new Date())
    })

    window.electron.on(IPC.UPDATE_PROGRESS, (data: { percent: number }) => {
      setState(prev =>
        prev.status === 'available' || prev.status === 'downloading'
          ? { status: 'downloading', version: (prev as any).version ?? '', percent: data.percent }
          : prev
      )
    })

    window.electron.on(IPC.UPDATE_DOWNLOADED, (data: { version: string }) => {
      setState({ status: 'downloaded', version: data.version })
    })

    window.electron.on(IPC.UPDATE_ERROR, (data: { message: string }) => {
      setState({ status: 'error', message: data.message })
    })

    // Trigger a manual check on page open to get current state
    handleCheck()
  }, [])

  async function handleCheck() {
    setState({ status: 'checking' })
    setLastCheck(new Date())
    try {
      await window.electron.invoke(IPC.UPDATE_CHECK)
      // If no UPDATE_AVAILABLE event fires within 3s, we're up to date
      setTimeout(() => {
        setState(prev => prev.status === 'checking' ? { status: 'up-to-date' } : prev)
      }, 3000)
    } catch {
      setState({ status: 'error', message: 'Erro ao verificar atualização' })
    }
  }

  async function handleInstall() {
    setInstalling(true)
    try {
      await window.electron.invoke(IPC.UPDATE_INSTALL)
    } finally {
      setInstalling(false)
    }
  }

  const currentVersion = (window as any).__APP_VERSION__ ?? '—'

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Atualização</h1>
      <p className="text-sm text-slate-500 mb-8">Verifique se há uma nova versão disponível</p>

      {/* Current version card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Versão instalada</p>
            <p className="text-2xl font-bold text-slate-800">v{currentVersion}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
            <CheckCircle size={22} className="text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Status card */}
      {state.status !== 'idle' && (
        <div className={`border rounded-xl p-5 mb-4 ${
          state.status === 'downloaded' ? 'bg-blue-50 border-blue-200' :
          state.status === 'error' ? 'bg-red-50 border-red-200' :
          state.status === 'up-to-date' ? 'bg-emerald-50 border-emerald-200' :
          'bg-slate-50 border-slate-200'
        }`}>

          {state.status === 'checking' && (
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin text-slate-400" />
              <p className="text-sm text-slate-600">Verificando atualizações...</p>
            </div>
          )}

          {state.status === 'up-to-date' && (
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-600" />
              <p className="text-sm text-emerald-700 font-medium">O programa está atualizado.</p>
            </div>
          )}

          {state.status === 'available' && (
            <div className="flex items-center gap-2">
              <Download size={16} className="text-slate-500 animate-bounce" />
              <p className="text-sm text-slate-700">
                Nova versão <span className="font-semibold">v{state.version}</span> encontrada — baixando...
              </p>
            </div>
          )}

          {state.status === 'downloading' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-700 font-medium">Baixando v{state.version}</p>
                <p className="text-sm font-bold text-slate-800">{state.percent}%</p>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.percent}%` }}
                />
              </div>
            </div>
          )}

          {state.status === 'downloaded' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={18} className="text-blue-600" />
                <p className="font-semibold text-blue-800">
                  v{state.version} pronta para instalar
                </p>
              </div>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <RotateCcw size={15} />
                {installing ? 'Instalando...' : isMac ? 'Abrir instalador' : 'Reiniciar e instalar'}
              </button>
              {isMac && (
                <p className="text-xs text-blue-500 mt-2 text-center">
                  O instalador vai abrir — arraste o app para a pasta Aplicativos e reabra.
                </p>
              )}
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{state.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Manual check button */}
      <button
        onClick={handleCheck}
        disabled={state.status === 'checking' || state.status === 'downloading'}
        className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
      >
        <RefreshCw size={15} className={state.status === 'checking' ? 'animate-spin' : ''} />
        {state.status === 'checking' ? 'Verificando...' : 'Verificar agora'}
      </button>

      {lastCheck && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Clock size={12} className="text-slate-300" />
          <p className="text-xs text-slate-400">
            Última verificação: {lastCheck.toLocaleTimeString('pt-BR')}
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 bg-slate-50 rounded-xl p-4 border border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Como funciona
        </p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
          <li>O programa verifica automaticamente ao abrir e a cada 4 horas</li>
          <li>Quando há uma versão nova, o download começa em segundo plano</li>
          {isMac
            ? <li>Quando pronto, clique em "Abrir instalador" e arraste para Aplicativos</li>
            : <li>Quando pronto, clique em "Reiniciar e instalar" — o programa reabre atualizado</li>
          }
        </ol>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Expose app version to renderer**

In `src/preload/index.ts`, add the app version to the exposed API. Replace the file:

```ts
import { contextBridge, ipcRenderer, app } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args))
  },
}

contextBridge.exposeInMainWorld('electron', api)

// Expose app version for the updater UI
contextBridge.exposeInMainWorld('__APP_VERSION__', process.env.npm_package_version ?? '')

export type ElectronAPI = typeof api
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/Atualizacao.tsx src/preload/index.ts
git commit -m "feat: event-driven update UI with download progress and install button"
```

---

### Task 6: Push all changes and verify GitHub Actions

- [ ] **Step 1: Push to main and watch GitHub Actions**

```bash
git push origin main
```

Then open: `https://github.com/gustacavalcantee-cyber/henrique-distribuidora/actions`

Expected: A new workflow run "Build and Release" starts. It will:
1. Bump the patch version (e.g., `1.0.0` → `1.0.1`) and commit `[skip ci]`
2. Build Mac + Windows in parallel (~10 min)
3. Publish a GitHub Release at `https://github.com/gustacavalcantee-cyber/henrique-distribuidora/releases`

- [ ] **Step 2: Verify the GitHub Release was created**

After the workflow completes, check:
`https://github.com/gustacavalcantee-cyber/henrique-distribuidora/releases`

Expected: A release tagged `v1.0.X` with a `.dmg`, `.zip` (Mac) and a `-setup.exe` (Windows) attached.

- [ ] **Step 3: Verify app version shown correctly**

Run locally with `npm run dev`. Navigate to Atualização. The version shown should match `package.json`.

- [ ] **Step 4: Build and install the new Mac DMG to test auto-update flow end-to-end**

```bash
npm run build:mac
```

Install the new DMG. Then push a small change to trigger another release. Open the app → go to Atualização → should show "Verificando..." and then download progress if a newer version exists.

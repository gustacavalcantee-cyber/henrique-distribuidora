# Auto-Update System Design

**Date:** 2026-03-20
**Status:** Approved

## Overview

Every push to `main` on GitHub automatically builds Mac (DMG) and Windows (EXE) installers, publishes a GitHub Release, and increments the patch version. The Electron app uses `electron-updater` to check for updates in the background, download silently, and install — fully automatic on Windows, one-confirm on Mac.

---

## Part 1 — GitHub Actions Workflow

**Trigger:** `push` to `main` branch (replaces manual `workflow_dispatch`).

**Steps:**
1. Read current version from `package.json`
2. Increment patch (`1.0.0` → `1.0.1`) using a Node script
3. Commit updated `package.json` back to `main` with message `chore: bump version to X.Y.Z [skip ci]` — the `[skip ci]` tag prevents an infinite loop
4. Create git tag `vX.Y.Z`
5. Build Mac DMG (`macos-latest`) and Windows EXE (`windows-latest`) in parallel
6. Publish both artifacts as a **GitHub Release** tagged `vX.Y.Z` using `GH_TOKEN`

**electron-builder.yml publish config:**
```yaml
publish:
  provider: github
  owner: gustacavalcantee-cyber
  repo: henrique-distribuidora
```

---

## Part 2 — electron-updater Integration

### Installation
```
npm install electron-updater
```

### Main process (`src/main/index.ts`)
- Import `autoUpdater` from `electron-updater`
- On app `ready`: call `autoUpdater.checkForUpdates()`
- Forward these events to the renderer via `mainWindow.webContents.send`:
  - `update-available` → `{ version }`
  - `download-progress` → `{ percent }`
  - `update-downloaded` → `{ version }`
  - `error` → `{ message }`
- Handle IPC `update:install` → call `autoUpdater.quitAndInstall()` (Windows) or open DMG folder (Mac)

### IPC Channels (additions to `ipc-channels.ts`)
```ts
UPDATE_AVAILABLE:  'update:available'
UPDATE_PROGRESS:   'update:progress'
UPDATE_DOWNLOADED: 'update:downloaded'
UPDATE_ERROR:      'update:error'
UPDATE_INSTALL:    'update:install'   // already exists, repurposed
```

### Preload (`src/preload/index.ts`)
- Expose `onUpdateEvent(channel, callback)` so the renderer can listen to main-process push events

---

## Part 3 — Atualizacao.tsx UI

Replace the current manual HTTP check with `electron-updater` events.

**States:**
| State | UI |
|---|---|
| Checking | spinner "Verificando..." |
| Up to date | ✅ "Programa atualizado" |
| Update available | ℹ️ "Nova versão X.Y.Z encontrada, baixando..." |
| Downloading | progress bar with `%` |
| Downloaded (Windows) | 🔄 botão "Reiniciar e instalar" |
| Downloaded (Mac) | 📂 botão "Abrir instalador" |
| Error | ⚠️ mensagem de erro |

**Auto-check on open:** `autoUpdater.checkForUpdates()` fires on app start; the page shows current state when navigated to.

---

## Part 4 — Mac Behavior (unsigned app)

`electron-updater` with `mac.target: dmg` and no code signing will:
- Download the new DMG to a temp folder
- Emit `update-downloaded`
- On `quitAndInstall()`: open the DMG in Finder — user drags app to Applications (one action)

This is acceptable given the cost of Apple Developer signing ($99/yr).

---

## Data Flow

```
push to main
  → GHA increments version, commits [skip ci]
  → GHA builds Mac + Win, publishes GitHub Release

App starts
  → autoUpdater.checkForUpdates() → hits GitHub Releases API
  → if newer version:
      → download in background
      → emit update-downloaded
      → user clicks "Reiniciar e instalar" / "Abrir instalador"
```

---

## Files Changed

| File | Change |
|---|---|
| `.github/workflows/build.yml` | Replace `workflow_dispatch` with `push` to main; add version bump step; publish GitHub Release |
| `electron-builder.yml` | Change `publish` provider to `github` |
| `package.json` | Add `electron-updater` dependency |
| `src/main/index.ts` | Add `autoUpdater` setup and IPC event forwarding |
| `src/shared/ipc-channels.ts` | Add `UPDATE_AVAILABLE`, `UPDATE_PROGRESS`, `UPDATE_DOWNLOADED`, `UPDATE_ERROR` channels |
| `src/preload/index.ts` | Expose `onUpdateEvent` listener to renderer |
| `src/renderer/src/pages/Atualizacao.tsx` | Replace manual HTTP check with event-driven updater UI |
| `src/main/handlers/atualizacao.ts` | Simplify — remove manual HTTP fetch, keep `UPDATE_INSTALL` handler |

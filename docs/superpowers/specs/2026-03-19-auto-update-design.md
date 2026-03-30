# Auto-Update via Google Drive — Design

## Goal

When the developer runs `npm run release`, the app generates installers for Mac and Windows, places them in the `releases/` folder (synced automatically to Google Drive), and updates `update-info.json`. Users open the "Atualização" screen in the app, which fetches the JSON from a public Google Drive URL, compares versions, and shows a download button that opens the browser to the releases folder.

## Architecture

Three components work together:

1. **Release script** (`scripts/release.js`) — bumps version, builds, copies artifacts, writes `update-info.json`
2. **Update handler** (`src/main/handlers/atualizacao.ts`) — fetches `update-info.json` via HTTPS, compares versions, opens browser for download
3. **Update UI** (`src/renderer/src/pages/Atualizacao.tsx`) — already built; minor adjustment to the response shape

## Tech Stack

Node.js (`https` module, `fs`, `child_process`), Electron `shell.openExternal`, electron-builder (dmg + nsis targets).

---

## releases/ Folder

Location: `<project-root>/releases/` (inside Google Drive sync folder — auto-syncs to cloud)

Contents after each release:
```
releases/
  update-info.json
  henrique-distribuidora-<version>-arm64.dmg
  henrique-distribuidora-<version>-setup.exe
```

`update-info.json` format:
```json
{
  "version": "1.1.0",
  "notes": "Descricao das mudancas nesta versao",
  "download_url": "https://drive.google.com/drive/folders/FOLDER_ID"
}
```

The `download_url` points to the public Google Drive `releases/` folder — fixed forever, set once.

---

## Release Script (`scripts/release.js`)

Invoked via `npm run release`. Steps:
1. Read current version from `package.json`
2. Prompt developer for new version (patch/minor/major or custom)
3. Write new version back to `package.json`
4. Run `electron-vite build`
5. Run `electron-builder --mac --win` (generates DMG + setup.exe in `dist/`)
6. Copy installer files from `dist/` to `releases/`
7. Write `releases/update-info.json` with new version + prompt developer for release notes
8. Print reminder to verify Google Drive sync before announcing update

---

## Update Handler Changes (`src/main/handlers/atualizacao.ts`)

Replace local filesystem read with HTTPS fetch:

- `UPDATE_CHECK`: fetch `update-info.json` from hardcoded Google Drive URL using Node `https.get()`. Parse JSON, compare with `app.getVersion()`. Return `{ disponivel, versaoAtual, versaoNova, notas, download_url }`.
- `UPDATE_INSTALL`: call `shell.openExternal(download_url)` — opens browser to the Drive folder.

Hardcoded constant at top of file:
```ts
const UPDATE_INFO_URL = 'https://drive.google.com/uc?export=download&id=FILE_ID'
```
This URL is set once after the first `npm run release` and sharing `update-info.json` publicly.

---

## electron-builder.yml Changes

Mac target must change from `dir` to `dmg` so a proper installer is produced:
```yaml
mac:
  target:
    - target: dmg
      arch: [arm64]
```

---

## UI Changes (`src/renderer/src/pages/Atualizacao.tsx`)

- Replace `arquivo`/`dmgExiste` references with `download_url`
- Button label: "Ir para download" (opens browser) instead of "Instalar atualização" (opens local file)
- Remove `UPDATE_INSTALL` call with file path; pass `download_url` instead

---

## One-Time Setup (after first release)

1. Run `npm run release` — generates files in `releases/`
2. Wait for Google Drive to sync
3. Open Google Drive web → navigate to `releases/` folder
4. Right-click `update-info.json` → Share → "Anyone with the link can view" → copy link
5. Extract file ID from the link URL
6. Set `UPDATE_INFO_URL` constant in `atualizacao.ts`
7. Right-click `releases/` folder → Share → "Anyone with the link can view" → copy link
8. Set `download_url` in `update-info.json` to this folder link
9. Rebuild and distribute — setup never needed again

---

## Flow Summary

```
npm run release
  -> bumps version
  -> builds Mac DMG + Win EXE
  -> copies to releases/
  -> writes update-info.json
  -> Google Drive syncs automatically

User opens "Atualizacao" screen
  -> app fetches update-info.json from Drive URL
  -> compares versions
  -> if newer: shows version + notes + "Ir para download" button
  -> user clicks -> browser opens releases/ folder on Drive
  -> user downloads correct installer -> installs manually
```

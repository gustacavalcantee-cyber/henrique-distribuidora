import { ipcMain, shell, app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import * as https from 'https'
import * as http from 'http'

// Set this after sharing releases/update-info.json publicly on Google Drive.
// Steps:
// 1. Run `npm run release` once so the file appears in Google Drive
// 2. Open drive.google.com -> Meu Drive / Programa / releases / update-info.json
// 3. Right-click -> Share -> "Anyone with the link can view" -> copy link
// 4. Extract the file ID (long string after /d/ or id= in the URL)
// 5. Replace REPLACE_WITH_FILE_ID below with that ID
// Example: https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
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

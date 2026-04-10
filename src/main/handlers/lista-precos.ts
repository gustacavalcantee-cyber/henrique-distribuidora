import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import {
  generateListaPrecosHtml,
  generateListaPrecosPrintHtml,
  ListaPrecosData,
} from '../services/lista-precos.service'

export function registerListaPrecosHandlers() {
  // Returns base64 PNG data URL of the price list image
  ipcMain.handle(IPC.LISTA_PRECOS_GET_IMAGE, async (_event, data: ListaPrecosData) => {
    const html = generateListaPrecosHtml(data)
    const win = new BrowserWindow({
      width: 400,
      height: 800,
      show: false,
      frame: false,
      webPreferences: { sandbox: false },
    })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await new Promise(r => setTimeout(r, 200))
      const contentHeight: number = await win.webContents.executeJavaScript(
        'document.body.scrollHeight || 0'
      )
      win.setSize(400, Math.min(Math.max(contentHeight + 4, 200), 4000))
      await new Promise(r => setTimeout(r, 80))
      const image = await win.webContents.capturePage()
      return image.toDataURL()
    } finally {
      win.close()
    }
  })

  // Opens a visible print preview window
  ipcMain.handle(IPC.LISTA_PRECOS_PRINT, async (_event, data: ListaPrecosData) => {
    const html = generateListaPrecosPrintHtml(data)
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Lista de Preços — Imprimir',
      webPreferences: { sandbox: false },
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })
}

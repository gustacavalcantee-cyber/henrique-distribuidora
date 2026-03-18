import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getPrintData, generatePrintHtml } from '../services/print.service'

export function registerPrintHandlers() {
  ipcMain.handle(IPC.PRINT_PEDIDO, async (_event, pedidoId: number) => {
    const data = getPrintData(pedidoId)
    const html = generatePrintHtml(data)

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: { sandbox: false },
    })

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await win.webContents.executeJavaScript('window.print()')

    // Give the print dialog time to appear before potentially closing
    setTimeout(() => win.close(), 2000)
  })
}

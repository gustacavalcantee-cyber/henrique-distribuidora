import { ipcMain, BrowserWindow, shell, clipboard, nativeImage } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getPrintData, generatePrintHtml, generateShareHtml } from '../services/print.service'

export function registerPrintHandlers() {
  ipcMain.handle(IPC.PRINT_PEDIDO, async (_event, pedidoId: number) => {
    const data = await getPrintData(pedidoId)
    const html = generatePrintHtml(data, true) // true = show preview controls

    const win = new BrowserWindow({
      width: 1200,
      height: 750,
      show: true,
      title: `Visualização — OC ${data.numerOc} | ${data.lojaNome}`,
      webPreferences: { sandbox: false },
    })

    win.setMenuBarVisibility(false)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    win.show()
  })

  ipcMain.handle(IPC.SHARE_NOTA, async (_event, pedidoId: number) => {
    const data = await getPrintData(pedidoId)
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtQty = (v: number | null, un: string) => v == null ? '-' : un === 'KG' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v)
    const linhasProdutos = data.linhas
      .filter(l => l.quantidade != null)
      .map(l => `${l.nome} - ${fmtQty(l.quantidade, l.unidade)} ${l.unidade} - R$ ${fmt(l.total!)}`)
      .join('\n')
    const texto = [
      `*${data.nomeFornecedor}*`,
      `OC: ${data.numerOc}`,
      `${data.redeNome} ${data.lojaNome}`,
      `Data: ${data.data}`,
      ``,
      linhasProdutos,
      ``,
      `*TOTAL: R$ ${fmt(data.totalGeral)}*`,
    ].join('\n')
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.GET_NOTA_TEXT, async (_event, pedidoId: number) => {
    const data = await getPrintData(pedidoId)
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtQty = (v: number | null, un: string) => v == null ? '-' : un === 'KG' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v)
    const linhasProdutos = data.linhas
      .filter(l => l.quantidade != null)
      .map(l => `${l.nome} - ${fmtQty(l.quantidade, l.unidade)} ${l.unidade} - R$ ${fmt(l.total!)}`)
      .join('\n')
    return [
      `*${data.nomeFornecedor}*`,
      `OC: ${data.numerOc}`,
      `${data.redeNome} ${data.lojaNome}`,
      `Data: ${data.data}`,
      ``,
      linhasProdutos,
      ``,
      `*TOTAL: R$ ${fmt(data.totalGeral)}*`,
    ].join('\n')
  })

  ipcMain.handle(IPC.GET_NOTA_IMAGE, async (_event, pedidoId: number) => {
    const data = await getPrintData(pedidoId)
    const html = generateShareHtml(data)

    // A5 portrait at 96dpi: 148mm × 190mm ≈ 559 × 719px
    // frame: false removes the title bar so height is pure content area
    const win = new BrowserWindow({
      width: 559,
      height: 719,
      show: false,
      frame: false,
      webPreferences: { sandbox: false },
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise(r => setTimeout(r, 200))
    const image = await win.webContents.capturePage()
    win.close()
    return image.toDataURL()
  })

  ipcMain.handle(IPC.PRINT_HTML, async (_event, html: string, title = 'Relatório') => {
    const escScript = `<script>document.addEventListener('keydown',function(e){if(e.key==='Escape')window.close();});</script>`
    const htmlWithEsc = html.includes('</body>')
      ? html.replace('</body>', `${escScript}</body>`)
      : html + escScript
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      title,
      webPreferences: { sandbox: false },
    })
    win.setMenuBarVisibility(false)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlWithEsc)}`)
    win.show()
  })

  ipcMain.handle(IPC.CLIPBOARD_WRITE_IMAGE, (_event, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
  })

  ipcMain.handle(IPC.OPEN_EXTERNAL, (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC.RENDER_HTML_IMAGE, async (_event, html: string, width = 600) => {
    const win = new BrowserWindow({
      width,
      height: 800,
      show: false,
      frame: false,
      webPreferences: { sandbox: false },
    })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await new Promise(r => setTimeout(r, 300))
      const contentHeight: number = await win.webContents.executeJavaScript('document.body.scrollHeight || 0')
      win.setSize(width, Math.min(contentHeight + 20, 4000))
      await new Promise(r => setTimeout(r, 100))
      const image = await win.webContents.capturePage()
      return image.toDataURL()
    } finally {
      win.close()
    }
  })
}

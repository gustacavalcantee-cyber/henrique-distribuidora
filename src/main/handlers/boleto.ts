import { ipcMain, shell, dialog } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Banco, BoletoDraft, InterConfig } from '../../shared/types'
import {
  listBancos, createBanco, updateBanco, deleteBanco,
  getInterConfig, setInterConfig,
  listBoletos, emitirBoleto, cancelarBoleto, getBoletosPdf, consultarBoleto,
} from '../services/boleto.service'
import { getRawSqlite } from '../db/client-local'

export function registerBoletoHandlers() {
  ipcMain.handle(IPC.BANCOS_LIST, () => listBancos())
  ipcMain.handle(IPC.BANCOS_CREATE, (_e, data: Omit<Banco, 'id'>) => createBanco(data))
  ipcMain.handle(IPC.BANCOS_UPDATE, (_e, data: Partial<Banco> & { id: number }) => updateBanco(data))
  ipcMain.handle(IPC.BANCOS_DELETE, (_e, id: number) => deleteBanco(id))

  ipcMain.handle(IPC.INTER_CONFIG_GET, (_e, banco_id: number) => getInterConfig(banco_id))
  ipcMain.handle(IPC.INTER_CONFIG_SET, (_e, banco_id: number, config: InterConfig) => setInterConfig(banco_id, config))

  ipcMain.handle(IPC.BOLETOS_LIST, (_e, filters?: { loja_id?: number; status?: string; banco_id?: number }) =>
    listBoletos(filters)
  )

  ipcMain.handle(IPC.BOLETOS_EMITIR, (_e, draft: BoletoDraft) => emitirBoleto(draft))

  ipcMain.handle(IPC.BOLETOS_CANCELAR, (_e, boleto_id: number, motivo?: string) =>
    cancelarBoleto(boleto_id, motivo)
  )

  ipcMain.handle(IPC.BOLETOS_PDF, async (_e, boleto_id: number) => {
    const path = await getBoletosPdf(boleto_id)
    shell.openPath(path)
    return path
  })

  ipcMain.handle(IPC.BOLETOS_CONSULTAR, (_e, boleto_id: number) => consultarBoleto(boleto_id))

  // Manually override status locally — for when Inter website reflects a change
  // that the API doesn't yet return (e.g. cancelled via internet banking)
  ipcMain.handle(IPC.BOLETOS_SET_STATUS, (_e, boleto_id: number, status: string) => {
    const allowed = ['emitido', 'pago', 'cancelado', 'vencido']
    if (!allowed.includes(status)) throw new Error(`Status inválido: ${status}`)
    getRawSqlite().prepare('UPDATE boletos SET status=? WHERE id=?').run(status, boleto_id)
  })

  ipcMain.handle(IPC.PICK_FILE, async (_e, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'Todos os arquivos', extensions: ['*'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

import { ipcMain, shell } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Banco, BoletoDraft, InterConfig } from '../../shared/types'
import {
  listBancos, createBanco, updateBanco, deleteBanco,
  getInterConfig, setInterConfig,
  listBoletos, emitirBoleto, cancelarBoleto, getBoletosPdf, consultarBoleto,
} from '../services/boleto.service'

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
}

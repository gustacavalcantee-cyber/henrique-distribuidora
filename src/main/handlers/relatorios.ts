import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getRelatorioQuinzena, getRelatorioFinanceiro } from '../services/relatorios.service'

export function registerRelatoriosHandlers() {
  ipcMain.handle(IPC.RELATORIO_QUINZENA, (_event, rede_id: number, loja_id: number, mes: number, ano: number, quinzena: 1 | 2) => {
    return getRelatorioQuinzena(rede_id, loja_id, mes, ano, quinzena)
  })

  ipcMain.handle(IPC.RELATORIO_FINANCEIRO, (_event, mes: number, ano: number, rede_id?: number) => {
    return getRelatorioFinanceiro(mes, ano, rede_id)
  })
}

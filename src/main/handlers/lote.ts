import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getLoteQuinzena } from '../services/lote.service'

export function registerLoteHandlers() {
  ipcMain.handle(IPC.LOTE_GET_QUINZENA, (_e, mes: number, ano: number, quinzena: 1 | 2) =>
    getLoteQuinzena(mes, ano, quinzena)
  )
}

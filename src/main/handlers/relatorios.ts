import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getRelatorioQuinzena, getRelatorioFinanceiro, getRelatorioCobranca, getNotasMes, getRelatorioPorProduto } from '../services/relatorios.service'

export function registerRelatoriosHandlers() {
  ipcMain.handle(IPC.RELATORIO_QUINZENA, (_event, rede_id: number, loja_id: number, mes: number, ano: number, quinzena: 1 | 2) => {
    return getRelatorioQuinzena(rede_id, loja_id, mes, ano, quinzena)
  })

  ipcMain.handle(IPC.RELATORIO_FINANCEIRO, (_event, mes: number, ano: number, rede_id?: number) => {
    return getRelatorioFinanceiro(mes, ano, rede_id)
  })

  ipcMain.handle(IPC.RELATORIO_COBRANCA, (_event, loja_ids: number[], mes: number, ano: number, periodo: '1' | '2' | 'mes') => {
    return getRelatorioCobranca(loja_ids, mes, ano, periodo)
  })

  ipcMain.handle(IPC.NOTAS_LIST, (_event, mes: number, ano: number, rede_id?: number) => {
    return getNotasMes(mes, ano, rede_id)
  })

  ipcMain.handle(IPC.RELATORIO_POR_PRODUTO, (_event, rede_id: number, produto_ids: number[], mes: number, ano: number, periodo: '1' | '2' | 'mes', agrupar_por: 'loja' | 'franqueado') => {
    return getRelatorioPorProduto(rede_id, produto_ids, mes, ano, periodo, agrupar_por)
  })
}

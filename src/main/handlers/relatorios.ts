import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getRelatorioQuinzena, getRelatorioFinanceiro, getRelatorioCobranca, getNotasMes, getRelatorioPorProduto, getRelatorioPrecoVsCusto } from '../services/relatorios.service'

export function registerRelatoriosHandlers() {
  ipcMain.handle(IPC.RELATORIO_QUINZENA, (_event, rede_id: number, loja_id: number, mes: number, ano: number, quinzena: 1 | 2) =>
    getRelatorioQuinzena(rede_id, loja_id, mes, ano, quinzena)
  )

  ipcMain.handle(IPC.RELATORIO_FINANCEIRO, (_event, mes: number, ano: number, rede_id?: number, franqueado_id?: number) =>
    getRelatorioFinanceiro(mes, ano, rede_id, franqueado_id)
  )

  ipcMain.handle(IPC.RELATORIO_COBRANCA, (_event, loja_ids: number[], mes: number, ano: number, periodo: '1' | '2' | 'mes') =>
    getRelatorioCobranca(loja_ids, mes, ano, periodo)
  )

  ipcMain.handle(IPC.NOTAS_LIST, (_event, mes: number, ano: number, rede_id?: number, franqueado_id?: number) =>
    getNotasMes(mes, ano, rede_id, franqueado_id)
  )

  ipcMain.handle(IPC.RELATORIO_POR_PRODUTO, (_event, rede_id: number, produto_ids: number[], mes: number, ano: number, periodo: '1' | '2' | 'mes', agrupar_por: 'loja' | 'franqueado') =>
    getRelatorioPorProduto(rede_id, produto_ids, mes, ano, periodo, agrupar_por)
  )

  ipcMain.handle(IPC.RELATORIO_PRECO_CUSTO, (_event, produto_id: number, loja_id?: number) =>
    getRelatorioPrecoVsCusto(produto_id, loja_id)
  )
}

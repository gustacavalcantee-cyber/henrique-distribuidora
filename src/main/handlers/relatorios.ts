import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getRelatorioQuinzena, getRelatorioFinanceiro, getRelatorioCobranca, getNotasMes, getRelatorioPorProduto, getRelatorioPrecoVsCusto } from '../services/relatorios.service'

export function registerRelatoriosHandlers() {
  ipcMain.handle(IPC.RELATORIO_QUINZENA, async (_event, rede_id: number, loja_id: number, mes: number, ano: number, quinzena: 1 | 2) => {
    return await getRelatorioQuinzena(rede_id, loja_id, mes, ano, quinzena)
  })

  ipcMain.handle(IPC.RELATORIO_FINANCEIRO, async (_event, mes: number, ano: number, rede_id?: number, franqueado_id?: number) => {
    return await getRelatorioFinanceiro(mes, ano, rede_id, franqueado_id)
  })

  ipcMain.handle(IPC.RELATORIO_COBRANCA, async (_event, loja_ids: number[], mes: number, ano: number, periodo: '1' | '2' | 'mes') => {
    return await getRelatorioCobranca(loja_ids, mes, ano, periodo)
  })

  ipcMain.handle(IPC.NOTAS_LIST, async (_event, mes: number, ano: number, rede_id?: number, franqueado_id?: number) => {
    return await getNotasMes(mes, ano, rede_id, franqueado_id)
  })

  ipcMain.handle(IPC.RELATORIO_POR_PRODUTO, async (_event, rede_id: number, produto_ids: number[], mes: number, ano: number, periodo: '1' | '2' | 'mes', agrupar_por: 'loja' | 'franqueado') => {
    return await getRelatorioPorProduto(rede_id, produto_ids, mes, ano, periodo, agrupar_por)
  })

  ipcMain.handle(IPC.RELATORIO_PRECO_CUSTO, async (_event, produto_id: number, loja_id?: number) => {
    return await getRelatorioPrecoVsCusto(produto_id, loja_id)
  })
}

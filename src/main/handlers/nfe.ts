import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import {
  getNfeConfig, setNfeConfig,
  getLojaFiscal, setLojaFiscal,
  getAllProdutosFiscal, setProdutoFiscal,
  gerarPreviewNfe, salvarNfe, listNfe, deletarNfe, imprimirDanfe,
} from '../services/nfe.service'

export function registerNfeHandlers() {
  ipcMain.handle(IPC.NFE_CONFIG_GET, () => getNfeConfig())
  ipcMain.handle(IPC.NFE_CONFIG_SET, (_e, config) => setNfeConfig(config))

  ipcMain.handle(IPC.NFE_GET_LOJA_FISCAL, (_e, loja_id: number) => getLojaFiscal(loja_id))
  ipcMain.handle(IPC.NFE_SET_LOJA_FISCAL, (_e, loja_id: number, data: Record<string, string>) => setLojaFiscal(loja_id, data))

  ipcMain.handle(IPC.NFE_GET_ALL_PRODUTOS_FISCAL, () => getAllProdutosFiscal())
  ipcMain.handle(IPC.NFE_SET_PRODUTO_FISCAL, (_e, produto_id: number, ncm: string, cst_icms: string, cfop: string, unidade_nfe: string) =>
    setProdutoFiscal(produto_id, ncm, cst_icms, cfop, unidade_nfe)
  )

  ipcMain.handle(IPC.NFE_GERAR_PREVIEW, (_e, loja_id: number, mes: number, ano: number, quinzena: 1 | 2) =>
    gerarPreviewNfe(loja_id, mes, ano, quinzena)
  )
  ipcMain.handle(IPC.NFE_SALVAR, (_e, draft) => salvarNfe(draft))
  ipcMain.handle(IPC.NFE_LIST, () => listNfe())
  ipcMain.handle(IPC.NFE_DELETE, (_e, id: number) => deletarNfe(id))
  ipcMain.handle(IPC.NFE_PRINT_DANFE, (_e, id: number) => imprimirDanfe(id))
}

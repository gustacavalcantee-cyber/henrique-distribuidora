import { ipcMain } from 'electron'
import { registerRedesHandlers } from './redes'
import { registerLojasHandlers } from './lojas'
import { registerProdutosHandlers } from './produtos'
import { registerPrecosHandlers } from './precos'
import { registerCustosHandlers } from './custos'
import { registerConfiguracoesHandlers } from './configuracoes'
import { registerPedidosHandlers } from './pedidos'
import { registerPrintHandlers } from './print'
import { registerDespesasHandlers } from './despesas'
import { registerRelatoriosHandlers } from './relatorios'
import { registerFranqueadosHandlers } from './franqueados'
import { registerEstoqueHandlers } from './estoque'
import { registerAtualizacaoHandlers } from './atualizacao'
import { registerLayoutConfigHandlers } from './layout-config'
import { registerRedeColOrderHandlers } from './rede-col-order'
import { registerPrintOrderHandlers } from './print-order'
import { registerSyncAdminHandlers } from './sync-admin'

export function registerAllHandlers() {
  ipcMain.handle('ping', () => 'pong')

  registerRedesHandlers()
  registerLojasHandlers()
  registerProdutosHandlers()
  registerPrecosHandlers()
  registerCustosHandlers()
  registerConfiguracoesHandlers()
  registerPedidosHandlers()
  registerPrintHandlers()
  registerDespesasHandlers()
  registerRelatoriosHandlers()
  registerFranqueadosHandlers()
  registerEstoqueHandlers()
  registerAtualizacaoHandlers()
  registerLayoutConfigHandlers()
  registerRedeColOrderHandlers()
  registerPrintOrderHandlers()
  registerSyncAdminHandlers()
}

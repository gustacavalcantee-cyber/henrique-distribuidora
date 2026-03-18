import { ipcMain } from 'electron'
import { registerRedesHandlers } from './redes'
import { registerLojasHandlers } from './lojas'
import { registerProdutosHandlers } from './produtos'
import { registerPrecosHandlers } from './precos'
import { registerCustosHandlers } from './custos'
import { registerConfiguracoesHandlers } from './configuracoes'
// import { registerPedidosHandlers } from './pedidos'
// import { registerPrintHandlers } from './print'
// import { registerDespesasHandlers } from './despesas'
// import { registerRelatoriosHandlers } from './relatorios'

export function registerAllHandlers() {
  ipcMain.handle('ping', () => 'pong')
  registerRedesHandlers()
  registerLojasHandlers()
  registerProdutosHandlers()
  registerPrecosHandlers()
  registerCustosHandlers()
  registerConfiguracoesHandlers()
}

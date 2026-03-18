import { ipcMain } from 'electron'
// These will be uncommented as each handler file is implemented:
// import { registerRedesHandlers } from './redes'
// import { registerLojasHandlers } from './lojas'
// import { registerProdutosHandlers } from './produtos'
// import { registerPrecosHandlers } from './precos'
// import { registerCustosHandlers } from './custos'
// import { registerConfiguracoesHandlers } from './configuracoes'
// import { registerPedidosHandlers } from './pedidos'
// import { registerPrintHandlers } from './print'
// import { registerDespesasHandlers } from './despesas'
// import { registerRelatoriosHandlers } from './relatorios'

export function registerAllHandlers() {
  // Ping for IPC smoke test
  ipcMain.handle('ping', () => 'pong')
  // Handler registrations will be uncommented here as implemented
}

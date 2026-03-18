import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import {
  listPedidos,
  getPedidoItens,
  salvarPedido,
  deletePedido,
  checkDuplicate,
  getLancamentosParaData,
} from '../services/pedidos.service'
import type { SalvarPedidoInput } from '../../shared/types'
import type { PedidoFilters } from '../services/pedidos.service'

export function registerPedidosHandlers() {
  ipcMain.handle(IPC.PEDIDOS_LIST, (_event, filters?: PedidoFilters) => {
    return listPedidos(filters)
  })

  ipcMain.handle(IPC.PEDIDOS_BY_DATE_REDE, (_event, rede_id: number, data_pedido: string) => {
    return getLancamentosParaData(rede_id, data_pedido)
  })

  ipcMain.handle(IPC.PEDIDOS_CREATE, (_event, input: SalvarPedidoInput) => {
    return salvarPedido(input)
  })

  ipcMain.handle(IPC.PEDIDOS_UPDATE, (_event, input: SalvarPedidoInput) => {
    return salvarPedido(input)  // salvarPedido handles both create and update
  })

  ipcMain.handle(IPC.PEDIDOS_DELETE, (_event, id: number) => {
    deletePedido(id)
  })

  ipcMain.handle(IPC.PEDIDOS_CHECK_DUPLICATE, (_event, rede_id: number, loja_id: number, data_pedido: string, numero_oc: string) => {
    return checkDuplicate(rede_id, loja_id, data_pedido, numero_oc)
  })
}

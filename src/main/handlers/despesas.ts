import { ipcMain } from 'electron'
import { eq, and, gte, lte, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client'
import { despesas } from '../db/schema'
import { IPC } from '../../shared/ipc-channels'

export function registerDespesasHandlers() {
  ipcMain.handle(IPC.DESPESAS_LIST, (_event, filters?: { data_inicio?: string; data_fim?: string; rede_id?: number }) => {
    const db = getDb()
    const conditions: SQL<unknown>[] = []
    if (filters?.data_inicio) conditions.push(gte(despesas.data, filters.data_inicio))
    if (filters?.data_fim) conditions.push(lte(despesas.data, filters.data_fim))
    if (filters?.rede_id) conditions.push(eq(despesas.rede_id, filters.rede_id))
    return db.select().from(despesas)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(despesas.data)
      .all()
  })

  ipcMain.handle(IPC.DESPESAS_CREATE, (_event, data: { data: string; categoria: string; descricao?: string; rede_id?: number; loja_id?: number; valor: number }) => {
    return getDb().insert(despesas).values(data).returning().all()[0]
  })

  ipcMain.handle(IPC.DESPESAS_UPDATE, (_event, data: { id: number; data?: string; categoria?: string; descricao?: string; valor?: number }) => {
    const { id, ...updates } = data
    return getDb().update(despesas).set(updates).where(eq(despesas.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.DESPESAS_DELETE, (_event, id: number) => {
    getDb().delete(despesas).where(eq(despesas.id, id)).run()
  })
}

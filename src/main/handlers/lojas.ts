import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { lojas } from '../db/schema'
import { IPC } from '../../shared/ipc-channels'

export function registerLojasHandlers() {
  ipcMain.handle(IPC.LOJAS_LIST, (_event, rede_id?: number) => {
    const db = getDb()
    if (rede_id !== undefined) {
      return db.select().from(lojas).where(eq(lojas.rede_id, rede_id)).all()
    }
    return db.select().from(lojas).all()
  })

  ipcMain.handle(IPC.LOJAS_CREATE, (_event, data: { rede_id: number; nome: string; codigo?: string; cnpj?: string }) => {
    return getDb().insert(lojas).values(data).returning().all()[0]
  })

  ipcMain.handle(IPC.LOJAS_UPDATE, (_event, data: { id: number; nome?: string; codigo?: string; cnpj?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(lojas).set(updates).where(eq(lojas.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.LOJAS_DELETE, (_event, id: number) => {
    try {
      getDb().delete(lojas).where(eq(lojas.id, id)).run()
    } catch {
      // FK constraint — deactivate instead
      getDb().update(lojas).set({ ativo: 0 }).where(eq(lojas.id, id)).run()
    }
  })
}

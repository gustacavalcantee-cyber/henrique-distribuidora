import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { lojas } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

export function registerLojasHandlers() {
  ipcMain.handle(IPC.LOJAS_LIST, (_event, rede_id?: number) => {
    const db = getDb()
    if (rede_id !== undefined) return db.select().from(lojas).where(eq(lojas.rede_id, rede_id)).all()
    return db.select().from(lojas).all()
  })

  ipcMain.handle(IPC.LOJAS_CREATE, (_event, data: { rede_id: number; nome: string; codigo?: string; cnpj?: string }) =>
    getDb().insert(lojas).values({ ...data, synced: 0 }).returning().all()[0]
  )

  ipcMain.handle(IPC.LOJAS_UPDATE, (_event, data: { id: number; nome?: string; codigo?: string; cnpj?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(lojas).set({ ...updates, synced: 0 }).where(eq(lojas.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.LOJAS_DELETE, (_event, id: number) => {
    try {
      getDb().delete(lojas).where(eq(lojas.id, id)).run()
    } catch {
      // FK constraint — deactivate instead
      getDb().update(lojas).set({ ativo: 0, synced: 0 }).where(eq(lojas.id, id)).run()
    }
  })
}

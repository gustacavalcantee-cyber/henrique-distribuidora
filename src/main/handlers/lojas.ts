import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { lojas } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerLojasHandlers() {
  ipcMain.handle(IPC.LOJAS_LIST, async (_event, rede_id?: number) => {
    const db = getDb()
    if (rede_id !== undefined) {
      return await db.select().from(lojas).where(eq(lojas.rede_id, rede_id))
    }
    return await db.select().from(lojas)
  })

  ipcMain.handle(IPC.LOJAS_CREATE, async (_event, data: { rede_id: number; nome: string; codigo?: string; cnpj?: string }) => {
    return (await getDb().insert(lojas).values(data).returning())[0]
  })

  ipcMain.handle(IPC.LOJAS_UPDATE, async (_event, data: { id: number; nome?: string; codigo?: string; cnpj?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return (await getDb().update(lojas).set(updates).where(eq(lojas.id, id)).returning())[0]
  })

  ipcMain.handle(IPC.LOJAS_DELETE, async (_event, id: number) => {
    try {
      await getDb().delete(lojas).where(eq(lojas.id, id))
    } catch {
      // FK constraint — deactivate instead
      await getDb().update(lojas).set({ ativo: 0 }).where(eq(lojas.id, id))
    }
  })
}

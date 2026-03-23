import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { redes } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerRedesHandlers() {
  ipcMain.handle(IPC.REDES_LIST, async () => {
    return await getDb().select().from(redes)
  })

  ipcMain.handle(IPC.REDES_CREATE, async (_event, data: { nome: string; cor_tema: string }) => {
    return (await getDb().insert(redes).values(data).returning())[0]
  })

  ipcMain.handle(IPC.REDES_UPDATE, async (_event, data: { id: number; nome?: string; cor_tema?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return (await getDb().update(redes).set(updates).where(eq(redes.id, id)).returning())[0]
  })

  ipcMain.handle(IPC.REDES_DELETE, async (_event, id: number) => {
    await getDb().delete(redes).where(eq(redes.id, id))
  })
}

import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { redes } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

export function registerRedesHandlers() {
  ipcMain.handle(IPC.REDES_LIST, () => getDb().select().from(redes).all())

  ipcMain.handle(IPC.REDES_CREATE, (_event, data: { nome: string; cor_tema: string }) =>
    getDb().insert(redes).values({ ...data, synced: 0 }).returning().all()[0]
  )

  ipcMain.handle(IPC.REDES_UPDATE, (_event, data: { id: number; nome?: string; cor_tema?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(redes).set({ ...updates, synced: 0 }).where(eq(redes.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.REDES_DELETE, (_event, id: number) =>
    getDb().delete(redes).where(eq(redes.id, id)).run()
  )
}

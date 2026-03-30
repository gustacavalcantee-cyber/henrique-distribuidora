import { ipcMain } from 'electron'
import { and, eq, ne } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { lojas } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'
import { triggerSync, getMainWindow } from '../sync/sync.service'

export function registerLojasHandlers() {
  ipcMain.handle(IPC.LOJAS_LIST, (_event, rede_id?: number) => {
    const db = getDb()
    const activeFilter = ne(lojas.ativo, 0)
    if (rede_id !== undefined)
      return db.select().from(lojas).where(and(eq(lojas.rede_id, rede_id), activeFilter)).all()
    return db.select().from(lojas).where(activeFilter).all()
  })

  ipcMain.handle(IPC.LOJAS_CREATE, (_event, data: { rede_id: number; nome: string; codigo?: string; cnpj?: string }) =>
    getDb().insert(lojas).values({ ...data, synced: 0 }).returning().all()[0]
  )

  ipcMain.handle(IPC.LOJAS_UPDATE, (_event, data: { id: number; nome?: string; codigo?: string; cnpj?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return getDb().update(lojas).set({ ...updates, synced: 0 }).where(eq(lojas.id, id)).returning().all()[0]
  })

  ipcMain.handle(IPC.LOJAS_DELETE, (_event, id: number) => {
    // Soft-delete locally (hidden from UI immediately) then push deletion to Supabase.
    // The sync push will hard-delete from Supabase; the pull propagation then removes
    // the row from all other devices. Without triggerSync, deletion only syncs on the
    // next 8-second polling cycle.
    getDb().update(lojas).set({ ativo: 0, synced: 0 }).where(eq(lojas.id, id)).run()
    triggerSync(getMainWindow() ?? undefined)
  })
}

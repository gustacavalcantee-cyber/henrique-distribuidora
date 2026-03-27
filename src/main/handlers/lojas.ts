import { ipcMain } from 'electron'
import { and, eq, ne } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { lojas } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

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
    // Always soft-delete (ativo=0) so the record is synced to Supabase and not
    // resurrected on the next pull. Hard-delete would lose the row locally but
    // keep it in Supabase, causing it to return on every sync cycle.
    getDb().update(lojas).set({ ativo: 0, synced: 0 }).where(eq(lojas.id, id)).run()
  })
}

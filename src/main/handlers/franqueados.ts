import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { franqueados, lojas } from '../db/schema'
import { IPC } from '../../shared/ipc-channels'

export function registerFranqueadosHandlers() {
  ipcMain.handle(IPC.FRANQUEADOS_LIST, () => {
    return getDb().select().from(franqueados).all()
  })

  ipcMain.handle(IPC.FRANQUEADOS_CREATE, (_event, data: { nome: string }) => {
    return getDb().insert(franqueados).values(data).returning().all()[0]
  })

  ipcMain.handle(IPC.FRANQUEADOS_UPDATE, (_event, data: { id: number; nome: string }) => {
    return getDb().update(franqueados).set({ nome: data.nome }).where(eq(franqueados.id, data.id)).returning().all()[0]
  })

  ipcMain.handle(IPC.FRANQUEADOS_DELETE, (_event, id: number) => {
    // Unlink lojas first
    getDb().update(lojas).set({ franqueado_id: null }).where(eq(lojas.franqueado_id, id)).run()
    return getDb().delete(franqueados).where(eq(franqueados.id, id)).run()
  })

  ipcMain.handle(IPC.LOJAS_SET_FRANQUEADO, (_event, loja_id: number, franqueado_id: number | null) => {
    return getDb().update(lojas).set({ franqueado_id }).where(eq(lojas.id, loja_id)).run()
  })
}

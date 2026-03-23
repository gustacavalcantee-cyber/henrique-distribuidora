import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { franqueados, lojas } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerFranqueadosHandlers() {
  ipcMain.handle(IPC.FRANQUEADOS_LIST, async () => {
    return await getDb().select().from(franqueados)
  })

  ipcMain.handle(IPC.FRANQUEADOS_CREATE, async (_event, data: { nome: string }) => {
    return (await getDb().insert(franqueados).values(data).returning())[0]
  })

  ipcMain.handle(IPC.FRANQUEADOS_UPDATE, async (_event, data: { id: number; nome: string }) => {
    return (await getDb().update(franqueados).set({ nome: data.nome }).where(eq(franqueados.id, data.id)).returning())[0]
  })

  ipcMain.handle(IPC.FRANQUEADOS_DELETE, async (_event, id: number) => {
    // Unlink lojas first
    await getDb().update(lojas).set({ franqueado_id: null }).where(eq(lojas.franqueado_id, id))
    await getDb().delete(franqueados).where(eq(franqueados.id, id))
  })

  ipcMain.handle(IPC.LOJAS_SET_FRANQUEADO, async (_event, loja_id: number, franqueado_id: number | null) => {
    await getDb().update(lojas).set({ franqueado_id }).where(eq(lojas.id, loja_id))
  })
}

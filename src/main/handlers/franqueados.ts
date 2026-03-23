import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { franqueados, lojas } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

export function registerFranqueadosHandlers() {
  ipcMain.handle(IPC.FRANQUEADOS_LIST, () => getDb().select().from(franqueados).all())

  ipcMain.handle(IPC.FRANQUEADOS_CREATE, (_event, data: { nome: string }) =>
    getDb().insert(franqueados).values({ ...data, synced: 0 }).returning().all()[0]
  )

  ipcMain.handle(IPC.FRANQUEADOS_UPDATE, (_event, data: { id: number; nome: string }) =>
    getDb().update(franqueados).set({ nome: data.nome, synced: 0 }).where(eq(franqueados.id, data.id)).returning().all()[0]
  )

  ipcMain.handle(IPC.FRANQUEADOS_DELETE, (_event, id: number) => {
    getDb().update(lojas).set({ franqueado_id: null }).where(eq(lojas.franqueado_id, id)).run()
    getDb().delete(franqueados).where(eq(franqueados.id, id)).run()
  })

  ipcMain.handle(IPC.LOJAS_SET_FRANQUEADO, (_event, loja_id: number, franqueado_id: number | null) =>
    getDb().update(lojas).set({ franqueado_id, synced: 0 }).where(eq(lojas.id, loja_id)).run()
  )
}

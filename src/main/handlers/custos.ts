import { ipcMain } from 'electron'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { custos } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

export function registerCustosHandlers() {
  ipcMain.handle(IPC.CUSTOS_LIST, () => getDb().select().from(custos).all())

  ipcMain.handle(IPC.CUSTOS_UPSERT, (_event, data: { produto_id: number; custo_compra: number }) => {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    db.update(custos).set({ vigencia_fim: today, synced: 0 })
      .where(and(eq(custos.produto_id, data.produto_id), isNull(custos.vigencia_fim)))
      .run()
    return db.insert(custos).values({ ...data, vigencia_inicio: today, synced: 0 }).returning().all()[0]
  })
}

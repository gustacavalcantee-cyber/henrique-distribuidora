import { ipcMain } from 'electron'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { custos } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerCustosHandlers() {
  ipcMain.handle(IPC.CUSTOS_LIST, async () => {
    const db = await getDb()
    return db.select().from(custos)
  })

  // Upsert: close existing vigent cost, insert new one
  ipcMain.handle(IPC.CUSTOS_UPSERT, async (_event, data: { produto_id: number; custo_compra: number }) => {
    const db = await getDb()
    const today = new Date().toISOString().slice(0, 10)

    await db.update(custos)
      .set({ vigencia_fim: today })
      .where(and(eq(custos.produto_id, data.produto_id), isNull(custos.vigencia_fim)))

    return (await db.insert(custos).values({ ...data, vigencia_inicio: today }).returning())[0]
  })
}

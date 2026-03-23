import { ipcMain } from 'electron'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { precos } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerPrecosHandlers() {
  ipcMain.handle(IPC.PRECOS_LIST, async () => {
    const db = await getDb()
    return db.select().from(precos)
  })

  // Returns vigent prices for a specific loja (vigencia_fim IS NULL)
  ipcMain.handle(IPC.PRECOS_BY_LOJA, async (_event, loja_id: number) => {
    const db = await getDb()
    return db.select().from(precos)
      .where(and(eq(precos.loja_id, loja_id), isNull(precos.vigencia_fim)))
  })

  // Upsert: close existing vigent price, insert new one
  ipcMain.handle(IPC.PRECOS_UPSERT, async (_event, data: { produto_id: number; loja_id: number; preco_venda: number }) => {
    const db = await getDb()
    const today = new Date().toISOString().slice(0, 10)

    // Close existing vigent price
    await db.update(precos)
      .set({ vigencia_fim: today })
      .where(and(eq(precos.produto_id, data.produto_id), eq(precos.loja_id, data.loja_id), isNull(precos.vigencia_fim)))

    // Insert new price
    return (await db.insert(precos).values({ ...data, vigencia_inicio: today }).returning())[0]
  })
}

import { ipcMain } from 'electron'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { precos } from '../db/schema'
import { IPC } from '../../shared/ipc-channels'

export function registerPrecosHandlers() {
  ipcMain.handle(IPC.PRECOS_LIST, () => {
    return getDb().select().from(precos).all()
  })

  // Returns vigent prices for a specific loja (vigencia_fim IS NULL)
  ipcMain.handle(IPC.PRECOS_BY_LOJA, (_event, loja_id: number) => {
    return getDb().select().from(precos)
      .where(and(eq(precos.loja_id, loja_id), isNull(precos.vigencia_fim)))
      .all()
  })

  // Upsert: close existing vigent price, insert new one
  ipcMain.handle(IPC.PRECOS_UPSERT, (_event, data: { produto_id: number; loja_id: number; preco_venda: number }) => {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)

    // Close existing vigent price
    db.update(precos)
      .set({ vigencia_fim: today })
      .where(and(eq(precos.produto_id, data.produto_id), eq(precos.loja_id, data.loja_id), isNull(precos.vigencia_fim)))
      .run()

    // Insert new price
    return db.insert(precos).values({ ...data, vigencia_inicio: today }).returning().all()[0]
  })
}

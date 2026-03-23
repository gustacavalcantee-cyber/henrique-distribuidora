import { ipcMain } from 'electron'
import { eq, and, isNull } from 'drizzle-orm'
import { getDb } from '../db/client-local'
import { precos } from '../db/schema-local'
import { IPC } from '../../shared/ipc-channels'

export function registerPrecosHandlers() {
  ipcMain.handle(IPC.PRECOS_LIST, () => getDb().select().from(precos).all())

  ipcMain.handle(IPC.PRECOS_BY_LOJA, (_event, loja_id: number) =>
    getDb().select().from(precos).where(and(eq(precos.loja_id, loja_id), isNull(precos.vigencia_fim))).all()
  )

  ipcMain.handle(IPC.PRECOS_UPSERT, (_event, data: { produto_id: number; loja_id: number; preco_venda: number }) => {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    db.update(precos).set({ vigencia_fim: today, synced: 0 })
      .where(and(eq(precos.produto_id, data.produto_id), eq(precos.loja_id, data.loja_id), isNull(precos.vigencia_fim)))
      .run()
    return db.insert(precos).values({ ...data, vigencia_inicio: today, synced: 0 }).returning().all()[0]
  })
}

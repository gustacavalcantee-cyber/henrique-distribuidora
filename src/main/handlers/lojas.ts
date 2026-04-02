import { ipcMain } from 'electron'
import { eq, ne, and } from 'drizzle-orm'
import { getDb, getRawSqlite } from '../db/client-local'
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

  ipcMain.handle(IPC.LOJAS_UPDATE, (_event, data: {
    id: number
    nome?: string
    codigo?: string
    cnpj?: string | null
    ativo?: number
    razao_social?: string | null
    endereco?: string | null
    bairro?: string | null
    cep?: string | null
    municipio?: string | null
    uf?: string | null
    ie?: string | null
    telefone?: string | null
  }) => {
    const { id, ...fields } = data
    const allowed = ['nome', 'codigo', 'cnpj', 'ativo', 'razao_social', 'endereco', 'bairro', 'cep', 'municipio', 'uf', 'ie', 'telefone']
    const toUpdate = Object.entries(fields).filter(([k]) => allowed.includes(k))
    if (toUpdate.length === 0) return getRawSqlite().prepare('SELECT * FROM lojas WHERE id=?').get(id)
    const sets = toUpdate.map(([k]) => `${k} = ?`).join(', ')
    const vals = toUpdate.map(([, v]) => v ?? null)
    getRawSqlite().prepare(`UPDATE lojas SET ${sets}, synced = 0 WHERE id = ?`).run(...vals, id)
    return getRawSqlite().prepare('SELECT * FROM lojas WHERE id=?').get(id)
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

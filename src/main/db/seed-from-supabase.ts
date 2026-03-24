// src/main/db/seed-from-supabase.ts
// One-time seed: pulls all data from Supabase (via REST API) into local SQLite on first run.
// Uses @supabase/supabase-js which connects via HTTPS (port 443) — works on any network.
import { createClient } from '@supabase/supabase-js'
import { getDb, getRawSqlite, isSeeded, markSeeded } from './client-local'

function getSupabase() {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_ANON_KEY']
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not set')
  return createClient(url, key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(supabase: any, table: string) {
  // Supabase REST API returns max 1000 rows by default; paginate for safety
  const PAGE = 1000
  let offset = 0
  const all: Record<string, unknown>[] = []
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(offset, offset + PAGE - 1)
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

export async function seedFromSupabase(): Promise<void> {
  if (isSeeded()) return // already seeded — skip

  console.log('[seed] Starting seed from Supabase...')
  const supabase = getSupabase()
  const sqlite = getRawSqlite()
  const db = getDb()

  // Fetch all tables in FK-safe order
  const [redes, franqueados, lojas, produtos, configuracoes, custos, precos, pedidos, itensPedido, despesas, layoutConfigs] =
    await Promise.all([
      fetchAll(supabase, 'redes'),
      fetchAll(supabase, 'franqueados'),
      fetchAll(supabase, 'lojas'),
      fetchAll(supabase, 'produtos'),
      fetchAll(supabase, 'configuracoes'),
      fetchAll(supabase, 'custos'),
      fetchAll(supabase, 'precos'),
      fetchAll(supabase, 'pedidos'),
      fetchAll(supabase, 'itens_pedido'),
      fetchAll(supabase, 'despesas'),
      fetchAll(supabase, 'layout_config'),
    ])

  console.log(`[seed] Fetched: redes=${redes.length}, franqueados=${franqueados.length}, lojas=${lojas.length}, produtos=${produtos.length}, pedidos=${pedidos.length}, itens=${itensPedido.length}`)

  // Insert everything in a single transaction for speed and atomicity
  const insertAll = sqlite.transaction(() => {
    // Helper: bulk insert into any table preserving Supabase IDs
    function bulkInsert(table: string, rows: Record<string, unknown>[], extraCols: Record<string, unknown> = {}) {
      if (rows.length === 0) return
      // Build INSERT OR IGNORE so re-runs are safe
      const sample = { ...rows[0], ...extraCols }
      const cols = Object.keys(sample)
      const placeholders = cols.map(() => '?').join(', ')
      const stmt = sqlite.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
      for (const row of rows) {
        const merged = { ...row, ...extraCols }
        stmt.run(cols.map(c => merged[c] ?? null))
      }
    }

    bulkInsert('redes', redes, { synced: 1 })
    bulkInsert('franqueados', franqueados, { synced: 1 })
    bulkInsert('lojas', lojas, { synced: 1 })
    bulkInsert('produtos', produtos, { synced: 1 })
    bulkInsert('configuracoes', configuracoes)
    // custos: vigencia_fim might be null — already in the row
    bulkInsert('custos', custos, { synced: 1 })
    bulkInsert('precos', precos, { synced: 1 })
    // pedidos: store Supabase id also as remote_id for future sync reference
    bulkInsert('pedidos', pedidos.map(p => ({ ...p, remote_id: p['id'] })), { synced: 1 })
    bulkInsert('itens_pedido', itensPedido, { synced: 1 })
    bulkInsert('despesas', despesas, { synced: 1 })
    bulkInsert('layout_config', layoutConfigs, { synced: 1 })
  })

  insertAll()
  markSeeded()
  console.log('[seed] Seed complete.')
  void db // keep reference alive
}

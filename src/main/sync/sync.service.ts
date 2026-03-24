// src/main/sync/sync.service.ts
// Bidirectional sync between local SQLite and Supabase (via HTTPS REST API)
//
// Flow:
//   startup  → push any synced=0 records → pull fresh from Supabase → start Realtime watcher
//   on write → tryPush() called in background (fire-and-forget)
//   realtime → remote change detected → pull fresh → notify renderer to reload

import { createClient } from '@supabase/supabase-js'
import type { BrowserWindow } from 'electron'
import { getRawSqlite } from '../db/client-local'
import { IPC } from '../../shared/ipc-channels'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

function getSupabase() {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_ANON_KEY']
  if (!url || !key) return null
  return createClient(url, key)
}

// --------------------------------------------------------------------------
// PUSH — send local unsynced records to Supabase
// --------------------------------------------------------------------------

async function pushTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  localRows: AnyRow[],
  opts: { upsertOn?: string; skipCols?: string[] } = {}
): Promise<void> {
  if (localRows.length === 0) return

  const { skipCols = ['synced', 'device_id', 'updated_at', 'remote_id', 'conflict_state'] } = opts

  const cleaned = localRows.map(r => {
    const obj: AnyRow = {}
    for (const [k, v] of Object.entries(r)) {
      if (!skipCols.includes(k)) obj[k] = v
    }
    return obj
  })

  const { error } = await supabase
    .from(table)
    .upsert(cleaned, { onConflict: opts.upsertOn ?? 'id', ignoreDuplicates: false })

  if (error) {
    console.warn(`[sync] push ${table} error:`, error.message)
  }
}

async function pushPendingPedidos(supabase: any): Promise<void> {
  const sqlite = getRawSqlite()

  // Get pedidos with synced=0
  const pending = sqlite.prepare('SELECT * FROM pedidos WHERE synced = 0').all() as AnyRow[]
  if (pending.length === 0) return

  for (const pedido of pending) {
    // Build payload (no local-only columns)
    // remote_id = Supabase ID for locally-created pedidos that were already pushed
    // For seeded pedidos remote_id is null, but local id === Supabase id
    const supabaseIdForPayload: number = pedido['remote_id'] ?? pedido['id']

    const payload: AnyRow = {
      id: supabaseIdForPayload,
      rede_id: pedido['rede_id'],
      loja_id: pedido['loja_id'],
      data_pedido: pedido['data_pedido'],
      numero_oc: pedido['numero_oc'],
      observacoes: pedido['observacoes'],
      criado_em: pedido['criado_em'],
      status_pagamento: pedido['status_pagamento'],
    }

    const { data: result, error } = await supabase
      .from('pedidos')
      .upsert(payload, { onConflict: 'id' })
      .select('id')

    if (error) {
      console.warn(`[sync] push pedido ${pedido['id']} error:`, error.message)
      continue
    }

    const supabaseId: number = result?.[0]?.id ?? pedido['remote_id']

    // Push itens for this pedido (delete existing in Supabase then re-insert)
    if (supabaseId) {
      await supabase.from('itens_pedido').delete().eq('pedido_id', supabaseId)
      const itens = sqlite.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedido['id']) as AnyRow[]
      if (itens.length > 0) {
        const itensCleaned = itens.map(i => ({
          pedido_id: supabaseId,
          produto_id: i['produto_id'],
          quantidade: i['quantidade'],
          preco_unit: i['preco_unit'],
          custo_unit: i['custo_unit'],
        }))
        const { error: itensError } = await supabase.from('itens_pedido').insert(itensCleaned)
        if (itensError) console.warn(`[sync] push itens for pedido ${pedido['id']}:`, itensError.message)
      }
    }

    // Mark as synced locally
    sqlite.prepare('UPDATE pedidos SET synced = 1, remote_id = ? WHERE id = ?').run(supabaseId, pedido['id'])
    // Mark itens as synced
    sqlite.prepare('UPDATE itens_pedido SET synced = 1 WHERE pedido_id = ?').run(pedido['id'])
  }
}

async function pushPendingOthers(supabase: any): Promise<void> {
  const sqlite = getRawSqlite()

  const tables = ['redes', 'franqueados', 'lojas', 'produtos', 'precos', 'custos', 'despesas']

  for (const table of tables) {
    const pending = sqlite.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all() as AnyRow[]
    if (pending.length === 0) continue
    await pushTable(supabase, table, pending)
    sqlite.prepare(`UPDATE ${table} SET synced = 1 WHERE synced = 0`).run()
  }
}

// --------------------------------------------------------------------------
// PULL — fetch Supabase data and upsert into local SQLite
// --------------------------------------------------------------------------

async function fetchAllSupabase(supabase: any, table: string): Promise<AnyRow[]> {
  const PAGE = 1000
  let offset = 0
  const all: AnyRow[] = []
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(offset, offset + PAGE - 1)
    if (error) { console.warn(`[sync] fetch ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

function upsertLocal(
  sqlite: ReturnType<typeof getRawSqlite>,
  table: string,
  rows: AnyRow[],
  idCol: string,
  skipIfSyncedZero = true
): void {
  if (rows.length === 0) return
  const sample = rows[0]
  const cols = Object.keys(sample)

  for (const row of rows) {
    if (skipIfSyncedZero) {
      // Don't overwrite offline-edited records
      const existing = sqlite.prepare(`SELECT synced FROM ${table} WHERE ${idCol} = ?`).get(row[idCol]) as { synced: number } | undefined
      if (existing?.synced === 0) continue
    }

    // Use REPLACE which deletes+inserts — safe for all tables except pedidos (CASCADE)
    if (table === 'pedidos') {
      // For pedidos, use UPDATE or INSERT without REPLACE to avoid cascading
      const exists = sqlite.prepare('SELECT id FROM pedidos WHERE id = ?').get(row[idCol])
      if (exists) {
        const setCols = cols.filter(c => c !== 'id').map(c => `${c} = ?`).join(', ')
        const vals = cols.filter(c => c !== 'id').map(c => row[c] ?? null)
        vals.push(row[idCol])
        sqlite.prepare(`UPDATE pedidos SET ${setCols} WHERE id = ?`).run(...vals)
      } else {
        const placeholders = cols.map(() => '?').join(', ')
        sqlite.prepare(`INSERT OR IGNORE INTO pedidos (${cols.join(', ')}) VALUES (${placeholders})`).run(cols.map(c => row[c] ?? null))
      }
    } else {
      const placeholders = cols.map(() => '?').join(', ')
      const vals = cols.map(c => row[c] ?? null)
      sqlite.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals)
    }
  }
}

async function pullFromSupabase(supabase: any): Promise<void> {
  const sqlite = getRawSqlite()

  console.log('[sync] Pulling from Supabase...')

  const [redes, franqueados, lojas, produtos, custos, precos, pedidosRemote, itensPedido, despesas, configuracoes] =
    await Promise.all([
      fetchAllSupabase(supabase, 'redes'),
      fetchAllSupabase(supabase, 'franqueados'),
      fetchAllSupabase(supabase, 'lojas'),
      fetchAllSupabase(supabase, 'produtos'),
      fetchAllSupabase(supabase, 'custos'),
      fetchAllSupabase(supabase, 'precos'),
      fetchAllSupabase(supabase, 'pedidos'),
      fetchAllSupabase(supabase, 'itens_pedido'),
      fetchAllSupabase(supabase, 'despesas'),
      fetchAllSupabase(supabase, 'configuracoes'),
    ])

  sqlite.transaction(() => {
    upsertLocal(sqlite, 'redes', redes, 'id')
    upsertLocal(sqlite, 'franqueados', franqueados, 'id')
    upsertLocal(sqlite, 'lojas', lojas, 'id')
    upsertLocal(sqlite, 'produtos', produtos, 'id')
    upsertLocal(sqlite, 'custos', custos, 'id')
    upsertLocal(sqlite, 'precos', precos, 'id')
    upsertLocal(sqlite, 'pedidos', pedidosRemote, 'id')

    // For itens_pedido: delete and re-insert for every synced pedido to avoid
    // stale/duplicate rows caused by local IDs differing from Supabase IDs
    for (const remotePedido of pedidosRemote) {
      const local = sqlite.prepare('SELECT synced FROM pedidos WHERE id = ?').get(remotePedido['id']) as { synced: number } | undefined
      if (!local || local.synced === 0) continue
      sqlite.prepare('DELETE FROM itens_pedido WHERE pedido_id = ?').run(remotePedido['id'])
    }
    for (const item of itensPedido) {
      const parent = sqlite.prepare('SELECT synced FROM pedidos WHERE id = ?').get(item['pedido_id']) as { synced: number } | undefined
      if (!parent || parent.synced === 0) continue
      const cols = Object.keys(item)
      sqlite.prepare(`INSERT INTO itens_pedido (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(cols.map(c => item[c] ?? null))
    }

    upsertLocal(sqlite, 'despesas', despesas, 'id')
    upsertLocal(sqlite, 'configuracoes', configuracoes, 'chave', false)
  })()

  console.log('[sync] Pull complete.')
}

// --------------------------------------------------------------------------
// PUBLIC API
// --------------------------------------------------------------------------

/** Called on app startup — push pending, pull fresh, start Realtime */
export async function startSync(win: BrowserWindow): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) {
    console.warn('[sync] Supabase env vars not set — sync disabled')
    return
  }

  try {
    await pushPendingPedidos(supabase)
    await pushPendingOthers(supabase)
    await pullFromSupabase(supabase)
    win.webContents.send(IPC.DB_SYNCED)
  } catch (err: unknown) {
    console.warn('[sync] Startup sync failed:', (err as Error).message)
  }

  // Realtime: when another device changes Supabase, pull and auto-reload
  // (only fires when another device actually changes data — not on a timer)
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, async () => {
      try {
        await pushPendingPedidos(supabase)
        await pushPendingOthers(supabase)
        await pullFromSupabase(supabase)
        if (!win.isDestroyed()) {
          // Debounce: multiple rapid events → only one reload
          if (reloadTimer) clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => {
            if (!win.isDestroyed()) win.webContents.send(IPC.DB_RELOAD)
          }, 2000)
        }
      } catch (err: unknown) {
        console.warn('[sync] Realtime sync failed:', (err as Error).message)
      }
    })
    .subscribe()

  // Polling fallback every 30s — silently updates SQLite and shows banner
  setInterval(async () => {
    if (win.isDestroyed()) return
    try {
      const sqlite = getRawSqlite()
      const before = (sqlite.prepare('SELECT COUNT(*) as c FROM pedidos').get() as { c: number }).c
      await pushPendingPedidos(supabase)
      await pushPendingOthers(supabase)
      await pullFromSupabase(supabase)
      const after = (sqlite.prepare('SELECT COUNT(*) as c FROM pedidos').get() as { c: number }).c
      // Only show banner if number of pedidos changed (new/deleted records)
      if (!win.isDestroyed() && after !== before) win.webContents.send(IPC.DB_SYNCED)
    } catch (err: unknown) {
      console.warn('[sync] Poll sync failed:', (err as Error).message)
    }
  }, 30_000)
}

/** Delete a pedido (and its itens) from Supabase — call before local delete */
export async function pushDeletePedido(supabaseId: number): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.from('itens_pedido').delete().eq('pedido_id', supabaseId)
  await supabase.from('pedidos').delete().eq('id', supabaseId)
}

/** Call after any write — fire and forget push to Supabase */
export function triggerSync(_win?: BrowserWindow): void {
  const supabase = getSupabase()
  if (!supabase) return
  Promise.all([pushPendingPedidos(supabase), pushPendingOthers(supabase)])
    .catch(err => console.warn('[sync] triggerSync error:', err.message))
}

// Keep a reference accessible from handlers
let _mainWindow: BrowserWindow | null = null
export function setSyncWindow(win: BrowserWindow) { _mainWindow = win }
export function getMainWindow() { return _mainWindow }

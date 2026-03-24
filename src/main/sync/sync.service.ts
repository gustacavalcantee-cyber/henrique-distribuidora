// src/main/sync/sync.service.ts
// Bidirectional sync between local SQLite and Supabase (via HTTPS REST API)
//
// Flow:
//   startup  → push any synced=0 records → pull fresh from Supabase → start Realtime watcher
//   on write → tryPush() called in background (fire-and-forget)
//   realtime → remote change detected → pull fresh → notify renderer to reload

import { createClient } from '@supabase/supabase-js'
import type { BrowserWindow } from 'electron'
import { getRawSqlite, getDeviceId } from '../db/client-local'
import { IPC } from '../../shared/ipc-channels'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

// Single shared Supabase client — all functions reuse the same WebSocket connection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _broadcastChannel: any = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabase(): any | null {
  if (_supabase) return _supabase
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_ANON_KEY']
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
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

  // configuracoes has no synced column — always push all rows (tiny table, key-value config)
  const configs = sqlite.prepare('SELECT * FROM configuracoes').all() as AnyRow[]
  if (configs.length > 0) {
    const { error } = await supabase
      .from('configuracoes')
      .upsert(configs, { onConflict: 'chave', ignoreDuplicates: false })
    if (error) console.warn('[sync] push configuracoes error:', error.message)
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

// Lock: prevents concurrent syncs that cause conflicts
let _isSyncing = false
// Pending flag: a triggerSync (local write) arrived while _isSyncing — retry when done
let _pendingSync = false
// Pending flag: a broadcast (remote change) arrived while _isSyncing — pull+notify when done
let _pendingBroadcast = false

function dataSignature(sqlite: ReturnType<typeof getRawSqlite>): string {
  const p = (sqlite.prepare('SELECT COUNT(*) as c FROM pedidos').get() as { c: number }).c
  const i = (sqlite.prepare('SELECT COALESCE(MAX(id),0) as m FROM itens_pedido').get() as { m: number }).m
  return `${p}-${i}`
}

// alwaysNotify=true  → broadcast path (another device changed data, always show orange)
// alwaysNotify=false → polling path (only show orange if local data actually changed)
async function runSync(supabase: any, win: BrowserWindow, alwaysNotify: boolean): Promise<void> {
  if (_isSyncing) {
    // Don't drop remote broadcasts — queue them so we process after current sync
    if (alwaysNotify) _pendingBroadcast = true
    return
  }
  _isSyncing = true
  try {
    const sqlite = getRawSqlite()
    const before = alwaysNotify ? '' : dataSignature(sqlite)
    await pushPendingPedidos(supabase)
    await pushPendingOthers(supabase)
    await pullFromSupabase(supabase)
    const changed = alwaysNotify || dataSignature(sqlite) !== before
    if (!win.isDestroyed() && changed) win.webContents.send(IPC.DB_SYNCED)
    // A broadcast arrived while we were syncing — pull once more and notify
    if (_pendingBroadcast && !win.isDestroyed()) {
      _pendingBroadcast = false
      await pullFromSupabase(supabase)
      win.webContents.send(IPC.DB_SYNCED)
    }
  } catch (err: unknown) {
    console.warn('[sync] Sync failed:', (err as Error).message)
  } finally {
    _isSyncing = false
  }
}

/** Called on app startup — push pending, pull fresh, start Broadcast + polling */
export async function startSync(win: BrowserWindow): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) {
    console.warn('[sync] Supabase env vars not set — sync disabled')
    return
  }

  // Initial sync on startup — silent (no orange icon on load)
  _isSyncing = true
  try {
    await pushPendingPedidos(supabase)
    await pushPendingOthers(supabase)
    await pullFromSupabase(supabase)
  } catch (err: unknown) {
    console.warn('[sync] Startup sync failed:', (err as Error).message)
  } finally {
    _isSyncing = false
  }

  const deviceId = getDeviceId()

  // ── Broadcast: instant notification when another device saves ──
  function subscribeBroadcast() {
    _broadcastChannel = supabase
      .channel('sync-broadcast')
      .on('broadcast', { event: 'updated' }, async (msg: { payload?: { from?: string } }) => {
        if (msg.payload?.from === deviceId) return // ignore own broadcasts
        console.log('[sync] broadcast received — pulling from remote')
        await runSync(supabase, win, true) // always show orange — remote device changed
      })
      .subscribe((status: string) => {
        console.log('[sync] broadcast channel status:', status)
        // If channel closed unexpectedly, reconnect after 3s
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[sync] broadcast channel lost — reconnecting in 3s...')
          setTimeout(() => {
            if (!win.isDestroyed()) subscribeBroadcast()
          }, 3_000)
        }
      })
  }

  subscribeBroadcast()

  // ── Polling every 8s — only notifies if data actually changed ──
  // Fast fallback in case broadcast channel misses an event
  setInterval(() => {
    if (!win.isDestroyed()) runSync(supabase, win, false)
  }, 8_000)
}

/** Delete a pedido (and its itens) from Supabase — call before local delete */
export async function pushDeletePedido(supabaseId: number): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.from('itens_pedido').delete().eq('pedido_id', supabaseId)
  await supabase.from('pedidos').delete().eq('id', supabaseId)
}

/** Call after any write — push, broadcast, then pull locally (syncs Supabase-assigned IDs silently).
 *  If a sync is already running, marks _pendingSync so it retries after the current one finishes,
 *  ensuring every write eventually reaches Supabase even during rapid saves/deletes. */
export function triggerSync(_win?: BrowserWindow): void {
  const supabase = getSupabase()
  if (!supabase) return
  if (_isSyncing) {
    _pendingSync = true // retry when current sync finishes
    return
  }
  ;(async () => {
    _isSyncing = true
    try {
      do {
        _pendingSync = false
        await pushPendingPedidos(supabase)
        await pushPendingOthers(supabase)
        // Broadcast to other devices
        _broadcastChannel?.send({
          type: 'broadcast',
          event: 'updated',
          payload: { from: getDeviceId() },
        })
        // Pull locally so our signature stays consistent — no notification sent
        await pullFromSupabase(supabase)
      } while (_pendingSync) // another write arrived mid-sync — loop once more
    } catch (err: unknown) {
      console.warn('[sync] triggerSync error:', (err as Error).message)
    } finally {
      _isSyncing = false
    }
  })()
}

// Keep a reference accessible from handlers
let _mainWindow: BrowserWindow | null = null
export function setSyncWindow(win: BrowserWindow) { _mainWindow = win }
export function getMainWindow() { return _mainWindow }

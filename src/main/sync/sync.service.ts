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

    // Fallback to pedido['id'] if upsert returned no data (e.g. no-op upsert on unchanged row)
    const supabaseId: number = result?.[0]?.id ?? pedido['remote_id'] ?? pedido['id']

    // Push itens for this pedido: only replace Supabase items if local has items.
    // If local has 0 items, keep Supabase items as-is — prevents wiping correct data
    // from another device when e.g. a status-change push is made before items are loaded.
    if (supabaseId) {
      const itens = sqlite.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedido['id']) as AnyRow[]
      if (itens.length > 0) {
        await supabase.from('itens_pedido').delete().eq('pedido_id', supabaseId)
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

  const tables = ['redes', 'franqueados', 'precos', 'custos', 'despesas']

  for (const table of tables) {
    const pending = sqlite.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all() as AnyRow[]
    if (pending.length === 0) continue
    await pushTable(supabase, table, pending)
    sqlite.prepare(`UPDATE ${table} SET synced = 1 WHERE synced = 0`).run()
  }

  // Produtos: skip local-only NF-e columns that don't exist in Supabase schema
  const prodNfeSkipCols = ['synced', 'device_id', 'updated_at', 'remote_id', 'conflict_state', 'ncm', 'cst_icms', 'cfop', 'unidade_nfe']
  const pendingProdutos = sqlite.prepare('SELECT * FROM produtos WHERE synced = 0').all() as AnyRow[]
  if (pendingProdutos.length > 0) {
    await pushTable(supabase, 'produtos', pendingProdutos, { skipCols: prodNfeSkipCols })
    sqlite.prepare('UPDATE produtos SET synced = 1 WHERE synced = 0').run()
  }

  // Lojas: upsert to Supabase with their current ativo state.
  // Deleted lojas (ativo=0) are SOFT-DELETED in Supabase via upsert — avoids FK constraint
  // errors that occur when pedidos reference the loja. The pull then propagates the soft-delete
  // to local SQLite (hard-delete) on every device including this one.
  // Fiscal columns (razao_social, endereco, etc.) are local-only for now — skip them so
  // Supabase doesn't reject the upsert with "column not found".
  const lojaFiscalSkipCols = ['synced', 'device_id', 'updated_at', 'razao_social', 'endereco', 'bairro', 'cep', 'municipio', 'uf', 'ie', 'telefone']
  const pendingLojas = sqlite.prepare('SELECT * FROM lojas WHERE synced = 0').all() as AnyRow[]
  for (const loja of pendingLojas) {
    await pushTable(supabase, 'lojas', [loja], { skipCols: lojaFiscalSkipCols }) // upsert with ativo=0 or ativo=1
    if (loja['ativo'] === 0) {
      // Soft-delete reached Supabase — hard-delete locally now; pull will confirm on next cycle
      sqlite.prepare('DELETE FROM lojas WHERE id = ?').run(loja['id'])
    } else {
      sqlite.prepare('UPDATE lojas SET synced = 1 WHERE id = ?').run(loja['id'])
    }
  }

  // Push configuracoes where synced=0 (same pattern as other tables)
  const pendingConfigs = sqlite.prepare('SELECT * FROM configuracoes WHERE synced = 0').all() as AnyRow[]
  if (pendingConfigs.length > 0) {
    await pushTable(supabase, 'configuracoes', pendingConfigs, {
      upsertOn: 'chave',
      skipCols: ['synced', 'updated_at'],
    })
    sqlite.prepare('UPDATE configuracoes SET synced = 1 WHERE synced = 0').run()
  }

  // Push layout_config where synced=0
  const pendingLayouts = sqlite.prepare('SELECT * FROM layout_config WHERE synced = 0').all() as AnyRow[]
  if (pendingLayouts.length > 0) {
    await pushTable(supabase, 'layout_config', pendingLayouts, {
      upsertOn: 'rede_id,loja_id',
      skipCols: ['synced', 'updated_at'],
    })
    sqlite.prepare('UPDATE layout_config SET synced = 1 WHERE synced = 0').run()
  }

  // Push rede_col_order where synced=0 (controls column order in Lançamentos grid)
  const pendingColOrder = sqlite.prepare('SELECT * FROM rede_col_order WHERE synced = 0').all() as AnyRow[]
  if (pendingColOrder.length > 0) {
    await pushTable(supabase, 'rede_col_order', pendingColOrder, {
      upsertOn: 'rede_id',
      skipCols: ['synced', 'updated_at'],
    })
    sqlite.prepare('UPDATE rede_col_order SET synced = 1 WHERE synced = 0').run()
  }

  // Push print_order — always push all records (no synced column, small table)
  const allPrintOrder = sqlite.prepare('SELECT * FROM print_order').all() as AnyRow[]
  if (allPrintOrder.length > 0) {
    await pushTable(supabase, 'print_order', allPrintOrder, {
      upsertOn: 'rede_id,loja_id',
      skipCols: ['updated_at'],
    })
  }

  // Push estoque_entradas where synced=0
  const pendingEntradas = sqlite.prepare('SELECT * FROM estoque_entradas WHERE synced = 0').all() as AnyRow[]
  if (pendingEntradas.length > 0) {
    await pushTable(supabase, 'estoque_entradas', pendingEntradas, {
      upsertOn: 'produto_id,data',
    })
    sqlite.prepare('UPDATE estoque_entradas SET synced = 1 WHERE synced = 0').run()
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

  // Hoist bulk lookups and prepared statements out of the per-row loop.
  // Previously this function ran:
  //   - 1 SELECT synced per row (precheck)
  //   - 1 sqlite.prepare() per row for the upsert (prepares are expensive)
  // With N ~500+ rows per table and 14 tables synced on every 8s poll, this
  // blocked the main process for seconds. Now we gather all 'synced=0' ids
  // up-front with ONE query, then reuse ONE prepared statement for the whole
  // table.
  const unsyncedIds = skipIfSyncedZero
    ? new Set(
        (sqlite.prepare(`SELECT ${idCol} as id FROM ${table} WHERE synced = 0`).all() as { id: unknown }[])
          .map(r => r.id)
      )
    : null

  if (table === 'pedidos') {
    // Preserve the DELETE-free semantics: use UPDATE if row exists, INSERT OR IGNORE otherwise.
    const existingIds = new Set(
      (sqlite.prepare('SELECT id FROM pedidos').all() as { id: number }[]).map(r => r.id)
    )
    const nonIdCols = cols.filter(c => c !== 'id')
    const setCols = nonIdCols.map(c => `${c} = ?`).join(', ')
    const updateStmt = sqlite.prepare(`UPDATE pedidos SET ${setCols} WHERE id = ?`)
    const placeholders = cols.map(() => '?').join(', ')
    const insertStmt = sqlite.prepare(`INSERT OR IGNORE INTO pedidos (${cols.join(', ')}) VALUES (${placeholders})`)

    for (const row of rows) {
      if (unsyncedIds?.has(row[idCol])) continue
      if (existingIds.has(row[idCol])) {
        const vals = nonIdCols.map(c => row[c] ?? null)
        vals.push(row[idCol])
        updateStmt.run(...vals)
      } else {
        insertStmt.run(cols.map(c => row[c] ?? null))
      }
    }
    return
  }

  // Use INSERT ... ON CONFLICT DO UPDATE SET instead of INSERT OR REPLACE.
  // INSERT OR REPLACE does DELETE+INSERT which would NULL any column not sent
  // (e.g. local fiscal columns on lojas).
  const placeholders = cols.map(() => '?').join(', ')
  const updateCols = cols.filter(c => c !== idCol)
  const stmt = updateCols.length > 0
    ? sqlite.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(${idCol}) DO UPDATE SET ${updateCols.map(c => `${c} = excluded.${c}`).join(', ')}`
      )
    : sqlite.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)

  for (const row of rows) {
    if (unsyncedIds?.has(row[idCol])) continue
    stmt.run(...cols.map(c => row[c] ?? null))
  }
}

async function pullFromSupabase(supabase: any): Promise<number> {
  const sqlite = getRawSqlite()
  // Counter for auto-heal: pedidos detected as "local has items, Supabase has zero"
  // are silently re-flagged for push. Returning the count lets the caller trigger
  // an immediate push instead of waiting for the next 8s polling cycle.
  let autoHealCount = 0

  console.log('[sync] Pulling from Supabase...')

  const [redes, franqueados, lojas, produtos, custos, precos, pedidosRemote, itensPedido, despesas, configuracoes, layoutConfigs, estoqueEntradas, redeColOrders, printOrders] =
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
      fetchAllSupabase(supabase, 'layout_config'),
      fetchAllSupabase(supabase, 'estoque_entradas'),
      fetchAllSupabase(supabase, 'rede_col_order'),
      fetchAllSupabase(supabase, 'print_order'),
    ])

  // Disable FK constraints during pull: INSERT OR REPLACE does DELETE+INSERT which
  // would fail with "FOREIGN KEY constraint failed" because parent rows (lojas, redes)
  // have NO ACTION children (pedidos, precos). Supabase data is already consistent.
  sqlite.pragma('foreign_keys = OFF')
  try {
  sqlite.transaction(() => {
    upsertLocal(sqlite, 'redes', redes, 'id')
    upsertLocal(sqlite, 'franqueados', franqueados, 'id')
    // Lojas: active → upsert; ativo=0 (soft-deleted in Supabase) → hard-delete locally.
    // This propagates soft-deletes to all devices without FK constraint issues.
    const activeLojas = lojas.filter((l: AnyRow) => l['ativo'] !== 0)
    const inactiveLojas = lojas.filter((l: AnyRow) => l['ativo'] === 0)
    upsertLocal(sqlite, 'lojas', activeLojas, 'id')
    for (const loja of inactiveLojas) {
      sqlite.prepare('DELETE FROM lojas WHERE id = ?').run(loja['id'])
    }
    // Propagate: delete local synced=1 lojas completely absent from Supabase
    // Guard: only run if Supabase returned data — prevents wiping lojas on network error
    if (lojas.length > 0) {
      const remoteAllLojaIds = new Set(lojas.map((l: AnyRow) => l['id']))
      const localSyncedLojas = sqlite.prepare('SELECT id FROM lojas WHERE synced = 1').all() as { id: number }[]
      for (const { id } of localSyncedLojas) {
        if (!remoteAllLojaIds.has(id)) {
          sqlite.prepare('DELETE FROM lojas WHERE id = ?').run(id)
        }
      }
    }

    upsertLocal(sqlite, 'produtos', produtos, 'id')
    upsertLocal(sqlite, 'custos', custos, 'id')
    upsertLocal(sqlite, 'precos', precos, 'id')
    upsertLocal(sqlite, 'pedidos', pedidosRemote, 'id')

    // Propagate remote deletions: delete local synced=1 pedidos absent from Supabase
    if (pedidosRemote.length > 0) {
      const remoteIds = new Set(pedidosRemote.map((p: AnyRow) => p['id']))
      const localSynced = sqlite.prepare('SELECT id FROM pedidos WHERE synced = 1').all() as { id: number }[]
      for (const { id } of localSynced) {
        if (!remoteIds.has(id)) {
          sqlite.prepare('DELETE FROM itens_pedido WHERE pedido_id = ?').run(id)
          sqlite.prepare('DELETE FROM pedidos WHERE id = ?').run(id)
        }
      }
    }

    // For itens_pedido: per-pedido replace — only swap local items for Supabase items when
    // Supabase actually HAS items for that pedido.  If Supabase has zero items (push never
    // happened or was wiped by a race) we keep the local items as-is to avoid data loss.
    const supabaseItemsByPedido = new Map<number, AnyRow[]>()
    for (const item of itensPedido) {
      const pid: number = item['pedido_id']
      if (!supabaseItemsByPedido.has(pid)) supabaseItemsByPedido.set(pid, [])
      supabaseItemsByPedido.get(pid)!.push(item)
    }
    // Bulk lookup: pedido.synced AND local item counts, avoiding 2 queries per remote pedido.
    const pedidoSyncedMap = new Map<number, number>(
      (sqlite.prepare('SELECT id, synced FROM pedidos').all() as { id: number; synced: number }[])
        .map(r => [r.id, r.synced])
    )
    const localItemCountMap = new Map<number, number>(
      (sqlite.prepare('SELECT pedido_id, COUNT(*) as c FROM itens_pedido GROUP BY pedido_id').all() as { pedido_id: number; c: number }[])
        .map(r => [r.pedido_id, r.c])
    )
    const flagPedidoStmt = sqlite.prepare('UPDATE pedidos SET synced = 0 WHERE id = ?')
    const flagItensStmt = sqlite.prepare('UPDATE itens_pedido SET synced = 0 WHERE pedido_id = ?')
    const deleteItensStmt = sqlite.prepare('DELETE FROM itens_pedido WHERE pedido_id = ?')
    // Prepare the item insert from the first available item's column shape.
    // Supabase schema is stable so all rows share the same columns.
    const firstItem = itensPedido.find(_ => true)
    const itemCols = firstItem ? Object.keys(firstItem).filter(c => c !== 'id') : []
    const insertItemStmt = itemCols.length > 0
      ? sqlite.prepare(`INSERT INTO itens_pedido (${itemCols.join(', ')}) VALUES (${itemCols.map(() => '?').join(', ')})`)
      : null

    for (const remotePedido of pedidosRemote) {
      const synced = pedidoSyncedMap.get(remotePedido['id'])
      if (synced === undefined || synced === 0) continue
      const items = supabaseItemsByPedido.get(remotePedido['id'])
      if (!items || items.length === 0) {
        const localItemCount = localItemCountMap.get(remotePedido['id']) ?? 0
        if (localItemCount > 0) {
          console.log(`[sync] auto-heal: pedido ${remotePedido['id']} has ${localItemCount} local items but 0 in Supabase — re-push scheduled`)
          flagPedidoStmt.run(remotePedido['id'])
          flagItensStmt.run(remotePedido['id'])
          autoHealCount++
        }
        continue
      }
      deleteItensStmt.run(remotePedido['id'])
      if (insertItemStmt) {
        for (const item of items) {
          insertItemStmt.run(itemCols.map(c => item[c] ?? null))
        }
      }
    }

    upsertLocal(sqlite, 'despesas', despesas, 'id')
    upsertLocal(sqlite, 'configuracoes', configuracoes, 'chave', true)

    // layout_config: upsert by (rede_id, loja_id), skip if local synced=0.
    // Bulk the synced precheck + hoist the prepared statement.
    const layoutUnsynced = new Set(
      (sqlite.prepare('SELECT rede_id, loja_id FROM layout_config WHERE synced = 0').all() as { rede_id: number; loja_id: number }[])
        .map(r => `${r.rede_id}:${r.loja_id}`)
    )
    const layoutInsertStmt = sqlite.prepare(
      `INSERT INTO layout_config (id, rede_id, loja_id, produto_ids, synced, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(rede_id, loja_id) DO UPDATE SET
         id = excluded.id,
         produto_ids = excluded.produto_ids,
         synced = 1,
         updated_at = excluded.updated_at`
    )
    for (const row of layoutConfigs) {
      if (layoutUnsynced.has(`${row['rede_id']}:${row['loja_id']}`)) continue
      layoutInsertStmt.run(row['id'] ?? null, row['rede_id'], row['loja_id'], row['produto_ids'] ?? '[]', row['updated_at'] ?? null)
    }

    // rede_col_order: upsert by rede_id, skip if local synced=0 (unsynced local changes win)
    const colOrderUnsynced = new Set(
      (sqlite.prepare('SELECT rede_id FROM rede_col_order WHERE synced = 0').all() as { rede_id: number }[])
        .map(r => r.rede_id)
    )
    const colOrderInsertStmt = sqlite.prepare(
      `INSERT INTO rede_col_order (rede_id, produto_ids, synced, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(rede_id) DO UPDATE SET
         produto_ids = excluded.produto_ids,
         synced = 1,
         updated_at = excluded.updated_at`
    )
    for (const row of redeColOrders) {
      if (colOrderUnsynced.has(row['rede_id'])) continue
      colOrderInsertStmt.run(row['rede_id'], row['produto_ids'] ?? '[]', row['updated_at'] ?? null)
    }

    // print_order: upsert by (rede_id, loja_id) — always overwrite (no local synced tracking)
    const printOrderInsertStmt = sqlite.prepare(
      `INSERT INTO print_order (rede_id, loja_id, produto_ids, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(rede_id, loja_id) DO UPDATE SET
         produto_ids = excluded.produto_ids,
         updated_at = excluded.updated_at`
    )
    for (const row of printOrders) {
      printOrderInsertStmt.run(row['rede_id'], row['loja_id'], row['produto_ids'] ?? '[]', row['updated_at'] ?? null)
    }

    // estoque_entradas: upsert por (produto_id, data), skip se local synced=0
    const entradasUnsynced = new Set(
      (sqlite.prepare('SELECT produto_id, data FROM estoque_entradas WHERE synced = 0').all() as { produto_id: number; data: string }[])
        .map(r => `${r.produto_id}:${r.data}`)
    )
    const entradasInsertStmt = sqlite.prepare(`
      INSERT INTO estoque_entradas (id, produto_id, data, quantidade, synced, device_id, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(produto_id, data) DO UPDATE SET
        id = excluded.id,
        quantidade = excluded.quantidade,
        synced = 1,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at
    `)
    for (const row of estoqueEntradas) {
      if (entradasUnsynced.has(`${row['produto_id']}:${row['data']}`)) continue
      entradasInsertStmt.run(
        row['id'] ?? null,
        row['produto_id'],
        row['data'],
        row['quantidade'],
        row['device_id'] ?? null,
        row['updated_at'] ?? null
      )
    }
  })()
  } finally {
    sqlite.pragma('foreign_keys = ON')
  }

  if (autoHealCount > 0) {
    console.log(`[sync] auto-heal: flagged ${autoHealCount} pedido(s) for re-push`)
  }
  console.log('[sync] Pull complete.')
  return autoHealCount
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
// Debounce timer for broadcast handler: collapses bursts of remote-change notifications
// into a single sync, preventing UI flicker when another device saves rapidly.
let _broadcastDebounce: ReturnType<typeof setTimeout> | null = null

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
    const healed = await pullFromSupabase(supabase)
    // Auto-heal detected pedidos with local items but no remote items — re-push now
    // instead of waiting for the next polling cycle. Also broadcasts so other devices
    // pull the recovered data immediately.
    if (healed > 0) {
      await pushPendingPedidos(supabase)
      _broadcastChannel?.send({
        type: 'broadcast',
        event: 'updated',
        payload: { from: getDeviceId() },
      })
    }
    const changed = alwaysNotify || healed > 0 || dataSignature(sqlite) !== before
    if (!win.isDestroyed() && changed) win.webContents.send(IPC.DB_SYNCED)
    // A broadcast arrived while we were syncing — pull once more and notify
    if (_pendingBroadcast && !win.isDestroyed()) {
      _pendingBroadcast = false
      await pullFromSupabase(supabase)
      win.webContents.send(IPC.DB_SYNCED)
    }
  } catch (err: unknown) {
    const msg = (err as Error).message
    console.warn('[sync] Sync failed:', msg)
    if (!win.isDestroyed()) win.webContents.send(IPC.SYNC_ERROR, msg)
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
    const healed = await pullFromSupabase(supabase)
    // Auto-heal on startup: if local has items that Supabase lost, re-push them now
    // so the recovered data is in the cloud before the UI starts querying.
    if (healed > 0) {
      await pushPendingPedidos(supabase)
      _broadcastChannel?.send({
        type: 'broadcast',
        event: 'updated',
        payload: { from: getDeviceId() },
      })
    }
    // Notify renderer that fresh data (including configs) is in SQLite
    if (!win.isDestroyed()) win.webContents.send(IPC.DB_READY)
  } catch (err: unknown) {
    const startMsg = (err as Error).message
    console.warn('[sync] Startup sync failed:', startMsg)
    if (!win.isDestroyed()) win.webContents.send(IPC.SYNC_ERROR, startMsg)
  } finally {
    _isSyncing = false
  }

  const deviceId = getDeviceId()

  // ── Broadcast: instant notification when another device saves ──
  function subscribeBroadcast() {
    _broadcastChannel = supabase
      .channel('sync-broadcast')
      .on('broadcast', { event: 'updated' }, (msg: { payload?: { from?: string } }) => {
        if (msg.payload?.from === deviceId) return // ignore own broadcasts
        // Debounce: when another device is saving rapidly, broadcasts arrive in
        // bursts. Instead of running a full sync (and triggering a UI re-fetch)
        // for each one, wait 1.5s for the burst to settle, then sync once.
        if (_broadcastDebounce) clearTimeout(_broadcastDebounce)
        _broadcastDebounce = setTimeout(() => {
          _broadcastDebounce = null
          console.log('[sync] coalesced broadcast — pulling from remote')
          runSync(supabase, win, true).catch((e) => {
            console.warn('[sync] coalesced broadcast sync failed:', (e as Error).message)
          })
        }, 1_500)
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

/** Delete a rede (and all its data) from Supabase — call before local delete.
 *  Cascades: precos → lojas → rede, so FK constraints are satisfied. */
export async function pushDeleteRede(redeId: number): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  // 1. Get lojas for this rede so we can delete their precos
  const { data: lojas } = await supabase.from('lojas').select('id').eq('rede_id', redeId)
  const lojaIds = (lojas ?? []).map((l: { id: number }) => l.id)
  // 2. Delete precos for these lojas (FK: precos.loja_id → lojas)
  if (lojaIds.length > 0) {
    await supabase.from('precos').delete().in('loja_id', lojaIds)
    await supabase.from('layout_config').delete().in('loja_id', lojaIds)
    await supabase.from('print_order').delete().in('loja_id', lojaIds)
  }
  // 3. Hard-delete lojas (FK: lojas.rede_id → redes)
  await supabase.from('lojas').delete().eq('rede_id', redeId)
  // 4. Delete rede
  await supabase.from('redes').delete().eq('id', redeId)
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
        // PUSH ONLY. Pulling here was blocking the main process on every save
        // — pullFromSupabase runs a large synchronous SQLite transaction (per-
        // row upserts + per-pedido item replace) that froze the UI whenever
        // the user typed or clicked. Pulls still happen via the 8-second
        // polling loop and via broadcasts from other devices.
        await pushPendingPedidos(supabase)
        await pushPendingOthers(supabase)
        // Broadcast to other devices so they pull soon.
        _broadcastChannel?.send({
          type: 'broadcast',
          event: 'updated',
          payload: { from: getDeviceId() },
        })
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

/** Send a sync error message to the renderer window */
export function notifySyncError(win: BrowserWindow, message: string): void {
  if (!win.isDestroyed()) win.webContents.send(IPC.SYNC_ERROR, message)
}

/** Force a full pull from Supabase and notify renderer — used by admin resync button */
export async function forcePullAndNotify(win: BrowserWindow): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase não configurado')
  await pullFromSupabase(supabase)
  if (!win.isDestroyed()) win.webContents.send(IPC.DB_READY)
}

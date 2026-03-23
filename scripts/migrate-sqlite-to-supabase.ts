// scripts/migrate-sqlite-to-supabase.ts
// Run with: npx tsx scripts/migrate-sqlite-to-supabase.ts <path-to-henrique.db>
import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kdjkdhuzobascohxvoin.supabase.co'
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
const ANON_KEY = 'sb_publishable_Ln5OBAVtohhGYD-RCDIe0w_jaHJOrlw'

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: npx tsx scripts/migrate-sqlite-to-supabase.ts <path-to-henrique.db>')
  process.exit(1)
}

// Use service role key if available, otherwise fallback to anon key
const key = SERVICE_ROLE_KEY || ANON_KEY
const supabase = createClient(SUPABASE_URL, key)

const sqlite = new Database(dbPath, { readonly: true })

async function upsertBatch(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`)
  }
}

async function migrate() {
  console.log('Starting migration...\n')

  // Tables in FK-safe order
  const simpleTables = ['redes', 'franqueados', 'lojas', 'produtos', 'configuracoes', 'pedidos', 'itens_pedido', 'despesas']
  for (const table of simpleTables) {
    let rows: Record<string, unknown>[]
    try {
      rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    } catch {
      console.log(`  ${table}: table not found, skipping`)
      continue
    }
    if (rows.length === 0) { console.log(`  ${table}: 0 rows, skipping`); continue }
    await upsertBatch(table, rows)
    console.log(`  ✓ ${table}: ${rows.length} rows migrated`)
  }

  // precos and custos: only migrate rows whose produto_id exists in sqlite produtos
  const produtoIds = new Set(
    (sqlite.prepare('SELECT id FROM produtos').all() as { id: number }[]).map(r => r.id)
  )

  for (const table of ['precos', 'custos']) {
    let rows: Record<string, unknown>[]
    try {
      rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    } catch {
      console.log(`  ${table}: table not found, skipping`)
      continue
    }
    const valid = rows.filter(r => produtoIds.has(r['produto_id'] as number))
    const skipped = rows.length - valid.length
    if (valid.length > 0) await upsertBatch(table, valid)
    const note = skipped > 0 ? ` (${skipped} orphaned rows skipped)` : ''
    console.log(`  ✓ ${table}: ${valid.length} rows migrated${note}`)
  }

  sqlite.close()
  console.log('\n✅ Migration complete!')
}

migrate().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})

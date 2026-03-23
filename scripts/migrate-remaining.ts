// Migrates only precos, custos, despesas (remaining tables after partial migration)
import Database from 'better-sqlite3'

const SUPABASE_URL = 'https://kdjkdhuzobascohxvoin.supabase.co'
const ANON_KEY = 'sb_publishable_Ln5OBAVtohhGYD-RCDIe0w_jaHJOrlw'

const dbPath = process.argv[2]
if (!dbPath) { console.error('Usage: npx tsx scripts/migrate-remaining.ts <path>'); process.exit(1) }

const sqlite = new Database(dbPath, { readonly: true })

async function post(table: string, rows: Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${table}: HTTP ${res.status} — ${text}`)
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run() {
  const produtoIds = new Set(
    (sqlite.prepare('SELECT id FROM produtos').all() as { id: number }[]).map(r => r.id)
  )

  for (const table of ['precos', 'custos']) {
    let rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    const valid = rows.filter(r => produtoIds.has(r['produto_id'] as number))
    const skipped = rows.length - valid.length

    for (let i = 0; i < valid.length; i += 50) {
      await post(table, valid.slice(i, i + 50))
      await sleep(300)
    }
    console.log(`✓ ${table}: ${valid.length} rows${skipped > 0 ? ` (${skipped} orphaned skipped)` : ''}`)
  }

  // despesas: no FK constraints
  const despesas = sqlite.prepare('SELECT * FROM despesas').all() as Record<string, unknown>[]
  if (despesas.length > 0) {
    for (let i = 0; i < despesas.length; i += 50) {
      await post('despesas', despesas.slice(i, i + 50))
      await sleep(300)
    }
  }
  console.log(`✓ despesas: ${despesas.length} rows`)

  sqlite.close()
  console.log('\n✅ Done!')
}

run().catch(e => { console.error('Failed:', e.message); process.exit(1) })

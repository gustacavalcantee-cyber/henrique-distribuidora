// scripts/migrate-sqlite-to-supabase.ts
// Run with: npx tsx scripts/migrate-sqlite-to-supabase.ts <path-to-henrique.db>
import Database from 'better-sqlite3'
import postgres from 'postgres'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(__dirname, '../src/main/db/.env.local') })

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: npx tsx scripts/migrate-sqlite-to-supabase.ts <path-to-henrique.db>')
  process.exit(1)
}

const sqlite = new Database(dbPath, { readonly: true })
const sql = postgres(process.env['DATABASE_URL']!)

async function migrate() {
  const tables = [
    'redes',
    'franqueados',
    'lojas',
    'produtos',
    'configuracoes',
    'pedidos',
    'itens_pedido',
    'precos',
    'custos',
    'despesas',
  ]

  console.log('Starting migration...\n')

  for (const table of tables) {
    let rows: Record<string, unknown>[]
    try {
      rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    } catch (e) {
      console.log(`  ${table}: table not found, skipping`)
      continue
    }

    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows, skipping`)
      continue
    }

    // Insert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      await sql`INSERT INTO ${sql(table)} ${sql(batch)} ON CONFLICT DO NOTHING`
    }

    // Reset sequence so new inserts get correct IDs (only for tables with serial id)
    try {
      await sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE((SELECT MAX(id) FROM ${sql(table)}), 0))`
    } catch {
      // configuracoes has no serial id, skip
    }

    console.log(`  ✓ ${table}: ${rows.length} rows migrated`)
  }

  await sql.end()
  sqlite.close()
  console.log('\n✅ Migration complete!')
}

migrate().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})

# Supabase Migration (Phase 1 — Desktop) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local SQLite + Google Drive sync with Supabase (PostgreSQL), giving the desktop app real-time cross-machine sync with no conflicts.

**Architecture:** The Drizzle ORM query syntax is nearly identical between SQLite and PostgreSQL — the migration mostly converts sync `.all()/.run()` calls to `async/await`, swaps `sqliteTable` for `pgTable`, and replaces the file watcher with Supabase Realtime. No IPC channels or UI screens change.

**Tech Stack:** `postgres` (npm driver), `drizzle-orm/postgres-js`, `@supabase/supabase-js` (Realtime only), Supabase free tier

---

## Chunk 1: Setup + Schema

### Task 1: Create Supabase Project (manual)

**Files:** none (manual setup)

- [ ] Go to https://supabase.com → New Project → name "henrique-vendas", region closest to Brazil (São Paulo)
- [ ] Wait for project to provision (~2 min)
- [ ] Go to **Settings → Database** → copy **Connection String (URI)** — looks like:
  `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`
- [ ] Go to **Settings → API** → copy **Project URL** and **anon public key**
- [ ] Create file `src/main/db/.env.local` (gitignored) with:
  ```
  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_ANON_KEY=eyJhbGc...
  ```
- [ ] Add `src/main/db/.env.local` to `.gitignore`

---

### Task 2: Install Dependencies

**Files:** `package.json`

- [ ] Install runtime deps:
  ```bash
  npm install postgres @supabase/supabase-js
  ```
- [ ] Verify Drizzle already supports postgres (it does — `drizzle-orm/postgres-js` is included in the installed `drizzle-orm` package)
- [ ] Run `npm install` to confirm no errors
- [ ] Commit:
  ```bash
  git add package.json package-lock.json
  git commit -m "chore: add postgres and supabase-js dependencies"
  ```

---

### Task 3: PostgreSQL Schema

**Files:**
- Create: `src/main/db/schema-pg.ts`
- Keep: `src/main/db/schema.ts` (untouched — used during transition)

The schema is almost identical to the SQLite one. Key differences:
- `sqliteTable` → `pgTable` (from `drizzle-orm/pg-core`)
- `integer('id').primaryKey({ autoIncrement: true })` → `serial('id').primaryKey()`
- `sql\`(datetime('now'))\`` → `sql\`now()\``
- `real()` → `doublePrecision()` (more precise in Postgres)

- [ ] Create `src/main/db/schema-pg.ts`:

```typescript
// src/main/db/schema-pg.ts
import { pgTable, serial, integer, text, doublePrecision, unique } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

export const redes = pgTable('redes', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  cor_tema: text('cor_tema'),
  ativo: integer('ativo').default(1),
})

export const franqueados = pgTable('franqueados', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
})

export const lojas = pgTable('lojas', {
  id: serial('id').primaryKey(),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  codigo: text('codigo'),
  cnpj: text('cnpj'),
  ativo: integer('ativo').default(1),
  franqueado_id: integer('franqueado_id').references(() => franqueados.id),
})

export const produtos = pgTable('produtos', {
  id: serial('id').primaryKey(),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  unidade: text('unidade').notNull(),
  ordem_exibicao: integer('ordem_exibicao').default(0),
  ativo: integer('ativo').default(1),
})

export const pedidos = pgTable(
  'pedidos',
  {
    id: serial('id').primaryKey(),
    rede_id: integer('rede_id').references(() => redes.id),
    loja_id: integer('loja_id').references(() => lojas.id),
    data_pedido: text('data_pedido').notNull(),
    numero_oc: text('numero_oc').notNull(),
    observacoes: text('observacoes'),
    criado_em: text('criado_em').default(sql`now()`),
    status_pagamento: text('status_pagamento').default('aberto'),
  },
  (t) => ({
    uniquePedido: unique().on(t.rede_id, t.loja_id, t.data_pedido, t.numero_oc),
  })
)

export const itensPedido = pgTable('itens_pedido', {
  id: serial('id').primaryKey(),
  pedido_id: integer('pedido_id').references(() => pedidos.id, { onDelete: 'cascade' }),
  produto_id: integer('produto_id').references(() => produtos.id),
  quantidade: doublePrecision('quantidade').notNull(),
  preco_unit: doublePrecision('preco_unit').notNull(),
  custo_unit: doublePrecision('custo_unit').notNull(),
})

export const precos = pgTable('precos', {
  id: serial('id').primaryKey(),
  produto_id: integer('produto_id').references(() => produtos.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  preco_venda: doublePrecision('preco_venda').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
})

export const custos = pgTable('custos', {
  id: serial('id').primaryKey(),
  produto_id: integer('produto_id').references(() => produtos.id),
  custo_compra: doublePrecision('custo_compra').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
})

export const despesas = pgTable('despesas', {
  id: serial('id').primaryKey(),
  data: text('data').notNull(),
  categoria: text('categoria').notNull(),
  rede_id: integer('rede_id').references(() => redes.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  descricao: text('descricao'),
  valor: doublePrecision('valor').notNull(),
})

export const configuracoes = pgTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor'),
})

// Relations (identical to SQLite schema)
export const redesRelations = relations(redes, ({ many }) => ({
  lojas: many(lojas),
  produtos: many(produtos),
  pedidos: many(pedidos),
}))

export const lojasRelations = relations(lojas, ({ one, many }) => ({
  rede: one(redes, { fields: [lojas.rede_id], references: [redes.id] }),
  franqueado: one(franqueados, { fields: [lojas.franqueado_id], references: [franqueados.id] }),
  pedidos: many(pedidos),
  precos: many(precos),
}))

export const franqueadosRelations = relations(franqueados, ({ many }) => ({
  lojas: many(lojas),
}))

export const produtosRelations = relations(produtos, ({ one, many }) => ({
  rede: one(redes, { fields: [produtos.rede_id], references: [redes.id] }),
  precos: many(precos),
  custos: many(custos),
  itensPedido: many(itensPedido),
}))

export const pedidosRelations = relations(pedidos, ({ one, many }) => ({
  rede: one(redes, { fields: [pedidos.rede_id], references: [redes.id] }),
  loja: one(lojas, { fields: [pedidos.loja_id], references: [lojas.id] }),
  itensPedido: many(itensPedido),
}))

export const itensPedidoRelations = relations(itensPedido, ({ one }) => ({
  pedido: one(pedidos, { fields: [itensPedido.pedido_id], references: [pedidos.id] }),
  produto: one(produtos, { fields: [itensPedido.produto_id], references: [produtos.id] }),
}))

export const precosRelations = relations(precos, ({ one }) => ({
  produto: one(produtos, { fields: [precos.produto_id], references: [produtos.id] }),
  loja: one(lojas, { fields: [precos.loja_id], references: [lojas.id] }),
}))

export const custosRelations = relations(custos, ({ one }) => ({
  produto: one(produtos, { fields: [custos.produto_id], references: [produtos.id] }),
}))

export const despesasRelations = relations(despesas, ({ one }) => ({
  rede: one(redes, { fields: [despesas.rede_id], references: [redes.id] }),
  loja: one(lojas, { fields: [despesas.loja_id], references: [lojas.id] }),
}))
```

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```
  Expected: no errors in schema-pg.ts

- [ ] Commit:
  ```bash
  git add src/main/db/schema-pg.ts
  git commit -m "feat: add PostgreSQL schema (Drizzle pg-core)"
  ```

---

### Task 4: PostgreSQL DB Client

**Files:**
- Create: `src/main/db/client-pg.ts`
- Keep: `src/main/db/client.ts` (untouched until all handlers migrated)

- [ ] Create `src/main/db/client-pg.ts`:

```typescript
// src/main/db/client-pg.ts
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema-pg'

let _db: ReturnType<typeof drizzle> | null = null
let _sql: ReturnType<typeof postgres> | null = null

export function getDb() {
  if (_db) return _db
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL not set')
  _sql = postgres(url, { max: 5 })
  _db = drizzle(_sql, { schema })
  return _db
}

export async function closeDb() {
  if (_sql) {
    await _sql.end()
    _sql = null
    _db = null
  }
}
```

- [ ] In `src/main/index.ts`, load env vars near the top (before `registerAllHandlers()`):

```typescript
// Load Supabase credentials from .env.local in dev, or from bundled env in prod
import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(__dirname, '../../src/main/db/.env.local') }) // dev only
// In production, DATABASE_URL etc. are injected at build time via electron-builder extraMetadata
```

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```
  Expected: no errors

- [ ] Commit:
  ```bash
  git add src/main/db/client-pg.ts src/main/index.ts
  git commit -m "feat: add PostgreSQL Drizzle client"
  ```

---

## Chunk 2: Migrate Handlers (Sync → Async)

> The pattern for every handler file is the same:
> 1. Change `import { getDb } from '../db/client'` → `import { getDb } from '../db/client-pg'`
> 2. Change `import ... from './schema'` → `import ... from '../db/schema-pg'`
> 3. Add `async` to handler callbacks and `await` to all queries
> 4. Replace `.all()` → remove (drizzle-postgres returns arrays directly)
> 5. Replace `.run()` → `await` the expression (no return value needed)
> 6. Replace `.returning().all()[0]` → `(await ...returning())[0]`
> 7. Replace `.get()` → `(await db.select()...limit(1))[0]`

### Task 5: Migrate redes.ts + franqueados.ts + lojas.ts

**Files:**
- Modify: `src/main/handlers/redes.ts`
- Modify: `src/main/handlers/franqueados.ts`
- Modify: `src/main/handlers/lojas.ts`

- [ ] Update `src/main/handlers/redes.ts`:

```typescript
import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client-pg'
import { redes } from '../db/schema-pg'
import { IPC } from '../../shared/ipc-channels'

export function registerRedesHandlers() {
  ipcMain.handle(IPC.REDES_LIST, async () => {
    return await getDb().select().from(redes)
  })

  ipcMain.handle(IPC.REDES_CREATE, async (_event, data: { nome: string; cor_tema: string }) => {
    return (await getDb().insert(redes).values(data).returning())[0]
  })

  ipcMain.handle(IPC.REDES_UPDATE, async (_event, data: { id: number; nome?: string; cor_tema?: string; ativo?: number }) => {
    const { id, ...updates } = data
    return (await getDb().update(redes).set(updates).where(eq(redes.id, id)).returning())[0]
  })

  ipcMain.handle(IPC.REDES_DELETE, async (_event, id: number) => {
    await getDb().delete(redes).where(eq(redes.id, id))
  })
}
```

- [ ] Update `src/main/handlers/franqueados.ts` using the same async pattern (read current file and apply pattern)

- [ ] Update `src/main/handlers/lojas.ts` using the same async pattern

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```

- [ ] Commit:
  ```bash
  git add src/main/handlers/redes.ts src/main/handlers/franqueados.ts src/main/handlers/lojas.ts
  git commit -m "feat: migrate redes/franqueados/lojas handlers to PostgreSQL"
  ```

---

### Task 6: Migrate produtos.ts + custos.ts + precos.ts + configuracoes.ts

**Files:**
- Modify: `src/main/handlers/produtos.ts`
- Modify: `src/main/handlers/custos.ts`
- Modify: `src/main/handlers/precos.ts`
- Modify: `src/main/handlers/configuracoes.ts`

- [ ] Apply async pattern to `src/main/handlers/produtos.ts` (change import + async/await + remove `.all()/.run()`)
- [ ] Apply async pattern to `src/main/handlers/custos.ts`
- [ ] Apply async pattern to `src/main/handlers/precos.ts`
- [ ] Apply async pattern to `src/main/handlers/configuracoes.ts`
- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```
- [ ] Commit:
  ```bash
  git add src/main/handlers/produtos.ts src/main/handlers/custos.ts src/main/handlers/precos.ts src/main/handlers/configuracoes.ts
  git commit -m "feat: migrate produtos/custos/precos/configuracoes handlers to PostgreSQL"
  ```

---

### Task 7: Migrate despesas.ts + estoque.ts

**Files:**
- Modify: `src/main/handlers/despesas.ts`
- Modify: `src/main/handlers/estoque.ts`

- [ ] Apply async pattern to `src/main/handlers/despesas.ts`
- [ ] Apply async pattern to `src/main/handlers/estoque.ts`
- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```
- [ ] Commit:
  ```bash
  git add src/main/handlers/despesas.ts src/main/handlers/estoque.ts
  git commit -m "feat: migrate despesas/estoque handlers to PostgreSQL"
  ```

---

### Task 8: Migrate pedidos.ts + pedidos.service.ts

**Files:**
- Modify: `src/main/handlers/pedidos.ts`
- Modify: `src/main/services/pedidos.service.ts`

These files are the largest handlers. The service pattern is: the handler calls a service function. Both need to become async.

- [ ] In `src/main/services/pedidos.service.ts`:
  - Change `import { getDb } from '../db/client'` → `import { getDb } from '../db/client-pg'`
  - Change schema import to `schema-pg`
  - Add `async` to all exported functions
  - Replace `.all()` → remove, add `await`
  - Replace `.run()` → `await`
  - Replace `.returning().all()[0]` → `(await ...returning())[0]`

- [ ] In `src/main/handlers/pedidos.ts`:
  - Change imports to `client-pg` and `schema-pg`
  - All handler callbacks are already `async`, add `await` to service calls

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```

- [ ] Commit:
  ```bash
  git add src/main/handlers/pedidos.ts src/main/services/pedidos.service.ts
  git commit -m "feat: migrate pedidos handlers and service to PostgreSQL"
  ```

---

### Task 9: Migrate relatorios.ts + relatorios.service.ts

**Files:**
- Modify: `src/main/handlers/relatorios.ts`
- Modify: `src/main/services/relatorios.service.ts`

This is the largest service (499 lines). Apply the same pattern.

- [ ] In `src/main/services/relatorios.service.ts`:
  - Change imports to `client-pg` and `schema-pg`
  - Add `async` to all exported functions
  - Replace all `.all()` calls with `await` (no `.all()`)
  - Replace `.run()` → `await`
  - Note: this file uses complex joins — they work identically in Drizzle PostgreSQL

- [ ] In `src/main/handlers/relatorios.ts`:
  - Change imports
  - Add `await` to service calls

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```
  Expected: 0 errors

- [ ] Commit:
  ```bash
  git add src/main/handlers/relatorios.ts src/main/services/relatorios.service.ts
  git commit -m "feat: migrate relatorios handlers and service to PostgreSQL"
  ```

---

## Chunk 3: Data Migration + Watcher Removal

### Task 10: Data Migration Script

**Files:**
- Create: `scripts/migrate-sqlite-to-supabase.ts`

This script reads the existing `henrique.db` SQLite file and inserts all data into Supabase via the PostgreSQL client.

- [ ] Create `scripts/migrate-sqlite-to-supabase.ts`:

```typescript
// scripts/migrate-sqlite-to-supabase.ts
// Run with: npx tsx scripts/migrate-sqlite-to-supabase.ts <path-to-henrique.db>
import Database from 'better-sqlite3'
import postgres from 'postgres'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(__dirname, '../src/main/db/.env.local') })

const dbPath = process.argv[2]
if (!dbPath) { console.error('Usage: npx tsx scripts/migrate-sqlite-to-supabase.ts <path>'); process.exit(1) }

const sqlite = new Database(dbPath, { readonly: true })
const sql = postgres(process.env['DATABASE_URL']!)

async function migrate() {
  const tables = ['redes','franqueados','lojas','produtos','configuracoes',
    'pedidos','itens_pedido','precos','custos','despesas']

  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    if (rows.length === 0) { console.log(`  ${table}: 0 rows, skip`); continue }
    // Insert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      await sql`INSERT INTO ${sql(table)} ${sql(batch)} ON CONFLICT DO NOTHING`
    }
    // Reset sequence so new inserts get correct IDs
    await sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE(MAX(id), 0)) FROM ${sql(table)}`
    console.log(`  ✓ ${table}: ${rows.length} rows`)
  }

  await sql.end()
  sqlite.close()
  console.log('\nMigration complete!')
}

migrate().catch(e => { console.error(e); process.exit(1) })
```

- [ ] Install tsx if not present: `npm install --save-dev tsx`

- [ ] Test with a copy of the current database:
  ```bash
  # Find the current DB path (shown in the app's DB status)
  npx tsx scripts/migrate-sqlite-to-supabase.ts ~/path/to/henrique.db
  ```
  Expected output: each table shows "✓ tableName: N rows"

- [ ] Verify data in Supabase dashboard: Table Editor → check row counts match

- [ ] Commit:
  ```bash
  git add scripts/migrate-sqlite-to-supabase.ts package.json package-lock.json
  git commit -m "feat: add SQLite to Supabase migration script"
  ```

---

### Task 11: Remove File Watcher + Google Drive Code

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/db/client.ts` (keep for reference but stop using it)
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/handlers/index.ts`

- [ ] In `src/main/index.ts`:
  - Remove `import { statSync } from 'fs'`
  - Remove `import { getDbPath, reloadDb } from './db/client'`
  - Remove the entire `startDbWatcher()` function and its call
  - Remove the `dbPath` / `lastMtime` watcher variables
  - Keep `registerAllHandlers()` and everything else

- [ ] In `src/main/handlers/index.ts`, remove the `DB_RELOAD` and `DB_STATUS` handlers (they reference the old SQLite client — check the file first)

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```

- [ ] Commit:
  ```bash
  git add src/main/index.ts src/main/handlers/index.ts
  git commit -m "feat: remove Google Drive file watcher"
  ```

---

### Task 12: Add Supabase Realtime

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/components/Sidebar.tsx`

Supabase Realtime notifies the desktop when any other machine inserts/updates data. We listen for changes on the `pedidos` table (most frequent change) and send `DB_SYNCED` to the renderer — same IPC channel as before, so Sidebar works with no changes.

- [ ] In `src/main/index.ts`, add Realtime subscription after `createWindow()`:

```typescript
import { createClient } from '@supabase/supabase-js'

// After mainWindow is created:
function startRealtimeSync(win: BrowserWindow) {
  const supabase = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_ANON_KEY']!
  )
  supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      win.webContents.send(IPC.DB_SYNCED)
    })
    .subscribe()
}
// Call startRealtimeSync(mainWindow) after mainWindow is shown
```

- [ ] In `src/renderer/src/components/Sidebar.tsx`, update the `pendingSync` banner text — since it's now truly real-time (not Google Drive), change the wording:
  - `"Novos dados disponíveis."` → `"Atualização recebida."`
  - Remove the Google Drive warning (`dbSource === 'local'` block) — no longer relevant

- [ ] Run TypeScript check:
  ```bash
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  ```

- [ ] Commit:
  ```bash
  git add src/main/index.ts src/renderer/src/components/Sidebar.tsx
  git commit -m "feat: add Supabase Realtime for cross-machine sync"
  ```

---

## Chunk 4: Environment Config + Build

### Task 13: Environment Variables for Production Build

**Files:**
- Modify: `electron-builder.yml`
- Create: `src/main/env.ts`

In production (packaged app), env vars must be injected at build time.

- [ ] Create `src/main/env.ts` to centralize env access:

```typescript
// src/main/env.ts
// In dev: loaded from .env.local via dotenv
// In prod: injected at build time via electron-builder extraMetadata → process.env
export const DB_URL = process.env['DATABASE_URL'] ?? ''
export const SUPABASE_URL = process.env['SUPABASE_URL'] ?? ''
export const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? ''
```

- [ ] Update `electron-builder.yml` to inject env vars at build time:

```yaml
# Add to electron-builder.yml:
extraMetadata:
  env:
    DATABASE_URL: "${DATABASE_URL}"
    SUPABASE_URL: "${SUPABASE_URL}"
    SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
```

- [ ] Create `.env.production` (gitignored) with actual values for building:
  ```
  DATABASE_URL=postgresql://postgres:...
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_ANON_KEY=eyJhbGc...
  ```

- [ ] Add `.env.production` to `.gitignore`

- [ ] Commit:
  ```bash
  git add src/main/env.ts electron-builder.yml .gitignore
  git commit -m "feat: inject Supabase env vars into production build"
  ```

---

### Task 14: Smoke Test + Build

**Files:** none new

- [ ] Start the app in dev mode:
  ```bash
  npm run dev
  ```
  Expected: app opens, no console errors, data loads correctly

- [ ] Test each major flow manually:
  - [ ] Lançamentos: create a pedido, verify it appears in Supabase Table Editor
  - [ ] Histórico: verify old migrated data shows
  - [ ] Relatórios: run Financeiro report, verify numbers match
  - [ ] Despesas: add a despesa, verify saved
  - [ ] Cadastros: add a produto, verify saved

- [ ] Test Realtime: open app on two machines (or two dev instances), create a pedido on one → verify `pendingSync` banner appears on the other within ~2 seconds

- [ ] Build for production:
  ```bash
  npm run build
  ```
  Expected: build completes without errors

- [ ] Commit all remaining changes:
  ```bash
  git add -A
  git commit -m "feat: complete Supabase migration — desktop now uses PostgreSQL"
  git push
  ```

---

## Summary of File Changes

| File | Action |
|---|---|
| `src/main/db/schema-pg.ts` | **Create** — PostgreSQL schema |
| `src/main/db/client-pg.ts` | **Create** — Drizzle + postgres-js client |
| `src/main/env.ts` | **Create** — centralized env var access |
| `scripts/migrate-sqlite-to-supabase.ts` | **Create** — one-time data migration |
| `src/main/handlers/redes.ts` | **Modify** — async, client-pg |
| `src/main/handlers/franqueados.ts` | **Modify** — async, client-pg |
| `src/main/handlers/lojas.ts` | **Modify** — async, client-pg |
| `src/main/handlers/produtos.ts` | **Modify** — async, client-pg |
| `src/main/handlers/custos.ts` | **Modify** — async, client-pg |
| `src/main/handlers/precos.ts` | **Modify** — async, client-pg |
| `src/main/handlers/configuracoes.ts` | **Modify** — async, client-pg |
| `src/main/handlers/despesas.ts` | **Modify** — async, client-pg |
| `src/main/handlers/estoque.ts` | **Modify** — async, client-pg |
| `src/main/handlers/pedidos.ts` | **Modify** — async, client-pg |
| `src/main/handlers/relatorios.ts` | **Modify** — async, client-pg |
| `src/main/services/pedidos.service.ts` | **Modify** — async, client-pg |
| `src/main/services/relatorios.service.ts` | **Modify** — async, client-pg |
| `src/main/index.ts` | **Modify** — remove watcher, add Realtime |
| `src/main/handlers/index.ts` | **Modify** — remove DB_RELOAD/DB_STATUS |
| `src/renderer/src/components/Sidebar.tsx` | **Modify** — remove Drive warning |
| `electron-builder.yml` | **Modify** — inject env vars |
| `src/main/db/schema.ts` | **Keep** (untouched — delete after validation) |
| `src/main/db/client.ts` | **Keep** (untouched — delete after validation) |

> **Phase 2 (Expo mobile app) is a separate plan**, to be written after this migration is validated and running in production.

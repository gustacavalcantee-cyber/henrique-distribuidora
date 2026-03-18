# Sistema de Vendas Henrique — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop app (Electron + React + TypeScript + SQLite) para lançamento diário de pedidos de entrega a redes de fast food, impressão de documento 2 vias, fechamento quinzenal e controle financeiro.

**Architecture:** Electron com dois processos — main (Drizzle + better-sqlite3, IPC handlers, serviços) e renderer (React, AG Grid). O renderer nunca acessa o banco diretamente; tudo via IPC tipado com preload bridge. Impressão via janela Electron oculta com HTML/CSS + window.print().

**Tech Stack:** Electron 28, React 18, TypeScript, Drizzle ORM, better-sqlite3, AG Grid Community, Zod, React Router DOM (hash), ExcelJS, Tailwind CSS, Lucide React, date-fns, Vitest

---

## Chunk 1: Scaffolding + Banco de Dados ✅ COMPLETED

Tasks 1-3 completed. Project scaffolded with electron-vite, all dependencies installed, tailwind configured, git initialized.

---

## Chunk 2: IPC Infrastructure + App Shell

### Task 4: Shared types + IPC channels

**Files:**
- Create: `src/shared/ipc-channels.ts`
- Create: `src/shared/types.ts`

- [ ] **Step 1: Criar ipc-channels.ts**

```ts
// src/shared/ipc-channels.ts
export const IPC = {
  REDES_LIST: 'redes:list',
  REDES_CREATE: 'redes:create',
  REDES_UPDATE: 'redes:update',
  LOJAS_LIST: 'lojas:list',
  LOJAS_CREATE: 'lojas:create',
  LOJAS_UPDATE: 'lojas:update',
  PRODUTOS_LIST: 'produtos:list',
  PRODUTOS_CREATE: 'produtos:create',
  PRODUTOS_UPDATE: 'produtos:update',
  PRECOS_LIST: 'precos:list',
  PRECOS_UPSERT: 'precos:upsert',
  PRECOS_BY_LOJA: 'precos:byLoja',
  CUSTOS_LIST: 'custos:list',
  CUSTOS_UPSERT: 'custos:upsert',
  PEDIDOS_LIST: 'pedidos:list',
  PEDIDOS_BY_DATE_REDE: 'pedidos:byDateRede',
  PEDIDOS_CREATE: 'pedidos:create',
  PEDIDOS_UPDATE: 'pedidos:update',
  PEDIDOS_DELETE: 'pedidos:delete',
  PEDIDOS_CHECK_DUPLICATE: 'pedidos:checkDuplicate',
  DESPESAS_LIST: 'despesas:list',
  DESPESAS_CREATE: 'despesas:create',
  DESPESAS_UPDATE: 'despesas:update',
  DESPESAS_DELETE: 'despesas:delete',
  RELATORIO_QUINZENA: 'relatorio:quinzena',
  RELATORIO_FINANCEIRO: 'relatorio:financeiro',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  PRINT_PEDIDO: 'print:pedido',
} as const
```

- [ ] **Step 2: Criar types.ts**

```ts
// src/shared/types.ts
export interface Rede { id: number; nome: string; cor_tema: string; ativo: number }
export interface Loja { id: number; rede_id: number; nome: string; codigo: string | null; ativo: number }
export interface Produto { id: number; rede_id: number | null; nome: string; unidade: string; ordem_exibicao: number; ativo: number }
export interface Preco { id: number; produto_id: number; loja_id: number; preco_venda: number; vigencia_inicio: string; vigencia_fim: string | null }
export interface Custo { id: number; produto_id: number; custo_compra: number; vigencia_inicio: string; vigencia_fim: string | null }
export interface Pedido { id: number; rede_id: number; loja_id: number; data_pedido: string; numero_oc: string; observacoes: string | null; criado_em: string }
export interface ItemPedido { id: number; pedido_id: number; produto_id: number; quantidade: number; preco_unit: number; custo_unit: number }
export interface Despesa { id: number; data: string; categoria: string; rede_id: number | null; loja_id: number | null; descricao: string | null; valor: number }

export interface SalvarPedidoInput {
  rede_id: number
  loja_id: number
  data_pedido: string
  numero_oc: string
  observacoes?: string
  itens: Array<{ produto_id: number; quantidade: number; preco_unit?: number; custo_unit?: number }>
}

export interface LancamentoRow {
  loja_id: number
  loja_nome: string
  pedido_id: number | null
  numero_oc: string
  quantidades: Record<number, number | null>
}

export interface QuinzenaDetalheItem {
  data_pedido: string; numero_oc: string; loja_nome: string; produto_nome: string
  unidade: string; quantidade: number; preco_unit: number; custo_unit: number
  total_venda: number; total_custo: number
}
export interface QuinzenaMatrizRow { data_pedido: string; quantidades: Record<number, number> }
export interface QuinzenaSummary {
  total_venda: number; total_custo: number; margem: number
  detalhe: QuinzenaDetalheItem[]; matriz: QuinzenaMatrizRow[]; produtos: Produto[]
}
export interface FinanceiroSummary {
  receita_bruta: number; custo_produtos: number; margem_bruta: number
  despesas: number; lucro_liquido: number
  por_rede: Array<{ rede_nome: string; receita: number }>
  top_lojas: Array<{ loja_nome: string; receita: number }>
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: shared IPC channels and TypeScript types"
```

---

### Task 5: Preload bridge + handler registration

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/main/handlers/index.ts`

- [ ] **Step 1: Criar preload/index.ts**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args))
  },
}

contextBridge.exposeInMainWorld('electron', api)
export type ElectronAPI = typeof api
```

- [ ] **Step 2: Adicionar tipos globais em `src/renderer/src/env.d.ts`**

```ts
import type { ElectronAPI } from '../../preload'
declare global {
  interface Window { electron: ElectronAPI }
}
```

- [ ] **Step 3: Criar handlers/index.ts com versão final consolidada**

```ts
// src/main/handlers/index.ts
import { ipcMain } from 'electron'
// Uncomment each group as its chunk is implemented:
import { registerRedesHandlers } from './redes'
import { registerLojasHandlers } from './lojas'
import { registerProdutosHandlers } from './produtos'
import { registerPrecosHandlers } from './precos'
import { registerCustosHandlers } from './custos'
import { registerConfiguracoesHandlers } from './configuracoes'
import { registerPedidosHandlers } from './pedidos'
import { registerPrintHandlers } from './print'
import { registerDespesasHandlers } from './despesas'
import { registerRelatoriosHandlers } from './relatorios'

export function registerAllHandlers() {
  // Ping for IPC smoke test
  ipcMain.handle('ping', () => 'pong')
  // Comment out handlers not yet implemented:
  registerRedesHandlers()
  registerLojasHandlers()
  registerProdutosHandlers()
  registerPrecosHandlers()
  registerCustosHandlers()
  registerConfiguracoesHandlers()
  registerPedidosHandlers()
  registerPrintHandlers()
  registerDespesasHandlers()
  registerRelatoriosHandlers()
}
```

- [ ] **Step 4: Atualizar main/index.ts**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerAllHandlers } from './handlers'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  runMigrations()
  seedIfEmpty()
  registerAllHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: preload IPC bridge and handler registration"
```

---

### Task 6: App shell — Layout + Sidebar + Routing

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/Layout.tsx`
- Create: `src/renderer/src/components/Sidebar.tsx`
- Create placeholder pages for all routes

- [ ] **Step 1: Criar App.tsx com HashRouter**

```tsx
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Lancamentos from './pages/Lancamentos'
import Historico from './pages/Historico'
import Despesas from './pages/Despesas'
import Cadastros from './pages/cadastros'
import Quinzena from './pages/relatorios/Quinzena'
import Financeiro from './pages/relatorios/Financeiro'

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/lancamentos" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/relatorios/quinzena" element={<Quinzena />} />
          <Route path="/relatorios/financeiro" element={<Financeiro />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/cadastros" element={<Cadastros />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
```

- [ ] **Step 2: Criar Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, History, BarChart2, TrendingUp, Receipt, Settings } from 'lucide-react'

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/lancamentos', icon: ClipboardList, label: 'Lançamentos' },
  { to: '/historico', icon: History, label: 'Histórico' },
  { to: '/relatorios/quinzena', icon: BarChart2, label: 'Quinzena' },
  { to: '/relatorios/financeiro', icon: TrendingUp, label: 'Financeiro' },
  { to: '/despesas', icon: Receipt, label: 'Despesas' },
  { to: '/cadastros', icon: Settings, label: 'Cadastros' },
]

export default function Sidebar() {
  return (
    <nav className="w-52 min-h-screen bg-gray-900 text-white flex flex-col py-4">
      <div className="px-4 py-3 mb-4 border-b border-gray-700">
        <h1 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Sistema de Vendas</h1>
      </div>
      {links.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`
          }
        >
          <Icon size={18} />{label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Criar Layout.tsx**

```tsx
import Sidebar from './Sidebar'
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Criar placeholders para todas as páginas**

Create these files each returning `<div>Página em construção</div>`:
- `src/renderer/src/pages/Dashboard.tsx`
- `src/renderer/src/pages/Lancamentos.tsx`
- `src/renderer/src/pages/Historico.tsx`
- `src/renderer/src/pages/Despesas.tsx`
- `src/renderer/src/pages/cadastros/index.tsx`
- `src/renderer/src/pages/relatorios/Quinzena.tsx`
- `src/renderer/src/pages/relatorios/Financeiro.tsx`

- [ ] **Step 5: Verify app navigates between pages without errors**

```bash
npm run build
```

Expected: Build succeeds. Sidebar visible, routes work.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: app shell with sidebar navigation and route placeholders"
```

---

## Chunk 3: Cadastros

### Task 7: Handlers de cadastro

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/client.ts`
- Create: `src/main/db/migrate.ts`
- Create: `src/main/db/seed.ts`
- Create: `tests/setup.ts`
- Create: `src/main/handlers/redes.ts`
- Create: `src/main/handlers/lojas.ts`
- Create: `src/main/handlers/produtos.ts`
- Create: `src/main/handlers/precos.ts`
- Create: `src/main/handlers/custos.ts`
- Create: `src/main/handlers/configuracoes.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Criar schema.ts**

```ts
// src/main/db/schema.ts
import { sqliteTable, integer, text, real, unique } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'

export const redes = sqliteTable('redes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  cor_tema: text('cor_tema').default('#1a7a3a'),
  ativo: integer('ativo').default(1),
})

export const lojas = sqliteTable('lojas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').notNull().references(() => redes.id),
  nome: text('nome').notNull(),
  codigo: text('codigo'),
  ativo: integer('ativo').default(1),
})

export const produtos = sqliteTable('produtos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  unidade: text('unidade').notNull(),
  ordem_exibicao: integer('ordem_exibicao').default(0),
  ativo: integer('ativo').default(1),
})

export const pedidos = sqliteTable('pedidos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').notNull().references(() => redes.id),
  loja_id: integer('loja_id').notNull().references(() => lojas.id),
  data_pedido: text('data_pedido').notNull(),
  numero_oc: text('numero_oc').notNull(),
  observacoes: text('observacoes'),
  criado_em: text('criado_em').default(sql`(datetime('now'))`),
}, (t) => ({
  uniquePedido: unique().on(t.rede_id, t.loja_id, t.data_pedido, t.numero_oc),
}))

export const itensPedido = sqliteTable('itens_pedido', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pedido_id: integer('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  produto_id: integer('produto_id').notNull().references(() => produtos.id),
  quantidade: real('quantidade').notNull(),
  preco_unit: real('preco_unit').notNull(),
  custo_unit: real('custo_unit').notNull(),
})

export const precos = sqliteTable('precos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  produto_id: integer('produto_id').notNull().references(() => produtos.id),
  loja_id: integer('loja_id').notNull().references(() => lojas.id),
  preco_venda: real('preco_venda').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
})

export const custos = sqliteTable('custos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  produto_id: integer('produto_id').notNull().references(() => produtos.id),
  custo_compra: real('custo_compra').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
})

export const despesas = sqliteTable('despesas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data').notNull(),
  categoria: text('categoria').notNull(),
  rede_id: integer('rede_id').references(() => redes.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  descricao: text('descricao'),
  valor: real('valor').notNull(),
})

export const configuracoes = sqliteTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor'),
})

// Drizzle relations (required for db.query.*.findMany with `with:`)
export const redesRelations = relations(redes, ({ many }) => ({
  lojas: many(lojas), produtos: many(produtos), pedidos: many(pedidos),
}))
export const lojasRelations = relations(lojas, ({ one, many }) => ({
  rede: one(redes, { fields: [lojas.rede_id], references: [redes.id] }),
  pedidos: many(pedidos),
}))
export const produtosRelations = relations(produtos, ({ one, many }) => ({
  rede: one(redes, { fields: [produtos.rede_id], references: [redes.id] }),
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
```

- [ ] **Step 2: Criar client.ts**

```ts
// src/main/db/client.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import { app } from 'electron'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db
  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'programa.db')
    : path.join(process.cwd(), 'dev.db')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}
```

- [ ] **Step 3: Criar migrate.ts**

```ts
// src/main/db/migrate.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import { app } from 'electron'
import { getDb } from './client'

export function runMigrations() {
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle/migrations')
    : path.join(process.cwd(), 'drizzle/migrations')
  migrate(getDb(), { migrationsFolder })
}
```

- [ ] **Step 4: Criar seed.ts**

```ts
// src/main/db/seed.ts
import { getDb } from './client'
import { redes, produtos, configuracoes } from './schema'

export function seedIfEmpty() {
  const db = getDb()
  const existingRedes = db.select().from(redes).all()
  if (existingRedes.length > 0) return

  db.insert(configuracoes).values([
    { chave: 'nome_fornecedor', valor: 'HENRIQUE' },
    { chave: 'telefone', valor: '98127-2205' },
  ]).run()

  const [subway] = db.insert(redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).returning().all()
  const [bobs] = db.insert(redes).values({ nome: "Bob's", cor_tema: '#c0392b' }).returning().all()

  db.insert(produtos).values([
    { rede_id: subway.id, nome: 'ALFACE', unidade: 'UN', ordem_exibicao: 1 },
    { rede_id: subway.id, nome: 'CEBOLA ROXA', unidade: 'KG', ordem_exibicao: 2 },
    { rede_id: subway.id, nome: 'PEPINO', unidade: 'KG', ordem_exibicao: 3 },
    { rede_id: subway.id, nome: 'PIMENTÃO', unidade: 'KG', ordem_exibicao: 4 },
    { rede_id: subway.id, nome: 'TOMATE', unidade: 'KG', ordem_exibicao: 5 },
  ]).run()

  db.insert(produtos).values([
    { rede_id: bobs.id, nome: 'ALFACE USA', unidade: 'UN', ordem_exibicao: 1 },
    { rede_id: bobs.id, nome: 'ALFACE', unidade: 'UN', ordem_exibicao: 2 },
    { rede_id: bobs.id, nome: 'CEBOLA', unidade: 'KG', ordem_exibicao: 3 },
    { rede_id: bobs.id, nome: 'CEBOLA ROXA', unidade: 'KG', ordem_exibicao: 4 },
    { rede_id: bobs.id, nome: 'TOMATE', unidade: 'KG', ordem_exibicao: 5 },
    { rede_id: bobs.id, nome: 'REPOLHO BRANCO', unidade: 'KG', ordem_exibicao: 6 },
  ]).run()
}
```

- [ ] **Step 5: Criar tests/setup.ts**

```ts
// tests/setup.ts
// Factory for isolated in-memory test databases. Import directly in test files.
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../src/main/db/schema'
import path from 'path'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle/migrations') })
  return db
}
```

- [ ] **Step 6: Criar drizzle.config.ts e gerar migration**

```ts
// drizzle.config.ts
import type { Config } from 'drizzle-kit'
export default {
  schema: './src/main/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: './dev.db' },
} satisfies Config
```

```bash
npx drizzle-kit generate
```

Expected: `drizzle/migrations/0000_initial.sql` created with all tables and UNIQUE constraint on pedidos.

- [ ] **Step 7: Criar handlers redes.ts, lojas.ts, produtos.ts, precos.ts, custos.ts, configuracoes.ts**

redes.ts:
```ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { redes } from '../db/schema'
import { eq } from 'drizzle-orm'

export function registerRedesHandlers() {
  ipcMain.handle(IPC.REDES_LIST, () => getDb().select().from(redes).all())
  ipcMain.handle(IPC.REDES_CREATE, (_e, data: { nome: string; cor_tema: string }) =>
    getDb().insert(redes).values({ ...data, ativo: 1 }).returning().all()[0])
  ipcMain.handle(IPC.REDES_UPDATE, (_e, id: number, data: Partial<typeof redes.$inferInsert>) =>
    getDb().update(redes).set(data).where(eq(redes.id, id)).returning().all()[0])
}
```

lojas.ts:
```ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { lojas } from '../db/schema'
import { eq } from 'drizzle-orm'

export function registerLojasHandlers() {
  ipcMain.handle(IPC.LOJAS_LIST, (_e, redeId?: number) => {
    const db = getDb()
    if (redeId) return db.select().from(lojas).where(eq(lojas.rede_id, redeId)).all()
    return db.select().from(lojas).all()
  })
  ipcMain.handle(IPC.LOJAS_CREATE, (_e, data) =>
    getDb().insert(lojas).values({ ...data, ativo: 1 }).returning().all()[0])
  ipcMain.handle(IPC.LOJAS_UPDATE, (_e, id: number, data) =>
    getDb().update(lojas).set(data).where(eq(lojas.id, id)).returning().all()[0])
}
```

produtos.ts:
```ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { produtos } from '../db/schema'
import { eq, asc, or, isNull } from 'drizzle-orm'

export function registerProdutosHandlers() {
  ipcMain.handle(IPC.PRODUTOS_LIST, (_e, redeId?: number) => {
    const db = getDb()
    if (redeId) {
      return db.select().from(produtos)
        .where(or(eq(produtos.rede_id, redeId), isNull(produtos.rede_id)))
        .orderBy(asc(produtos.ordem_exibicao)).all()
    }
    return db.select().from(produtos).orderBy(asc(produtos.ordem_exibicao)).all()
  })
  ipcMain.handle(IPC.PRODUTOS_CREATE, (_e, data) =>
    getDb().insert(produtos).values({ ...data, ativo: 1 }).returning().all()[0])
  ipcMain.handle(IPC.PRODUTOS_UPDATE, (_e, id: number, data) =>
    getDb().update(produtos).set(data).where(eq(produtos.id, id)).returning().all()[0])
}
```

precos.ts:
```ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { precos } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export function registerPrecosHandlers() {
  ipcMain.handle(IPC.PRECOS_LIST, () => getDb().select().from(precos).all())
  ipcMain.handle(IPC.PRECOS_BY_LOJA, (_e, lojaId: number) =>
    getDb().select().from(precos)
      .where(and(eq(precos.loja_id, lojaId), isNull(precos.vigencia_fim))).all())
  ipcMain.handle(IPC.PRECOS_UPSERT, (_e, data) => {
    const db = getDb()
    if (data.id) {
      db.update(precos).set({ vigencia_fim: new Date().toISOString().split('T')[0] })
        .where(eq(precos.id, data.id)).run()
    }
    return db.insert(precos).values({
      produto_id: data.produto_id, loja_id: data.loja_id,
      preco_venda: data.preco_venda,
      vigencia_inicio: data.vigencia_inicio ?? new Date().toISOString().split('T')[0],
      vigencia_fim: null,
    }).returning().all()[0]
  })
}
```

custos.ts:
```ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { custos } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export function registerCustosHandlers() {
  ipcMain.handle(IPC.CUSTOS_LIST, () => getDb().select().from(custos).all())
  ipcMain.handle(IPC.CUSTOS_UPSERT, (_e, data) => {
    const db = getDb()
    if (data.id) {
      db.update(custos).set({ vigencia_fim: new Date().toISOString().split('T')[0] })
        .where(eq(custos.id, data.id)).run()
    }
    return db.insert(custos).values({
      produto_id: data.produto_id, custo_compra: data.custo_compra,
      vigencia_inicio: data.vigencia_inicio ?? new Date().toISOString().split('T')[0],
      vigencia_fim: null,
    }).returning().all()[0]
  })
}

export function getCustoVigente(db: ReturnType<typeof getDb>, produtoId: number): number {
  return db.select().from(custos)
    .where(and(eq(custos.produto_id, produtoId), isNull(custos.vigencia_fim)))
    .all()[0]?.custo_compra ?? 0
}
```

configuracoes.ts:
```ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { configuracoes } from '../db/schema'
import { eq } from 'drizzle-orm'

export function registerConfiguracoesHandlers() {
  ipcMain.handle(IPC.CONFIG_GET, (_e, chave: string) =>
    getDb().select().from(configuracoes).where(eq(configuracoes.chave, chave)).all()[0]?.valor)
  ipcMain.handle(IPC.CONFIG_SET, (_e, chave: string, valor: string) =>
    getDb().insert(configuracoes).values({ chave, valor })
      .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } }).run())
}
```

- [ ] **Step 8: Write tests/handlers/cadastros.test.ts and run**

```ts
// tests/handlers/cadastros.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../setup'
import { redes, lojas, produtos } from '../../src/main/db/schema'
import { eq } from 'drizzle-orm'

describe('Cadastros', () => {
  let db: ReturnType<typeof createTestDb>
  beforeEach(() => { db = createTestDb() })

  it('insere e lista redes', () => {
    db.insert(redes).values({ nome: 'Teste', cor_tema: '#000', ativo: 1 }).run()
    expect(db.select().from(redes).all()).toHaveLength(1)
  })

  it('insere loja vinculada a rede', () => {
    const [rede] = db.insert(redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).returning().all()
    db.insert(lojas).values({ rede_id: rede.id, nome: 'Loja A', ativo: 1 }).run()
    expect(db.select().from(lojas).all()[0].rede_id).toBe(rede.id)
  })

  it('lista apenas produtos ativos', () => {
    const [rede] = db.insert(redes).values({ nome: 'R', cor_tema: '#fff' }).returning().all()
    db.insert(produtos).values([
      { rede_id: rede.id, nome: 'A', unidade: 'KG', ativo: 1 },
      { rede_id: rede.id, nome: 'B', unidade: 'KG', ativo: 0 },
    ]).run()
    expect(db.select().from(produtos).where(eq(produtos.ativo, 1)).all()).toHaveLength(1)
  })
})
```

```bash
npx vitest run tests/handlers/cadastros.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: db schema, handlers and tests for cadastros"
```

---

### Task 8: Hook genérico de IPC + Tela de Cadastros

**Files:**
- Create: `src/renderer/src/hooks/useApi.ts`
- Create: `src/renderer/src/pages/cadastros/index.tsx`
- Create: `src/renderer/src/pages/cadastros/Redes.tsx`
- Create: `src/renderer/src/pages/cadastros/Lojas.tsx`
- Create: `src/renderer/src/pages/cadastros/Produtos.tsx`
- Create: `src/renderer/src/pages/cadastros/Precos.tsx`
- Create: `src/renderer/src/pages/cadastros/Custos.tsx`

- [ ] **Step 1: Criar useApi.ts**

```ts
// src/renderer/src/hooks/useApi.ts
import { useState, useEffect, useCallback } from 'react'

export function useQuery<T>(channel: string, ...args: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electron.invoke<T>(channel, ...args)
      setData(result)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [channel, JSON.stringify(args)])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

export async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electron.invoke<T>(channel, ...args)
}
```

- [ ] **Step 2: Criar cadastros/index.tsx com sub-abas**

```tsx
import { useState } from 'react'
import Redes from './Redes'
import Lojas from './Lojas'
import Produtos from './Produtos'
import Precos from './Precos'
import Custos from './Custos'

const tabs = ['Redes', 'Lojas', 'Produtos', 'Preços', 'Custos'] as const
type Tab = typeof tabs[number]
const components: Record<Tab, React.ComponentType> = { Redes, Lojas, Produtos, 'Preços': Precos, Custos }

export default function Cadastros() {
  const [active, setActive] = useState<Tab>('Redes')
  const Component = components[active]
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Cadastros</h2>
      <div className="flex border-b mb-4">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActive(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab}</button>
        ))}
      </div>
      <Component />
    </div>
  )
}
```

- [ ] **Step 3: Criar Redes.tsx, Lojas.tsx, Produtos.tsx, Precos.tsx, Custos.tsx with AG Grid inline editing**

Each follows the same pattern as Redes.tsx below. Adapt for the entity's fields:

```tsx
// src/renderer/src/pages/cadastros/Redes.tsx
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { useQuery, invoke } from '../../hooks/useApi'
import { IPC } from '../../../../shared/ipc-channels'
import type { Rede } from '../../../../shared/types'
import { useCallback } from 'react'

export default function Redes() {
  const { data: redes, refetch } = useQuery<Rede[]>(IPC.REDES_LIST)
  const columnDefs = [
    { field: 'nome', headerName: 'Nome', editable: true, flex: 2 },
    { field: 'cor_tema', headerName: 'Cor (hex)', editable: true, flex: 1 },
    { field: 'ativo', headerName: 'Ativo', editable: true, flex: 1, cellRenderer: (p: any) => p.value ? 'Sim' : 'Não' },
  ]
  const onCellValueChanged = useCallback(async (e: any) => {
    await invoke(IPC.REDES_UPDATE, e.data.id, { [e.colDef.field]: e.newValue })
    refetch()
  }, [refetch])
  const addRow = async () => {
    await invoke(IPC.REDES_CREATE, { nome: 'Nova Rede', cor_tema: '#000000' })
    refetch()
  }
  return (
    <div>
      <button onClick={addRow} className="mb-3 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">+ Nova Rede</button>
      <div className="ag-theme-alpine" style={{ height: 400 }}>
        <AgGridReact rowData={redes ?? []} columnDefs={columnDefs} onCellValueChanged={onCellValueChanged} stopEditingWhenCellsLoseFocus />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: cadastros screen with AG Grid inline editing"
```

---

## Chunk 4: Lançamentos

### Task 9: Pedidos service + handler

**Files:**
- Create: `src/main/services/pedidos.service.ts`
- Create: `src/main/handlers/pedidos.ts`
- Create: `tests/services/pedidos.service.test.ts`

- [ ] **Step 1: Criar pedidos.service.ts**

```ts
// src/main/services/pedidos.service.ts
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { pedidos, itensPedido } from '../db/schema'
import type { SalvarPedidoInput } from '../../shared/types'
import type { getDb } from '../db/client'

type Db = ReturnType<typeof getDb>

export class PedidosService {
  constructor(private db: Db) {}

  salvarPedido(input: SalvarPedidoInput) {
    const { itens, ...pedidoData } = input
    const [pedido] = this.db.insert(pedidos).values(pedidoData).returning().all()
    if (itens.length > 0) {
      this.db.insert(itensPedido).values(
        itens.map(item => ({ ...item, pedido_id: pedido.id }))
      ).run()
    }
    return pedido
  }

  atualizarPedido(pedidoId: number, input: SalvarPedidoInput) {
    const { itens, ...pedidoData } = input
    this.db.update(pedidos).set(pedidoData).where(eq(pedidos.id, pedidoId)).run()
    this.db.delete(itensPedido).where(eq(itensPedido.pedido_id, pedidoId)).run()
    if (itens.length > 0) {
      this.db.insert(itensPedido).values(
        itens.map(item => ({ ...item, pedido_id: pedidoId }))
      ).run()
    }
    return this.db.select().from(pedidos).where(eq(pedidos.id, pedidoId)).all()[0]
  }

  getPedidosByDateRede(data: string, redeId: number) {
    return this.db.query.pedidos.findMany({
      where: and(eq(pedidos.data_pedido, data), eq(pedidos.rede_id, redeId)),
      with: { itensPedido: { with: { produto: true } } },
    })
  }

  deletarPedido(pedidoId: number) {
    this.db.delete(itensPedido).where(eq(itensPedido.pedido_id, pedidoId)).run()
    this.db.delete(pedidos).where(eq(pedidos.id, pedidoId)).run()
  }

  checkDuplicate(redeId: number, lojaId: number, data: string, oc: string): boolean {
    return this.db.select().from(pedidos)
      .where(and(eq(pedidos.rede_id, redeId), eq(pedidos.loja_id, lojaId),
        eq(pedidos.data_pedido, data), eq(pedidos.numero_oc, oc))).all().length > 0
  }

  listPedidos(filters: { rede_id?: number; loja_id?: number; data_inicio?: string; data_fim?: string; numero_oc?: string }) {
    const conditions = []
    if (filters.rede_id) conditions.push(eq(pedidos.rede_id, filters.rede_id))
    if (filters.loja_id) conditions.push(eq(pedidos.loja_id, filters.loja_id))
    if (filters.data_inicio) conditions.push(gte(pedidos.data_pedido, filters.data_inicio))
    if (filters.data_fim) conditions.push(lte(pedidos.data_pedido, filters.data_fim))
    if (filters.numero_oc) conditions.push(eq(pedidos.numero_oc, filters.numero_oc))
    return this.db.select().from(pedidos)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(pedidos.data_pedido)).all()
  }
}
```

- [ ] **Step 2: Criar pedidos.ts handler**

```ts
// src/main/handlers/pedidos.ts
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/client'
import { PedidosService } from '../services/pedidos.service'
import { precos, custos } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'

function getPrecoVigente(db: ReturnType<typeof getDb>, produtoId: number, lojaId: number): number {
  return db.select().from(precos)
    .where(and(eq(precos.produto_id, produtoId), eq(precos.loja_id, lojaId), isNull(precos.vigencia_fim)))
    .all()[0]?.preco_venda ?? 0
}

function getCustoVigente(db: ReturnType<typeof getDb>, produtoId: number): number {
  return db.select().from(custos)
    .where(and(eq(custos.produto_id, produtoId), isNull(custos.vigencia_fim)))
    .all()[0]?.custo_compra ?? 0
}

function resolveItens(db: ReturnType<typeof getDb>, lojaId: number, itens: Array<{ produto_id: number; quantidade: number; preco_unit?: number; custo_unit?: number }>) {
  return itens.map(item => ({
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unit: item.preco_unit ?? getPrecoVigente(db, item.produto_id, lojaId),
    custo_unit: item.custo_unit ?? getCustoVigente(db, item.produto_id),
  }))
}

export function registerPedidosHandlers() {
  ipcMain.handle(IPC.PEDIDOS_BY_DATE_REDE, (_e, data: string, redeId: number) =>
    new PedidosService(getDb()).getPedidosByDateRede(data, redeId))

  ipcMain.handle(IPC.PEDIDOS_CREATE, (_e, input) => {
    const db = getDb()
    return new PedidosService(db).salvarPedido({ ...input, itens: resolveItens(db, input.loja_id, input.itens) })
  })

  ipcMain.handle(IPC.PEDIDOS_UPDATE, (_e, id: number, input) => {
    const db = getDb()
    return new PedidosService(db).atualizarPedido(id, { ...input, itens: resolveItens(db, input.loja_id, input.itens) })
  })

  ipcMain.handle(IPC.PEDIDOS_DELETE, (_e, id: number) =>
    new PedidosService(getDb()).deletarPedido(id))

  ipcMain.handle(IPC.PEDIDOS_CHECK_DUPLICATE, (_e, redeId, lojaId, data, oc) =>
    new PedidosService(getDb()).checkDuplicate(redeId, lojaId, data, oc))

  ipcMain.handle(IPC.PEDIDOS_LIST, (_e, filters) =>
    new PedidosService(getDb()).listPedidos(filters ?? {}))
}
```

- [ ] **Step 3: Write tests and run**

```ts
// tests/services/pedidos.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../setup'
import { PedidosService } from '../../src/main/services/pedidos.service'
import { redes, lojas, produtos, precos, custos, itensPedido } from '../../src/main/db/schema'
import { eq } from 'drizzle-orm'

describe('PedidosService', () => {
  let db: ReturnType<typeof createTestDb>
  let service: PedidosService
  let redeId: number, lojaId: number, produtoId: number

  beforeEach(() => {
    db = createTestDb()
    service = new PedidosService(db)
    const [rede] = db.insert(redes).values({ nome: 'Subway', cor_tema: '#1a7a3a' }).returning().all()
    const [loja] = db.insert(lojas).values({ rede_id: rede.id, nome: 'Loja A', ativo: 1 }).returning().all()
    const [produto] = db.insert(produtos).values({ rede_id: rede.id, nome: 'ALFACE', unidade: 'UN', ordem_exibicao: 1, ativo: 1 }).returning().all()
    db.insert(precos).values({ produto_id: produto.id, loja_id: loja.id, preco_venda: 3.00, vigencia_inicio: '2026-01-01' }).run()
    db.insert(custos).values({ produto_id: produto.id, custo_compra: 2.00, vigencia_inicio: '2026-01-01' }).run()
    redeId = rede.id; lojaId = loja.id; produtoId = produto.id
  })

  it('salva um pedido com itens', () => {
    const pedido = service.salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC00001',
      itens: [{ produto_id: produtoId, quantidade: 20, preco_unit: 3.00, custo_unit: 2.00 }],
    })
    expect(pedido.id).toBeDefined()
  })

  it('detecta duplicata de OC', () => {
    service.salvarPedido({ rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC00001', itens: [] })
    expect(service.checkDuplicate(redeId, lojaId, '2026-03-17', 'OC00001')).toBe(true)
  })

  it('atualiza pedido existente', () => {
    const pedido = service.salvarPedido({
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC001',
      itens: [{ produto_id: produtoId, quantidade: 10, preco_unit: 3, custo_unit: 2 }],
    })
    service.atualizarPedido(pedido.id, {
      rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC001',
      itens: [{ produto_id: produtoId, quantidade: 25, preco_unit: 3, custo_unit: 2 }],
    })
    const itens = db.select().from(itensPedido).where(eq(itensPedido.pedido_id, pedido.id)).all()
    expect(itens).toHaveLength(1)
    expect(itens[0].quantidade).toBe(25)
  })

  it('listPedidos filtra por rede_id', () => {
    service.salvarPedido({ rede_id: redeId, loja_id: lojaId, data_pedido: '2026-03-17', numero_oc: 'OC001', itens: [] })
    const result = service.listPedidos({ rede_id: redeId })
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(p => p.rede_id === redeId)).toBe(true)
  })
})
```

```bash
npx vitest run tests/services/pedidos.service.test.ts
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: pedidos service with tests and IPC handler"
```

---

### Task 10: Tela de Lançamentos

**Files:**
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

Implement the daily matrix screen:
- Date selector at top
- Network tabs (one per rede, using rede's cor_tema when active)
- AG Grid: rows = stores, columns = products + OC column + print action
- Column totals in header row (updated in real-time)
- onCellValueChanged triggers autosave
- [Imprimir] button per row calls invoke(IPC.PRINT_PEDIDO, pedido_id)
- Stores without any quantity appear faded but remain visible
- No tabToNextCell override (use AG Grid default Tab behavior)

Key renderer code for sending items (use undefined for price so handler resolves):
```ts
itens: produtos.filter(p => row.quantidades[p.id] != null && row.quantidades[p.id]! > 0)
  .map(p => ({ produto_id: p.id, quantidade: row.quantidades[p.id]!, preco_unit: undefined, custo_unit: undefined }))
```

- [ ] **Step 1: Implement Lancamentos.tsx with full matrix grid**
- [ ] **Step 2: Verify in app (npm run build, no errors)**
- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: lancamentos daily matrix screen with auto-save"
```

---

## Chunk 5: Impressão

### Task 11: Template de impressão 2 vias

Create `src/renderer/src/components/PrintDocument.tsx` with the exact layout matching the user's original document:
- Two identical copies side by side (A4 landscape)
- Header: supplier name + phone + network + store, OC and date in bordered boxes
- Product table: PRODUTO | Quantidade | Unidade | Valor | TOTAL
- Products with no quantity show "-" in qty and total, keep price
- Filler blank rows to fill space (minimum 12 rows total)
- Footer: TOTAL in bordered box + signature line

Create `src/main/services/print.service.ts` and `src/main/handlers/print.ts` to open a hidden Electron window, load the PrintDocument component, and call window.print().

Add `/print` route to App.tsx with a `PrintWindow.tsx` page that receives data via ipcRenderer.on('print-data').

Commit: `git commit -m "feat: 2-via print document matching original layout"`

---

## Chunk 6: Histórico

### Task 12: Tela de Histórico

Implement `src/renderer/src/pages/Historico.tsx`:
- Date range, rede, loja, OC filters
- AG Grid table with columns: DATA | REDE | LOJA | OC | TOTAL | AÇÕES
- Actions: [Print] [Delete with confirmation]
- listPedidos handler must JOIN lojas and redes tables to include nome fields and calculate total

Commit: `git commit -m "feat: historico screen with filters and delete"`

---

## Chunk 7: Relatórios

### Task 13: Relatórios service

Create `src/main/services/relatorios.service.ts` with:
- `getQuinzena(params)`: queries itens_pedido JOINed with pedidos for the date range (quinzena 1: days 1-15, quinzena 2: days 16-end), returns detalhe array + matriz pivot + totals
- `getFinanceiro(params)`: receita_bruta, custo_produtos, margem_bruta, despesas total, lucro_liquido

Write tests in `tests/services/relatorios.service.test.ts` and run them.

Create `src/main/handlers/relatorios.ts`.

Commit: `git commit -m "feat: relatorios service with TDD"`

### Task 14: Telas de Relatório + Exportação

Implement `src/renderer/src/pages/relatorios/Quinzena.tsx`:
- Left panel: detail by order (date, OC, product, qty, price, total)
- Right panel: pivot matrix (date × product = quantity), totals row, price row, value row
- Summary: TOTAL VENDAS / TOTAL CUSTO / MARGEM
- Excel export using ExcelJS (two sheets: Detalhe and Matriz)

Implement `src/renderer/src/pages/relatorios/Financeiro.tsx`:
- Cards: RECEITA BRUTA, CUSTO PRODUTOS, MARGEM BRUTA (%), DESPESAS, LUCRO LÍQUIDO (%)
- Table by rede and top lojas

Commit: `git commit -m "feat: quinzena and financeiro report screens with Excel export"`

---

## Chunk 8: Despesas + Dashboard + Build

### Task 15: Tela de Despesas

Create `src/main/handlers/despesas.ts` (CRUD: list with filters, create, update, delete).
Implement `src/renderer/src/pages/Despesas.tsx` with AG Grid inline editing.

Commit: `git commit -m "feat: despesas screen with inline CRUD"`

### Task 16: Dashboard

Implement `src/renderer/src/pages/Dashboard.tsx` with metric cards:
- Vendas do dia, vendas da quinzena, despesas da quinzena, margem bruta, lucro líquido, top 5 lojas

Commit: `git commit -m "feat: dashboard with key financial metrics"`

### Task 17: Build para Mac e Windows

Create `electron-builder.config.js`:
```js
module.exports = {
  appId: 'com.henrique.sistema-vendas',
  productName: 'Sistema de Vendas',
  directories: { output: 'release' },
  extraResources: [{ from: 'drizzle/migrations', to: 'drizzle/migrations' }],
  mac: { target: 'dmg', category: 'public.app-category.business' },
  win: { target: 'nsis' },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
}
```

Add to package.json:
```json
"build:mac": "npm run build && electron-builder --mac",
"build:win": "npm run build && electron-builder --win"
```

Commit: `git commit -m "feat: electron-builder config for Mac and Windows distribution"`

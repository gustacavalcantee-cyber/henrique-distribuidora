# Estoque — Histórico e Auto-Carry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar histórico de estoque persistido em SQLite/Supabase com auto-carry-forward (CONTEM de hoje = S/F de ontem) e tabela de histórico abaixo da tabela principal.

**Architecture:** Nova tabela `estoque_entradas (produto_id, data, quantidade)` sincronizada via Supabase usando o padrão push/pull já existente. Um único handler IPC calcula o carry-forward e o histórico no processo principal. O frontend substitui localStorage pelo novo IPC e exibe o histórico abaixo.

**Tech Stack:** better-sqlite3, Drizzle ORM, React, TypeScript, Supabase REST

**Spec:** `docs/superpowers/specs/2026-03-26-estoque-historico-design.md`

---

## Chunk 1: Banco de dados e IPC

### Task 1: Tabela SQLite `estoque_entradas`

**Files:**
- Modify: `src/main/db/schema-local.ts`
- Modify: `src/main/db/client-local.ts`

- [ ] **Step 1: Adicionar tabela no schema Drizzle**

Em `src/main/db/schema-local.ts`, adicionar após a definição de `layoutConfig`:

```typescript
export const estoqueEntradas = sqliteTable(
  'estoque_entradas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    produto_id: integer('produto_id').notNull().references(() => produtos.id),
    data: text('data').notNull(),           // 'YYYY-MM-DD'
    quantidade: real('quantidade').notNull(),
    synced: integer('synced').default(0),
    device_id: text('device_id'),
    updated_at: text('updated_at'),
  },
  (t) => ({
    uniqueEntrada: uniqueIndex('uq_estoque_entrada').on(t.produto_id, t.data),
  })
)
```

- [ ] **Step 2: Adicionar migração em `client-local.ts`**

Dentro do bloco `sqlite.exec(...)` em `initSchema`, logo após o `CREATE TABLE IF NOT EXISTS layout_config`:

```sql
CREATE TABLE IF NOT EXISTS estoque_entradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  data TEXT NOT NULL,
  quantidade REAL NOT NULL,
  synced INTEGER DEFAULT 0,
  device_id TEXT,
  updated_at TEXT,
  UNIQUE(produto_id, data)
);
```

- [ ] **Step 3: Build TypeScript para verificar**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema-local.ts src/main/db/client-local.ts
git commit -m "feat: add estoque_entradas table schema and migration"
```

---

### Task 2: Canais IPC

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Adicionar canais**

Em `src/shared/ipc-channels.ts`, adicionar antes do `} as const`:

```typescript
ESTOQUE_ENTRADAS_GET: 'estoque:entradasGet',
ESTOQUE_ENTRADA_UPSERT: 'estoque:entradaUpsert',
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat: add IPC channels for estoque entradas"
```

---

### Task 3: Handler `ESTOQUE_ENTRADA_UPSERT`

**Files:**
- Modify: `src/main/handlers/estoque.ts`

- [ ] **Step 1: Adicionar imports necessários no topo de `estoque.ts`**

Certificar que os imports existentes incluem `getRawSqlite` e `getDeviceId`. Substituir o bloco de imports atual por:

```typescript
import { ipcMain } from 'electron'
import { getDb, getRawSqlite, getDeviceId } from '../db/client-local'
import { pedidos, itensPedido } from '../db/schema-local'
import { eq, inArray } from 'drizzle-orm'
import { IPC } from '../../shared/ipc-channels'
import { triggerSync } from '../sync/sync.service'
```

- [ ] **Step 2: Adicionar handler `ESTOQUE_ENTRADA_UPSERT`**

Dentro de `registerEstoqueHandlers()`, após o handler existente:

```typescript
ipcMain.handle(IPC.ESTOQUE_ENTRADA_UPSERT, (_event, produtoId: number, data: string, quantidade: number) => {
  const sqlite = getRawSqlite()
  const now = new Date().toISOString()
  const deviceId = getDeviceId()

  sqlite.prepare(`
    INSERT INTO estoque_entradas (produto_id, data, quantidade, synced, device_id, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(produto_id, data) DO UPDATE SET
      quantidade = excluded.quantidade,
      synced = 0,
      device_id = excluded.device_id,
      updated_at = excluded.updated_at
  `).run(produtoId, data, quantidade, deviceId, now)

  triggerSync()
})
```

- [ ] **Step 3: Build TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/estoque.ts
git commit -m "feat: add ESTOQUE_ENTRADA_UPSERT handler"
```

---

### Task 4: Handler `ESTOQUE_ENTRADAS_GET`

**Files:**
- Modify: `src/main/handlers/estoque.ts`

Este handler retorna dois objetos:
- `contem`: CONTEM atual por produto (com flag `auto` indicando carry-forward)
- `history`: últimos 14 dias com entradas

- [ ] **Step 1: Adicionar handler `ESTOQUE_ENTRADAS_GET` em `registerEstoqueHandlers()`**

```typescript
ipcMain.handle(IPC.ESTOQUE_ENTRADAS_GET, (_event, data: string, produtoIds: number[]) => {
  if (!produtoIds || produtoIds.length === 0) return { contem: {}, history: [] }

  const sqlite = getRawSqlite()
  const contem: Record<number, { quantidade: number; auto: boolean }> = {}

  for (const prodId of produtoIds) {
    // Tenta entrada exata para esta data
    const exact = sqlite.prepare(
      'SELECT quantidade FROM estoque_entradas WHERE produto_id = ? AND data = ?'
    ).get(prodId, data) as { quantidade: number } | undefined

    if (exact) {
      contem[prodId] = { quantidade: exact.quantidade, auto: false }
      continue
    }

    // Tenta entrada mais recente antes desta data (carry-forward)
    const prev = sqlite.prepare(
      'SELECT data, quantidade FROM estoque_entradas WHERE produto_id = ? AND data < ? ORDER BY data DESC LIMIT 1'
    ).get(prodId, data) as { data: string; quantidade: number } | undefined

    if (prev) {
      const totalRow = sqlite.prepare(`
        SELECT COALESCE(SUM(ip.quantidade), 0) as total
        FROM itens_pedido ip
        JOIN pedidos p ON p.id = ip.pedido_id
        WHERE p.data_pedido = ? AND ip.produto_id = ?
      `).get(prev.data, prodId) as { total: number }

      contem[prodId] = { quantidade: prev.quantidade - totalRow.total, auto: true }
    }
    // Se não há entrada anterior, contem[prodId] fica undefined (campo vazio)
  }

  // Histórico: últimas 14 datas distintas com entradas para esses produtos
  const placeholders = produtoIds.map(() => '?').join(',')
  const entries = sqlite.prepare(
    `SELECT produto_id, data, quantidade
     FROM estoque_entradas
     WHERE produto_id IN (${placeholders})
     ORDER BY data DESC`
  ).all(...produtoIds) as { produto_id: number; data: string; quantidade: number }[]

  const allDates = [...new Set(entries.map(e => e.data))].sort((a, b) => b.localeCompare(a)).slice(0, 14)

  const history: Array<{
    data: string
    produtos: Record<number, { contem: number; total: number; sf: number }>
  }> = []

  for (const d of allDates) {
    const rowProdutos: Record<number, { contem: number; total: number; sf: number }> = {}

    for (const prodId of produtoIds) {
      const entry = entries.find(e => e.produto_id === prodId && e.data === d)
      if (!entry) continue

      const totalRow = sqlite.prepare(`
        SELECT COALESCE(SUM(ip.quantidade), 0) as total
        FROM itens_pedido ip
        JOIN pedidos p ON p.id = ip.pedido_id
        WHERE p.data_pedido = ? AND ip.produto_id = ?
      `).get(d, prodId) as { total: number }

      rowProdutos[prodId] = {
        contem: entry.quantidade,
        total: totalRow.total,
        sf: entry.quantidade - totalRow.total,
      }
    }

    if (Object.keys(rowProdutos).length > 0) {
      history.push({ data: d, produtos: rowProdutos })
    }
  }

  return { contem, history }
})
```

- [ ] **Step 2: Build TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/estoque.ts
git commit -m "feat: add ESTOQUE_ENTRADAS_GET handler with carry-forward and history"
```

---

### Task 5: Sync — push e pull de `estoque_entradas`

**Files:**
- Modify: `src/main/sync/sync.service.ts`

- [ ] **Step 1: Adicionar push em `pushPendingOthers`**

Em `sync.service.ts`, dentro da função `pushPendingOthers`, após o bloco de push do `layout_config` (próximo à linha que termina com `sqlite.prepare('UPDATE layout_config SET synced = 1 WHERE synced = 0').run()`):

```typescript
// Push estoque_entradas where synced=0
const pendingEntradas = sqlite.prepare('SELECT * FROM estoque_entradas WHERE synced = 0').all() as AnyRow[]
if (pendingEntradas.length > 0) {
  await pushTable(supabase, 'estoque_entradas', pendingEntradas, {
    upsertOn: 'produto_id,data',
  })
  sqlite.prepare('UPDATE estoque_entradas SET synced = 1 WHERE synced = 0').run()
}
```

- [ ] **Step 2: Adicionar pull em `pullFromSupabase`**

**2a.** Na linha do `Promise.all` de `pullFromSupabase` (que começa com `const [redes, franqueados, ...]`), adicionar `fetchAllSupabase(supabase, 'estoque_entradas')` ao array e ao destructuring:

```typescript
const [redes, franqueados, lojas, produtos, custos, precos, pedidosRemote, itensPedido, despesas, configuracoes, layoutConfigs, estoqueEntradas] =
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
  ])
```

**2b.** Dentro do bloco `sqlite.transaction(() => { ... })`, após o bloco de `layout_config`, adicionar:

```typescript
// estoque_entradas: upsert por (produto_id, data), skip se local synced=0
for (const row of estoqueEntradas) {
  const existing = sqlite
    .prepare('SELECT synced FROM estoque_entradas WHERE produto_id = ? AND data = ?')
    .get(row['produto_id'], row['data']) as { synced: number } | undefined
  if (existing?.synced === 0) continue
  sqlite.prepare(`
    INSERT INTO estoque_entradas (id, produto_id, data, quantidade, synced, device_id, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(produto_id, data) DO UPDATE SET
      id = excluded.id,
      quantidade = excluded.quantidade,
      synced = 1,
      device_id = excluded.device_id,
      updated_at = excluded.updated_at
  `).run(
    row['id'] ?? null,
    row['produto_id'],
    row['data'],
    row['quantidade'],
    row['device_id'] ?? null,
    row['updated_at'] ?? null
  )
}
```

- [ ] **Step 3: Build TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/main/sync/sync.service.ts
git commit -m "feat: sync estoque_entradas via Supabase push/pull"
```

---

### Task 6: Criar tabela no Supabase (passo manual)

- [ ] **Step 1: Executar no SQL Editor do Supabase**

```sql
CREATE TABLE IF NOT EXISTS estoque_entradas (
  id         BIGSERIAL PRIMARY KEY,
  produto_id BIGINT NOT NULL,
  data       TEXT NOT NULL,
  quantidade REAL NOT NULL,
  synced     INTEGER DEFAULT 1,
  device_id  TEXT,
  updated_at TEXT,
  UNIQUE(produto_id, data)
);
```

Acessar: Supabase → SQL Editor → New query → colar e executar.

---

## Chunk 2: Frontend

### Task 7: EstoqueTab.tsx — carry-forward, auto-save, histórico

**Files:**
- Modify: `src/renderer/src/pages/EstoqueTab.tsx`

Esta é a substituição completa do componente. Preserva toda a estrutura visual atual e adiciona: carry-forward (CONTEM em azul quando automático), auto-save debounced, e tabela de histórico abaixo.

- [ ] **Step 1: Substituir o conteúdo de `EstoqueTab.tsx`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import type { Rede, Produto } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface EstoqueTabProps {
  dataPedido: string
  redes: Rede[]
  produtos: Produto[]
}

interface ContemEntry { quantidade: number; auto: boolean }
interface HistoryProduto { contem: number; total: number; sf: number }
interface HistoryRow { data: string; produtos: Record<number, HistoryProduto> }
interface EntradasResult {
  contem: Record<number, ContemEntry>
  history: HistoryRow[]
}

function fmtNum(v: number) {
  return (Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function fmtSf(v: number) {
  return (v > 0 ? '+' : '') + fmtNum(v)
}

function sfClass(v: number) {
  if (v > 0) return 'bg-green-100 text-green-800 font-bold'
  if (v < 0) return 'bg-red-100 text-red-800 font-bold'
  return 'bg-yellow-100 text-yellow-800 font-bold'
}

export function EstoqueTab({ dataPedido, redes, produtos }: EstoqueTabProps) {
  const STORAGE_PRODS_KEY = 'estoque_produtos'

  const [selectedProdIds, setSelectedProdIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PRODS_KEY) ?? '[]') } catch { return [] }
  })

  // contem: valor digitado pelo usuário nesta sessão (sobrescreve o DB temporariamente)
  const [contemDraft, setContemDraft] = useState<Record<number, string>>({})
  // dados do DB: contem salvo + flag auto
  const [dbContem, setDbContem] = useState<Record<number, ContemEntry>>({})
  // quantidades de pedidos do dia (por rede → produto)
  const [quantidades, setQuantidades] = useState<Record<number, Record<number, number>>>({})
  // histórico
  const [history, setHistory] = useState<HistoryRow[]>([])

  const [showProdPicker, setShowProdPicker] = useState(false)
  const [prodSearch, setProdSearch] = useState('')

  // Debounce timers para auto-save por produto
  const saveTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const uniqueProdutos = [...produtos]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)

  const selectedProdutos = uniqueProdutos.filter(p => selectedProdIds.includes(p.id))

  // Carrega quantidades de pedidos do dia
  useEffect(() => {
    if (selectedProdIds.length === 0) { setQuantidades({}); return }
    window.electron.invoke<Record<number, Record<number, number>>>(
      IPC.ESTOQUE_QUANTIDADES_DIA, dataPedido, selectedProdIds
    ).then(setQuantidades).catch(() => setQuantidades({}))
  }, [dataPedido, JSON.stringify(selectedProdIds)])

  // Carrega CONTEM do DB e histórico
  useEffect(() => {
    if (selectedProdIds.length === 0) { setDbContem({}); setHistory([]); setContemDraft({}); return }
    window.electron.invoke<EntradasResult>(
      IPC.ESTOQUE_ENTRADAS_GET, dataPedido, selectedProdIds
    ).then(result => {
      setDbContem(result.contem)
      setHistory(result.history)
      // Pré-preenche o draft com valores manuais (não auto)
      const draft: Record<number, string> = {}
      for (const [idStr, entry] of Object.entries(result.contem)) {
        if (!entry.auto) draft[Number(idStr)] = String(entry.quantidade)
      }
      setContemDraft(draft)
    }).catch(() => { setDbContem({}); setHistory([]) })
  }, [dataPedido, JSON.stringify(selectedProdIds)])

  // Reload silencioso quando DB sincroniza (outros dispositivos)
  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => {
      if (selectedProdIds.length === 0) return
      window.electron.invoke<EntradasResult>(
        IPC.ESTOQUE_ENTRADAS_GET, dataPedido, selectedProdIds
      ).then(result => {
        setDbContem(result.contem)
        setHistory(result.history)
      }).catch(() => {})
      window.electron.invoke<Record<number, Record<number, number>>>(
        IPC.ESTOQUE_QUANTIDADES_DIA, dataPedido, selectedProdIds
      ).then(setQuantidades).catch(() => {})
    })
  }, [])

  const handleContemChange = useCallback((prodId: number, value: string) => {
    setContemDraft(prev => ({ ...prev, [prodId]: value }))
    // Auto-save após 1s
    if (saveTimerRef.current[prodId]) clearTimeout(saveTimerRef.current[prodId])
    saveTimerRef.current[prodId] = setTimeout(async () => {
      const qty = parseFloat(value)
      if (isNaN(qty)) return
      await window.electron.invoke(IPC.ESTOQUE_ENTRADA_UPSERT, prodId, dataPedido, qty)
      // Atualiza dbContem localmente (sem reload completo)
      setDbContem(prev => ({ ...prev, [prodId]: { quantidade: qty, auto: false } }))
      // Atualiza histórico
      const result = await window.electron.invoke<EntradasResult>(
        IPC.ESTOQUE_ENTRADAS_GET, dataPedido, selectedProdIds
      )
      setHistory(result.history)
    }, 1000)
  }, [dataPedido, selectedProdIds])

  // Valor exibido no input CONTEM: draft tem prioridade, depois dbContem (auto ou manual)
  const contemValue = (prodId: number): string => {
    if (contemDraft[prodId] !== undefined) return contemDraft[prodId]
    const db = dbContem[prodId]
    if (db) return String(db.quantidade)
    return ''
  }

  // Se o valor veio do carry-forward automático e o usuário não digitou nada
  const isAuto = (prodId: number): boolean => {
    return contemDraft[prodId] === undefined && (dbContem[prodId]?.auto ?? false)
  }

  const handleAddProd = (prodId: number) => {
    const next = [...selectedProdIds, prodId]
    setSelectedProdIds(next)
    localStorage.setItem(STORAGE_PRODS_KEY, JSON.stringify(next))
    setShowProdPicker(false)
    setProdSearch('')
  }

  const handleRemoveProd = (prodId: number) => {
    const next = selectedProdIds.filter(id => id !== prodId)
    setSelectedProdIds(next)
    localStorage.setItem(STORAGE_PRODS_KEY, JSON.stringify(next))
  }

  const totals: Record<number, number> = {}
  for (const prodId of selectedProdIds) {
    totals[prodId] = Object.values(quantidades).reduce((sum, redeQtd) => sum + (redeQtd[prodId] ?? 0), 0)
  }

  const sfValue = (prodId: number): number => {
    const contemVal = parseFloat(contemValue(prodId) || '0') || 0
    return contemVal - (totals[prodId] ?? 0)
  }

  const availableToAdd = uniqueProdutos.filter(p =>
    !selectedProdIds.includes(p.id) &&
    p.nome.toLowerCase().includes(prodSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4" onClick={() => setShowProdPicker(false)}>
      {/* Seletor de produtos */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedProdutos.map(p => (
          <span key={p.id} className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 text-sm rounded-full">
            {p.nome} {p.unidade}
            <button onClick={() => handleRemoveProd(p.id)} className="ml-1 text-emerald-600 hover:text-red-500 font-bold leading-none">×</button>
          </span>
        ))}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowProdPicker(v => !v)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-gray-50"
          >
            <Plus size={13} /> Produto
          </button>
          {showProdPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 min-w-48">
              <input
                autoFocus
                className="w-full px-3 py-2 text-sm border-b outline-none"
                placeholder="Buscar..."
                value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto">
                {availableToAdd.map(p => (
                  <button key={p.id} onClick={() => handleAddProd(p.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {p.nome} <span className="text-gray-400 text-xs">{p.unidade}</span>
                  </button>
                ))}
                {availableToAdd.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedProdutos.length === 0 ? (
        <p className="text-sm text-gray-400">Adicione um produto para ver o controle de estoque.</p>
      ) : (
        <>
          {/* Tabela principal — idêntica à atual */}
          <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-1.5 text-left text-xs text-gray-500 w-36"></th>
                {selectedProdutos.map(p => (
                  <th key={p.id} className="border px-3 py-1.5 text-center text-xs font-semibold w-32">
                    {p.nome}<br /><span className="text-gray-400 font-normal">{p.unidade}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {redes.map(rede => (
                <tr key={rede.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-1.5 font-medium text-gray-700 text-xs whitespace-nowrap">{rede.nome}</td>
                  {selectedProdutos.map(p => {
                    const qty = quantidades[rede.id]?.[p.id] ?? 0
                    return (
                      <td key={p.id} className="border px-3 py-1.5 text-center text-sm">
                        {qty > 0 ? fmtNum(qty) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className="border px-3 py-1.5 text-xs text-gray-600 font-bold">TOTAL</td>
                {selectedProdutos.map(p => (
                  <td key={p.id} className="border px-3 py-1.5 text-center text-sm font-bold">
                    {fmtNum(totals[p.id] ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className="bg-blue-50">
                <td className="border px-3 py-1.5 text-xs text-blue-700 font-semibold">CONTEM</td>
                {selectedProdutos.map(p => (
                  <td key={p.id} className="border px-1 py-0.5">
                    <input
                      type="number"
                      className={`w-full px-1 py-0.5 text-sm text-center border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                        isAuto(p.id)
                          ? 'bg-blue-100 border-blue-300 text-blue-700 italic'
                          : 'bg-white border-blue-200'
                      }`}
                      value={contemValue(p.id)}
                      onChange={e => handleContemChange(p.id, e.target.value)}
                      placeholder="0"
                      title={isAuto(p.id) ? 'Calculado automaticamente do dia anterior' : undefined}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border px-3 py-1.5 text-xs font-semibold text-gray-600">S/F</td>
                {selectedProdutos.map(p => {
                  const sf = sfValue(p.id)
                  return (
                    <td key={p.id} className={`border px-3 py-1.5 text-center text-sm ${sfClass(sf)}`}>
                      {fmtSf(sf)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>

          {/* Tabela de histórico */}
          {history.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Histórico</p>
              <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-3 py-1.5 text-left text-xs text-gray-500 w-28">Data</th>
                    {selectedProdutos.map(p => (
                      <th key={p.id} className="border px-3 py-1.5 text-center text-xs font-semibold w-32">
                        {p.nome}<br /><span className="text-gray-400 font-normal">{p.unidade}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => {
                    const [y, m, d] = row.data.split('-')
                    const dataFmt = `${d}/${m}/${y}`
                    return (
                      <tr key={row.data} className="hover:bg-gray-50">
                        <td className="border px-3 py-1.5 text-xs text-gray-600 whitespace-nowrap font-medium">
                          {dataFmt}
                        </td>
                        {selectedProdutos.map(p => {
                          const entry = row.produtos[p.id]
                          if (!entry) return (
                            <td key={p.id} className="border px-3 py-1.5 text-center text-gray-300">—</td>
                          )
                          return (
                            <td key={p.id} className="border px-2 py-1 text-center">
                              <div className="text-gray-500">C: {fmtNum(entry.contem)}</div>
                              <div className="text-gray-400">T: {fmtNum(entry.total)}</div>
                              <div className={`font-bold text-xs rounded px-1 ${sfClass(entry.sf)}`}>
                                {fmtSf(entry.sf)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/EstoqueTab.tsx
git commit -m "feat: estoque carry-forward, auto-save e historico"
```

---

### Task 8: Version bump e push

- [ ] **Step 1: Bump version em `package.json`**

Incrementar `"version"` de `"1.0.72"` para `"1.0.73"`.

- [ ] **Step 2: Commit e push**

```bash
git add package.json
git commit -m "chore: bump version to 1.0.73"
git push origin main
```

---

## Verificação final

Após o build subir via CI:

- [ ] Abrir o Estoque, adicionar Alface
- [ ] Digitar CONTEM = 500 → verificar que salva após 1s (campo fica branco)
- [ ] Avançar a data para amanhã → verificar que CONTEM aparece em azul com valor = S/F de hoje
- [ ] Verificar que o histórico aparece abaixo com a entrada do dia anterior
- [ ] Verificar no segundo computador que a entrada sincronizou

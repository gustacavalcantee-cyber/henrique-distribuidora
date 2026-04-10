# Telegram Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standalone Telegram bot in `bot/` that queries Supabase and responds to `/resumo`, `/quinzena`, `/pedidos`, and `/precos` commands, running as a pm2 background process on Mac.

**Architecture:** Node.js + TypeScript service that queries Supabase directly using the same credentials as the Electron app. Auth via ALLOWED_CHAT_ID env var. Price list image generated with puppeteer using the same HTML template as the app.

**Tech Stack:** grammy (Telegram), @supabase/supabase-js, puppeteer, tsx (runtime), pm2 (process manager), dotenv

---

## Chunk 1: Scaffold, Supabase client, Bot skeleton

### Task 1: Create bot/ folder structure

**Files:**
- Create: `bot/package.json`
- Create: `bot/tsconfig.json`
- Create: `bot/.env.example`
- Create: `bot/src/` (empty directory placeholder)

- [ ] **Step 1: Create `bot/package.json`**

```json
{
  "name": "henrique-bot",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.4",
    "dotenv": "^16.4.7",
    "grammy": "^1.31.0",
    "puppeteer": "^24.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `bot/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `bot/.env.example`**

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
TELEGRAM_TOKEN=123456789:AAF...
ALLOWED_CHAT_ID=123456789
```

- [ ] **Step 4: Copy `.env.example` to `.env` and fill in real values**

To get `TELEGRAM_TOKEN`:
1. Open Telegram → search `@BotFather`
2. Send `/newbot`, follow prompts, copy the token

To get `ALLOWED_CHAT_ID`:
1. Open Telegram → search `@userinfobot`
2. Send `/start`, copy the `Id:` number shown

`SUPABASE_URL` and `SUPABASE_ANON_KEY` come from the existing project's `.env` or Supabase dashboard.

- [ ] **Step 5: Install dependencies**

```bash
cd bot && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add bot/package.json bot/tsconfig.json bot/.env.example
git commit -m "feat: scaffold bot/ folder"
```

---

### Task 2: Supabase client

**Files:**
- Create: `bot/src/supabase.ts`

- [ ] **Step 1: Create `bot/src/supabase.ts`**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in bot/.env')
  _client = createClient(url, key)
  return _client
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd bot && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/supabase.ts
git commit -m "feat: add Supabase client for bot"
```

---

### Task 3: Bot entry point with auth and /ajuda

**Files:**
- Create: `bot/src/index.ts`

- [ ] **Step 1: Create `bot/src/index.ts`**

```typescript
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../.env') })

import { Bot } from 'grammy'

const token = process.env.TELEGRAM_TOKEN
const allowedChatId = process.env.ALLOWED_CHAT_ID
if (!token) throw new Error('Missing TELEGRAM_TOKEN in bot/.env')
if (!allowedChatId) throw new Error('Missing ALLOWED_CHAT_ID in bot/.env')

export const bot = new Bot(token)

// Auth middleware — only the owner can use the bot
bot.use(async (ctx, next) => {
  if (String(ctx.chat?.id) !== allowedChatId) {
    await ctx.reply('⛔ Acesso negado.')
    return
  }
  await next()
})

bot.command('start', ctx =>
  ctx.reply('Olá! Use /ajuda para ver os comandos disponíveis.'))

bot.command('ajuda', ctx =>
  ctx.reply(
    `*Comandos disponíveis:*\n\n` +
    `/resumo — Financeiro do mês atual\n` +
    `/quinzena 1 — Quinzena 1 do mês atual\n` +
    `/quinzena 2 — Quinzena 2 do mês atual\n` +
    `/quinzena 1 04 2026 — Quinzena específica\n` +
    `/pedidos — Pedidos de hoje\n` +
    `/pedidos Mundi — Pedidos da loja \\(últimos 7 dias\\)\n` +
    `/pedidos Mundi 10\\/04\\/2026 — Pedidos em data específica\n` +
    `/precos — Gera e envia a Lista de Preços`,
    { parse_mode: 'MarkdownV2' }
  ))

bot.start()
console.log('✅ Bot iniciado.')
```

- [ ] **Step 2: Run bot and verify /start and /ajuda work**

```bash
cd bot && npx tsx src/index.ts
```

Open Telegram → send `/start` to your bot → should see welcome message.
Send `/ajuda` → should see the commands list.
Press Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add bot/src/index.ts
git commit -m "feat: bot entry point with auth middleware and /ajuda"
```

---

## Chunk 2: Report service + Commands

### Task 4: Supabase report queries

**Files:**
- Create: `bot/src/services/reports.ts`

- [ ] **Step 1: Create `bot/src/services/reports.ts`**

```typescript
import { getSupabase } from '../supabase'

export interface PedidoRow {
  id: number
  rede_id: number
  loja_id: number
  data_pedido: string
  numero_oc: string
}

export interface ItemRow {
  pedido_id: number
  produto_id: number
  quantidade: number
  preco_unit: number
  custo_unit: number
}

export interface LojaRow { id: number; nome: string; rede_id: number }
export interface RedeRow { id: number; nome: string }
export interface ProdutoRow { id: number; nome: string; unidade: string }
export interface PrecoRow { produto_id: number; loja_id: number; preco_venda: number; vigencia_fim: string | null }

export async function fetchRedes(): Promise<RedeRow[]> {
  const { data, error } = await getSupabase()
    .from('redes').select('id, nome').eq('ativo', 1)
  if (error) throw new Error(`fetchRedes: ${error.message}`)
  return data ?? []
}

export async function fetchLojas(): Promise<LojaRow[]> {
  const { data, error } = await getSupabase()
    .from('lojas').select('id, nome, rede_id').eq('ativo', 1)
  if (error) throw new Error(`fetchLojas: ${error.message}`)
  return data ?? []
}

export async function fetchPedidosRange(
  dataInicio: string,
  dataFim: string,
  redeId?: number
): Promise<PedidoRow[]> {
  let q = getSupabase()
    .from('pedidos')
    .select('id, rede_id, loja_id, data_pedido, numero_oc')
    .gte('data_pedido', dataInicio)
    .lte('data_pedido', dataFim)
  if (redeId) q = q.eq('rede_id', redeId)
  const { data, error } = await q
  if (error) throw new Error(`fetchPedidosRange: ${error.message}`)
  return data ?? []
}

export async function fetchItens(pedidoIds: number[]): Promise<ItemRow[]> {
  if (pedidoIds.length === 0) return []
  const { data, error } = await getSupabase()
    .from('itens_pedido')
    .select('pedido_id, produto_id, quantidade, preco_unit, custo_unit')
    .in('pedido_id', pedidoIds)
  if (error) throw new Error(`fetchItens: ${error.message}`)
  return data ?? []
}

export async function fetchProdutos(ids?: number[]): Promise<ProdutoRow[]> {
  let q = getSupabase()
    .from('produtos')
    .select('id, nome, unidade')
    .eq('ativo', 1)
  if (ids && ids.length > 0) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw new Error(`fetchProdutos: ${error.message}`)
  return data ?? []
}

export async function fetchActivePrecos(): Promise<PrecoRow[]> {
  const { data, error } = await getSupabase()
    .from('precos')
    .select('produto_id, loja_id, preco_venda, vigencia_fim')
    .is('vigencia_fim', null)
  if (error) throw new Error(`fetchActivePrecos: ${error.message}`)
  return data ?? []
}

export async function fetchConfig(chave: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('configuracoes').select('valor').eq('chave', chave).single()
  return data?.valor ?? null
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd bot && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/reports.ts
git commit -m "feat: Supabase query functions for bot reports"
```

---

### Task 5: /resumo command

**Files:**
- Create: `bot/src/commands/resumo.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Create `bot/src/commands/resumo.ts`**

```typescript
import { Context } from 'grammy'
import { fetchPedidosRange, fetchItens, fetchLojas } from '../services/reports'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function handleResumo(ctx: Context): Promise<void> {
  await ctx.reply('⏳ Calculando...')
  try {
    const now = new Date()
    const ano = now.getFullYear()
    const mes = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(ano, now.getMonth() + 1, 0).getDate()
    const dataInicio = `${ano}-${mes}-01`
    const dataFim = `${ano}-${mes}-${lastDay}`

    const pedidos = await fetchPedidosRange(dataInicio, dataFim)
    const itens = await fetchItens(pedidos.map(p => p.id))
    const lojas = await fetchLojas()

    const totalVenda = itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    const totalCusto = itens.reduce((s, i) => s + i.quantidade * i.custo_unit, 0)
    const margem = totalVenda > 0 ? ((totalVenda - totalCusto) / totalVenda) * 100 : 0

    const lojaVenda = new Map<number, number>()
    for (const ped of pedidos) {
      const v = itens
        .filter(i => i.pedido_id === ped.id)
        .reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
      lojaVenda.set(ped.loja_id, (lojaVenda.get(ped.loja_id) ?? 0) + v)
    }
    const topLojas = Array.from(lojaVenda.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, v]) => `• ${lojas.find(l => l.id === id)?.nome ?? id}: R$ ${fmt(v)}`)
      .join('\n')

    const mesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

    await ctx.reply(
      `📊 *Resumo — ${mesNomes[now.getMonth()]} ${ano}*\n\n` +
      `💰 Vendas: R$ ${fmt(totalVenda)}\n` +
      `📦 Custo: R$ ${fmt(totalCusto)}\n` +
      `📈 Margem: ${fmt(margem)}%\n\n` +
      `🏆 *Top Lojas*\n${topLojas || '—'}`,
      { parse_mode: 'Markdown' }
    )
  } catch (err) {
    await ctx.reply(`❌ Erro: ${String(err)}`)
  }
}
```

- [ ] **Step 2: Wire into `bot/src/index.ts` — add after the existing imports block**

Add this import after the existing imports:
```typescript
import { handleResumo } from './commands/resumo'
```

Add this line before `bot.start()`:
```typescript
bot.command('resumo', handleResumo)
```

- [ ] **Step 3: Test**

```bash
cd bot && npx tsx src/index.ts
```

Send `/resumo` in Telegram → should receive financial summary with total sales, cost, margin, top stores.

- [ ] **Step 4: Commit**

```bash
git add bot/src/commands/resumo.ts bot/src/index.ts
git commit -m "feat: /resumo command — monthly financial summary"
```

---

### Task 6: /pedidos command

**Files:**
- Create: `bot/src/commands/pedidos.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Create `bot/src/commands/pedidos.ts`**

```typescript
import { Context } from 'grammy'
import { fetchPedidosRange, fetchItens, fetchLojas, fetchProdutos } from '../services/reports'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export async function handlePedidos(ctx: Context): Promise<void> {
  const args = ctx.match ? String(ctx.match).trim() : ''
  const parts = args.split(/\s+/).filter(Boolean)

  let lojaSearch: string | null = null
  let targetDate: string | null = null

  if (parts.length > 0) {
    const last = parts[parts.length - 1]
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(last)) {
      const [d, m, y] = last.split('/')
      targetDate = `${y}-${m}-${d}`
      lojaSearch = parts.slice(0, -1).join(' ') || null
    } else {
      lojaSearch = parts.join(' ')
    }
  }

  await ctx.reply('⏳ Buscando...')
  try {
    const now = new Date()
    const lojas = await fetchLojas()

    let filteredLojaIds: number[] | null = null
    if (lojaSearch) {
      const matched = lojas.filter(l =>
        l.nome.toLowerCase().includes(lojaSearch!.toLowerCase()))
      if (matched.length === 0) {
        await ctx.reply(`❌ Nenhuma loja encontrada para "${lojaSearch}".`)
        return
      }
      if (matched.length > 3) {
        await ctx.reply(
          `🔍 Várias lojas encontradas:\n${matched.map(l => `• ${l.nome}`).join('\n')}\n\nRefine a busca.`)
        return
      }
      filteredLojaIds = matched.map(l => l.id)
    }

    let dataInicio: string, dataFim: string
    if (targetDate) {
      dataInicio = dataFim = targetDate
    } else if (lojaSearch) {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      dataInicio = d.toISOString().split('T')[0]
      dataFim = now.toISOString().split('T')[0]
    } else {
      dataInicio = dataFim = now.toISOString().split('T')[0]
    }

    let pedidos = await fetchPedidosRange(dataInicio, dataFim)
    if (filteredLojaIds) {
      pedidos = pedidos.filter(p => filteredLojaIds!.includes(p.loja_id))
    }

    if (pedidos.length === 0) {
      await ctx.reply('📦 Nenhum pedido encontrado.')
      return
    }

    const itens = await fetchItens(pedidos.map(p => p.id))
    const produtoIds = [...new Set(itens.map(i => i.produto_id).filter(Boolean) as number[])]
    const produtos = await fetchProdutos(produtoIds)

    const lines: string[] = []
    const title = lojaSearch
      ? `📦 *Pedidos ${lojaSearch}${targetDate ? ` — ${fmtDate(targetDate)}` : ' (últimos 7 dias)'}*\n`
      : `📦 *Pedidos — ${fmtDate(dataFim)}*\n`
    lines.push(title)

    let grandTotal = 0
    const sorted = [...pedidos].sort((a, b) => a.data_pedido.localeCompare(b.data_pedido))
    for (const ped of sorted) {
      const loja = lojas.find(l => l.id === ped.loja_id)
      const pedItens = itens.filter(i => i.pedido_id === ped.id && i.quantidade > 0)
      if (pedItens.length === 0) continue
      const subtotal = pedItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
      grandTotal += subtotal

      lines.push(`📅 ${fmtDate(ped.data_pedido)} — ${loja?.nome ?? ped.loja_id} (OC ${ped.numero_oc})`)
      for (const item of pedItens) {
        const prod = produtos.find(p => p.id === item.produto_id)
        lines.push(`  • ${prod?.nome ?? item.produto_id}: ${fmt(item.quantidade)} × R$${fmt(item.preco_unit)}`)
      }
      lines.push(`  Subtotal: R$ ${fmt(subtotal)}\n`)
    }
    lines.push(`💰 *Total: R$ ${fmt(grandTotal)}*`)

    // Telegram limit is 4096 chars — split if needed
    const text = lines.join('\n')
    if (text.length <= 4096) {
      await ctx.reply(text, { parse_mode: 'Markdown' })
    } else {
      let chunk = ''
      for (const line of lines) {
        if ((chunk + '\n' + line).length > 4000) {
          await ctx.reply(chunk, { parse_mode: 'Markdown' })
          chunk = line
        } else {
          chunk += (chunk ? '\n' : '') + line
        }
      }
      if (chunk) await ctx.reply(chunk, { parse_mode: 'Markdown' })
    }
  } catch (err) {
    await ctx.reply(`❌ Erro: ${String(err)}`)
  }
}
```

- [ ] **Step 2: Wire into `bot/src/index.ts`**

Add import:
```typescript
import { handlePedidos } from './commands/pedidos'
```

Add before `bot.start()`:
```typescript
bot.command('pedidos', handlePedidos)
```

- [ ] **Step 3: Test**

```bash
cd bot && npx tsx src/index.ts
```

- Send `/pedidos` → today's orders across all stores
- Send `/pedidos Mundi` → Mundi's orders for last 7 days
- Send `/pedidos Mundi 10/04/2026` → Mundi's orders on that date

- [ ] **Step 4: Commit**

```bash
git add bot/src/commands/pedidos.ts bot/src/index.ts
git commit -m "feat: /pedidos command with optional store and date filter"
```

---

### Task 7: /quinzena command

**Files:**
- Create: `bot/src/commands/quinzena.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Create `bot/src/commands/quinzena.ts`**

```typescript
import { Context } from 'grammy'
import { fetchPedidosRange, fetchItens, fetchProdutos, fetchRedes } from '../services/reports'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function handleQuinzena(ctx: Context): Promise<void> {
  const args = ctx.match ? String(ctx.match).trim().split(/\s+/).filter(Boolean) : []
  const quinzena: 1 | 2 = args[0] === '2' ? 2 : 1
  const now = new Date()
  const mes = args[1] ? Number(args[1]) : now.getMonth() + 1
  const ano = args[2] ? Number(args[2]) : now.getFullYear()
  const mesStr = String(mes).padStart(2, '0')
  const lastDay = new Date(ano, mes, 0).getDate()
  const dataInicio = quinzena === 1 ? `${ano}-${mesStr}-01` : `${ano}-${mesStr}-16`
  const dataFim   = quinzena === 1 ? `${ano}-${mesStr}-15` : `${ano}-${mesStr}-${lastDay}`

  await ctx.reply('⏳ Calculando...')
  try {
    const redes = await fetchRedes()
    const redeId = redes[0]?.id
    if (!redeId) { await ctx.reply('❌ Nenhuma rede encontrada.'); return }

    const pedidos = await fetchPedidosRange(dataInicio, dataFim, redeId)
    if (pedidos.length === 0) {
      await ctx.reply('📋 Nenhum pedido encontrado para esse período.')
      return
    }

    const itens = await fetchItens(pedidos.map(p => p.id))
    const produtoIds = [...new Set(itens.map(i => i.produto_id).filter(Boolean) as number[])]
    const produtos = await fetchProdutos(produtoIds)

    const totalVenda = itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
    const totalCusto = itens.reduce((s, i) => s + i.quantidade * i.custo_unit, 0)
    const margem = totalVenda > 0 ? ((totalVenda - totalCusto) / totalVenda) * 100 : 0

    const mesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const lines = [
      `📋 *Quinzena ${quinzena} — ${mesNomes[mes - 1]} ${ano}*\n`,
      `💰 Vendas: R$ ${fmt(totalVenda)}`,
      `📦 Custo: R$ ${fmt(totalCusto)}`,
      `📈 Margem: ${fmt(margem)}%\n`,
      `*Por produto:*`,
    ]

    for (const prod of [...produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
      const prodItens = itens.filter(i => i.produto_id === prod.id)
      const qty = prodItens.reduce((s, i) => s + i.quantidade, 0)
      const venda = prodItens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0)
      if (qty > 0) {
        lines.push(`• ${prod.nome}: ${fmt(qty)} ${prod.unidade} — R$ ${fmt(venda)}`)
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
  } catch (err) {
    await ctx.reply(`❌ Erro: ${String(err)}`)
  }
}
```

- [ ] **Step 2: Wire into `bot/src/index.ts`**

Add import:
```typescript
import { handleQuinzena } from './commands/quinzena'
```

Add before `bot.start()`:
```typescript
bot.command('quinzena', handleQuinzena)
```

- [ ] **Step 3: Test**

```bash
cd bot && npx tsx src/index.ts
```

- Send `/quinzena 1` → first quinzena of current month
- Send `/quinzena 2 04 2026` → second quinzena of April 2026

- [ ] **Step 4: Commit**

```bash
git add bot/src/commands/quinzena.ts bot/src/index.ts
git commit -m "feat: /quinzena command — quinzena report from Supabase"
```

---

## Chunk 3: Lista de Preços image + /precos + pm2

### Task 8: Lista de Preços image service

**Files:**
- Create: `bot/src/services/lista-precos.ts`

Note: The logo is at `src/renderer/src/assets/logo.png` (relative to repo root). From `bot/src/services/`, the path up to repo root is `../../../`, so the logo path is `path.join(__dirname, '../../../src/renderer/src/assets/logo.png')`.

- [ ] **Step 1: Create `bot/src/services/lista-precos.ts`**

```typescript
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

export interface ListaPrecosItem { nome: string; unidade: string; preco: number }
export interface ListaPrecosData { nomeEmpresa: string; logoBase64: string; itens: ListaPrecosItem[] }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function getLogoBase64(): string {
  const logoPath = path.join(__dirname, '../../../src/renderer/src/assets/logo.png')
  return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
}

function generateHtml(data: ListaPrecosData): string {
  const rows = data.itens.map(item => `
    <tr>
      <td class="c-nome">${item.nome}</td>
      <td class="c-un">${item.unidade}</td>
      <td class="c-preco">R$&nbsp;${fmt(item.preco)}</td>
    </tr>`).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; width: 400px; background: #fff; position: relative; overflow: hidden; }
.watermark-logo {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 220px; height: 220px; object-fit: contain;
  opacity: 0.06; pointer-events: none; z-index: 0;
}
.container { padding: 20px 22px; position: relative; z-index: 1; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2.5px solid #10b981;
}
.company-name { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -.02em; }
.list-title { font-size: 10px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-top: 3px; }
.logo { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
table { width: 100%; border-collapse: collapse; }
thead tr { border-bottom: 1px solid #e2e8f0; }
th { font-size: 9px; color: #94a3b8; font-weight: 600; padding: 4px 6px;
     text-transform: uppercase; letter-spacing: .05em; }
th.c-nome { text-align: left; }
th.c-un { text-align: center; }
th.c-preco { text-align: right; }
td { font-size: 11.5px; color: #1e293b; padding: 6px 6px; border-bottom: 1px solid #f1f5f9; }
tr:nth-child(even) td { background: rgba(16,185,129,.04); }
.c-nome { text-align: left; }
.c-un { text-align: center; color: #64748b; }
.c-preco { text-align: right; font-weight: 700; color: #0f172a; }
.footer {
  margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0;
  font-size: 9px; color: #94a3b8; text-align: center;
}
</style>
</head>
<body>
<img class="watermark-logo" src="${data.logoBase64}" alt="" />
<div class="container">
  <div class="header">
    <div>
      <div class="company-name">${data.nomeEmpresa}</div>
      <div class="list-title">Lista de Preços</div>
    </div>
    <img class="logo" src="${data.logoBase64}" alt="logo" />
  </div>
  <table>
    <thead><tr>
      <th class="c-nome">Produto</th>
      <th class="c-un">UN</th>
      <th class="c-preco">Preço</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Preços sujeitos a alteração sem aviso prévio</div>
</div>
</body>
</html>`
}

export async function screenshotListaPrecos(data: ListaPrecosData): Promise<Buffer> {
  const html = generateHtml(data)
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 400, height: 1200 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const body = await page.$('body')
    const screenshot = await body!.screenshot({ type: 'png' })
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd bot && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/lista-precos.ts
git commit -m "feat: lista de precos HTML template + puppeteer screenshot for bot"
```

---

### Task 9: /precos command

**Files:**
- Create: `bot/src/commands/precos.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Create `bot/src/commands/precos.ts`**

```typescript
import { Context } from 'grammy'
import { fetchActivePrecos, fetchProdutos, fetchConfig } from '../services/reports'
import { screenshotListaPrecos, getLogoBase64 } from '../services/lista-precos'

export async function handlePrecos(ctx: Context): Promise<void> {
  await ctx.reply('⏳ Gerando lista de preços...')
  try {
    const [activePrecos, nomeEmpresa] = await Promise.all([
      fetchActivePrecos(),
      fetchConfig('nome_fornecedor'),
    ])

    const produtoIds = [...new Set(activePrecos.map(p => p.produto_id))]
    const produtos = await fetchProdutos(produtoIds)

    // One price per product — use first found
    const priceMap = new Map<number, number>()
    for (const p of activePrecos) {
      if (!priceMap.has(p.produto_id)) priceMap.set(p.produto_id, p.preco_venda)
    }

    const itens = produtos
      .filter(p => priceMap.has(p.id))
      .map(p => ({
        nome: p.nome.toUpperCase(),
        unidade: p.unidade.toUpperCase(),
        preco: priceMap.get(p.id)!,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    if (itens.length === 0) {
      await ctx.reply('❌ Nenhum produto com preço ativo encontrado.')
      return
    }

    const screenshot = await screenshotListaPrecos({
      nomeEmpresa: nomeEmpresa ?? 'HENRIQUE',
      logoBase64: getLogoBase64(),
      itens,
    })

    await ctx.replyWithPhoto({ source: screenshot, filename: 'lista-precos.png' })
  } catch (err) {
    await ctx.reply(`❌ Erro ao gerar lista: ${String(err)}`)
  }
}
```

- [ ] **Step 2: Wire into `bot/src/index.ts`**

Add import:
```typescript
import { handlePrecos } from './commands/precos'
```

Add before `bot.start()`:
```typescript
bot.command('precos', handlePrecos)
```

- [ ] **Step 3: Test**

```bash
cd bot && npx tsx src/index.ts
```

Send `/precos` in Telegram → should receive a PNG image with the price list (identical design to the app).

Note: First run may be slow (~10-15s) as puppeteer downloads Chromium. Subsequent runs are faster.

- [ ] **Step 4: Commit**

```bash
git add bot/src/commands/precos.ts bot/src/index.ts
git commit -m "feat: /precos command — generates and sends price list image via Telegram"
```

---

### Task 10: pm2 setup for background running

**Files:**
- Create: `bot/ecosystem.config.cjs`

- [ ] **Step 1: Install pm2 globally**

```bash
npm install -g pm2
```

Expected: `pm2` command available.

- [ ] **Step 2: Create `bot/ecosystem.config.cjs`**

```javascript
const path = require('path')

module.exports = {
  apps: [{
    name: 'henrique-bot',
    script: path.join(__dirname, 'node_modules/.bin/tsx'),
    args: 'src/index.ts',
    cwd: __dirname,
    interpreter: 'none',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: { NODE_ENV: 'production' },
  }]
}
```

- [ ] **Step 3: Start the bot with pm2**

```bash
cd bot && pm2 start ecosystem.config.cjs
```

Expected output:
```
[PM2] Starting /path/to/bot/node_modules/.bin/tsx --no-daemon src/index.ts
[PM2] Done.
┌────┬──────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id │ name         │ namespace   │ version │ mode    │ status   │
├────┼──────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0  │ henrique-bot │ default     │ 1.0.0   │ fork    │ online   │
└────┴──────────────┴─────────────┴─────────┴─────────┴──────────┘
```

- [ ] **Step 4: Verify bot is running**

```bash
pm2 logs henrique-bot
```

Expected: `✅ Bot iniciado.` in logs.

Send `/ajuda` in Telegram → should receive the commands list.

- [ ] **Step 5: Configure pm2 to start on Mac login**

```bash
pm2 save
pm2 startup
```

`pm2 startup` will print a command to run — copy and run it. This registers pm2 as a launchd service so the bot starts automatically when your Mac boots.

- [ ] **Step 6: Commit**

```bash
git add bot/ecosystem.config.cjs
git commit -m "feat: pm2 config for bot background process"
```

---

### Final verification

- [ ] Restart your Mac and verify the bot starts automatically
- [ ] Send all 5 commands in Telegram and verify each works:
  - `/ajuda`
  - `/resumo`
  - `/quinzena 1`
  - `/pedidos`
  - `/precos`

---

## Useful pm2 commands

```bash
pm2 status              # check if bot is running
pm2 logs henrique-bot   # view live logs
pm2 restart henrique-bot  # restart after code changes
pm2 stop henrique-bot   # stop the bot
pm2 delete henrique-bot # remove from pm2
```

## Migrating to cloud later

To move to Railway/Render/VPS:
1. Copy the `bot/` folder to the server
2. Set the same 4 env vars (SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_TOKEN, ALLOWED_CHAT_ID)
3. Run `npm install && npm start`
4. No code changes needed.

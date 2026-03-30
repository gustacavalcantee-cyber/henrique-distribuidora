# Relatório Por Produto — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Por Produto" tab to Relatórios that lets the user pick one or more products and see quantity + value per store or franqueado for a given period.

**Architecture:** Backend function in `relatorios.service.ts` queries pedidos → itensPedido → groups by produto and loja/franqueado. New IPC channel bridges to the frontend. New `PorProdutoTab` component in `Relatorios.tsx` follows the exact same pattern as the existing tabs.

**Tech Stack:** TypeScript, Drizzle ORM (better-sqlite3), React, Tailwind CSS, Electron IPC.

---

## Chunk 1: Types + IPC channel + Backend

### Task 1: Add shared types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add types to `src/shared/types.ts`**

Add at the end of the file:

```ts
export type ProdutoRelatorioLinha = {
  nome: string        // loja or franqueado name
  quantidade: number
  valor: number
}

export type ProdutoRelatorioResult = {
  produto_id: number
  produto_nome: string
  unidade: string
  linhas: ProdutoRelatorioLinha[]
  total_quantidade: number
  total_valor: number
}
```

- [ ] **Step 2: Add IPC channel to `src/shared/ipc-channels.ts`**

Add before the closing `} as const`:

```ts
  RELATORIO_POR_PRODUTO: 'relatorio:porProduto',
```

- [ ] **Step 3: Run typecheck**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts
git commit -m "feat: add ProdutoRelatorioResult types and IPC channel"
```

---

### Task 2: Backend service function

**Files:**
- Modify: `src/main/services/relatorios.service.ts`

- [ ] **Step 1: Add import for `franqueados` table at top of file**

Check if `franqueados` is already imported. If not, add it to the existing import:

```ts
import { pedidos, itensPedido, produtos, lojas, redes, despesas as despesasTable, franqueados } from '../db/schema'
```

- [ ] **Step 2: Add `getRelatorioPorProduto` function at end of file**

```ts
export function getRelatorioPorProduto(
  rede_id: number,
  produto_ids: number[],
  mes: number,
  ano: number,
  periodo: '1' | '2' | 'mes',
  agrupar_por: 'loja' | 'franqueado'
): import('../../shared/types').ProdutoRelatorioResult[] {
  if (produto_ids.length === 0) return []
  const db = getDb()
  const mesStr = String(mes).padStart(2, '0')
  const lastDay = new Date(ano, mes, 0).getDate()

  let data_inicio: string
  let data_fim: string
  if (periodo === '1') {
    data_inicio = `${ano}-${mesStr}-01`
    data_fim = `${ano}-${mesStr}-15`
  } else if (periodo === '2') {
    data_inicio = `${ano}-${mesStr}-16`
    data_fim = `${ano}-${mesStr}-${lastDay}`
  } else {
    data_inicio = `${ano}-${mesStr}-01`
    data_fim = `${ano}-${mesStr}-${lastDay}`
  }

  // 1. Pedidos for this rede in date range
  const pedidosList = db.select().from(pedidos).where(
    and(
      eq(pedidos.rede_id, rede_id),
      gte(pedidos.data_pedido, data_inicio),
      lte(pedidos.data_pedido, data_fim)
    )
  ).all()

  if (pedidosList.length === 0) return produto_ids.map(pid => {
    const prod = db.select().from(produtos).where(eq(produtos.id, pid)).get()
    return { produto_id: pid, produto_nome: prod?.nome ?? String(pid), unidade: prod?.unidade ?? '', linhas: [], total_quantidade: 0, total_valor: 0 }
  })

  const pedidoIds = pedidosList.map(p => p.id)

  // 2. Items for those pedidos, filtered by produto_ids
  const allItens = pedidoIds.flatMap(pedidoId =>
    db.select().from(itensPedido)
      .where(and(eq(itensPedido.pedido_id, pedidoId), inArray(itensPedido.produto_id, produto_ids)))
      .all()
  )

  // 3. Load reference data
  const todasLojas = db.select().from(lojas).all()
  const todosFranqueados = db.select().from(franqueados).all()
  const todosProdutos = db.select().from(produtos).where(inArray(produtos.id, produto_ids)).all()

  // 4. Build results per product
  return produto_ids.map(produto_id => {
    const produto = todosProdutos.find(p => p.id === produto_id)
    const itensDoP = allItens.filter(i => i.produto_id === produto_id)

    // Group by loja or franqueado
    const groupMap = new Map<string, { quantidade: number; valor: number }>()

    for (const item of itensDoP) {
      const pedido = pedidosList.find(p => p.id === item.pedido_id)!
      const loja = todasLojas.find(l => l.id === pedido.loja_id)

      let groupName: string
      if (agrupar_por === 'franqueado' && loja?.franqueado_id) {
        const franqueado = todosFranqueados.find(f => f.id === loja.franqueado_id)
        groupName = franqueado?.nome ?? 'Sem franqueado'
      } else {
        groupName = loja?.nome ?? String(pedido.loja_id)
      }

      const prev = groupMap.get(groupName) ?? { quantidade: 0, valor: 0 }
      groupMap.set(groupName, {
        quantidade: prev.quantidade + item.quantidade,
        valor: prev.valor + item.quantidade * item.preco_unit,
      })
    }

    const linhas = Array.from(groupMap.entries())
      .map(([nome, { quantidade, valor }]) => ({ nome, quantidade, valor }))
      .sort((a, b) => b.quantidade - a.quantidade)

    const total_quantidade = linhas.reduce((s, l) => s + l.quantidade, 0)
    const total_valor = linhas.reduce((s, l) => s + l.valor, 0)

    return {
      produto_id,
      produto_nome: produto?.nome ?? String(produto_id),
      unidade: produto?.unidade ?? '',
      linhas,
      total_quantidade,
      total_valor,
    }
  })
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/relatorios.service.ts
git commit -m "feat: add getRelatorioPorProduto service function"
```

---

### Task 3: Register IPC handler

**Files:**
- Modify: `src/main/handlers/relatorios.ts`

- [ ] **Step 1: Open `src/main/handlers/relatorios.ts` and add handler**

Find the `registerRelatoriosHandlers` function and add at the end, before the closing `}`:

```ts
ipcMain.handle(IPC.RELATORIO_POR_PRODUTO, (_e, rede_id: number, produto_ids: number[], mes: number, ano: number, periodo: '1'|'2'|'mes', agrupar_por: 'loja'|'franqueado') => {
  return getRelatorioPorProduto(rede_id, produto_ids, mes, ano, periodo, agrupar_por)
})
```

Also add the import at the top of the file:

```ts
import { getRelatorioPorProduto } from '../services/relatorios.service'
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/relatorios.ts
git commit -m "feat: register RELATORIO_POR_PRODUTO IPC handler"
```

---

## Chunk 2: Frontend Tab

### Task 4: Add PorProdutoTab to Relatorios.tsx

**Files:**
- Modify: `src/renderer/src/pages/Relatorios.tsx`

- [ ] **Step 1: Add import for new type at top of `Relatorios.tsx`**

Add `ProdutoRelatorioResult` to the existing type import line:

```ts
import type { Rede, Loja, Franqueado, QuinzenaSummary, FinanceiroSummary, CobrancaLojaResult, NotaPagamento, ProdutoRelatorioResult } from '../../../shared/types'
```

- [ ] **Step 2: Add the `PorProdutoTab` component**

Add this new component before the main `export default function Relatorios()` at the bottom of the file:

```tsx
function PorProdutoTab() {
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const now = new Date()
  const [redeId, setRedeId] = useState<number | ''>('')
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [periodo, setPeriodo] = useState<'1' | '2' | 'mes'>('1')
  const [produtosSelecionados, setProdutosSelecionados] = useState<number[]>([])
  const [agruparPor, setAgruparPor] = useState<'loja' | 'franqueado'>('loja')
  const [resultado, setResultado] = useState<ProdutoRelatorioResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Products for selected rede
  const produtosDaRede = useIpc<{ id: number; nome: string; unidade: string }[]>(
    IPC.PRODUTOS_LIST
  ).data?.filter(p => p.rede_id === redeId || redeId === '') ?? []

  const todosChecked = produtosDaRede.length > 0 && produtosSelecionados.length === produtosDaRede.length

  function toggleProduto(id: number) {
    setProdutosSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleTodos() {
    if (todosChecked) setProdutosSelecionados([])
    else setProdutosSelecionados(produtosDaRede.map(p => p.id))
  }

  // Reset products when rede changes
  useEffect(() => { setProdutosSelecionados([]); setResultado(null) }, [redeId])

  async function handleBuscar() {
    if (!redeId) { alert('Selecione uma rede'); return }
    if (produtosSelecionados.length === 0) { alert('Selecione ao menos um produto'); return }
    setLoading(true)
    const data = await window.electron.invoke<ProdutoRelatorioResult[]>(
      IPC.RELATORIO_POR_PRODUTO, Number(redeId), produtosSelecionados, mes, ano, periodo, agruparPor
    )
    setResultado(data)
    setLoading(false)
  }

  function handlePrint() {
    if (!resultado) return
    const rede = redes?.find(r => r.id === redeId)
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const periodoStr = periodo === '1' ? '1ª Quinzena' : periodo === '2' ? '2ª Quinzena' : 'Mês inteiro'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
      h1{font-size:16px;margin-bottom:4px} h2{font-size:13px;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}
      th{background:#f3f3f3;font-weight:600} .total{font-weight:bold;background:#f9f9f9}
      .right{text-align:right}
    </style></head><body>
    <h1>Relatório Por Produto — ${rede?.nome ?? ''}</h1>
    <p>${meses[mes-1]} ${ano} — ${periodoStr}</p>
    ${resultado.filter(r => r.linhas.length > 0).map(r => `
      <h2>${r.produto_nome} (${r.unidade})</h2>
      <table>
        <thead><tr><th>${agruparPor === 'franqueado' ? 'Franqueado' : 'Loja'}</th><th class="right">Quantidade</th><th class="right">Valor (R$)</th></tr></thead>
        <tbody>
          ${r.linhas.map(l => `<tr>
            <td>${l.nome}</td>
            <td class="right">${formatQty(l.quantidade)} ${r.unidade}</td>
            <td class="right">R$ ${formatMoney(l.valor)}</td>
          </tr>`).join('')}
          <tr class="total">
            <td>Total</td>
            <td class="right">${formatQty(r.total_quantidade)} ${r.unidade}</td>
            <td class="right">R$ ${formatMoney(r.total_valor)}</td>
          </tr>
        </tbody>
      </table>`).join('')}
    </body></html>`
    window.electron.invoke(IPC.PRINT_HTML, html)
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Rede */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rede</label>
            <select value={redeId} onChange={e => setRedeId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione...</option>
              {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          {/* Mês/Ano */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Mês</label>
              <select value={mes} onChange={e => setMes(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i) =>
                  <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
              <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Período */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
          <div className="flex gap-3">
            {([['1','1ª Quinzena'],['2','2ª Quinzena'],['mes','Mês inteiro']] as const).map(([v,l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" value={v} checked={periodo === v} onChange={() => setPeriodo(v)} />
                {l}
              </label>
            ))}
          </div>
        </div>

        {/* Produtos */}
        {redeId !== '' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Produtos</label>
            <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer pb-1 border-b border-gray-100">
                <input type="checkbox" checked={todosChecked} onChange={toggleTodos} />
                Todos
              </label>
              {produtosDaRede.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={produtosSelecionados.includes(p.id)} onChange={() => toggleProduto(p.id)} />
                  {p.nome} <span className="text-gray-400 text-xs">({p.unidade})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Agrupar por */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Agrupar por</label>
          <div className="flex gap-3">
            {([['loja','Loja'],['franqueado','Franqueado']] as const).map(([v,l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" value={v} checked={agruparPor === v} onChange={() => setAgruparPor(v)} />
                {l}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={handleBuscar} disabled={loading || !redeId || produtosSelecionados.length === 0}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          {resultado && (
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
              <Printer size={14} /> Imprimir
            </button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {resultado && (
        <div className="space-y-4">
          {resultado.filter(r => r.linhas.length > 0).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum dado encontrado para o período.</p>
          ) : (
            resultado.filter(r => r.linhas.length > 0).map(r => (
              <div key={r.produto_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                  <h3 className="font-semibold text-emerald-800 text-sm">{r.produto_nome}
                    <span className="ml-2 text-xs font-normal text-emerald-600">({r.unidade})</span>
                  </h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">
                        {agruparPor === 'franqueado' ? 'Franqueado' : 'Loja'}
                      </th>
                      <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Quantidade</th>
                      <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Valor (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {r.linhas.map((l, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-2.5">{l.nome}</td>
                        <td className="px-5 py-2.5 text-right">{formatQty(l.quantidade)} {r.unidade}</td>
                        <td className="px-5 py-2.5 text-right">R$ {formatMoney(l.valor)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                      <td className="px-5 py-2.5">Total</td>
                      <td className="px-5 py-2.5 text-right">{formatQty(r.total_quantidade)} {r.unidade}</td>
                      <td className="px-5 py-2.5 text-right">R$ {formatMoney(r.total_valor)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add "Por Produto" tab button in `Relatorios.tsx`**

Find the tab buttons array/list in the `Relatorios` default export and add:

```tsx
{ key: 'porproduto', label: 'Por Produto' }
```

And in the tab content switch/if block:

```tsx
{tab === 'porproduto' && <PorProdutoTab />}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/Relatorios.tsx
git commit -m "feat: add Por Produto tab to Relatorios"
```

---

### Task 5: Build and verify

- [ ] **Step 1: Build Mac DMG**

```bash
npm run build:mac 2>&1 | tail -5
```

Expected: `• building block map` line with no errors.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 3: Manual test checklist**

Open the app and verify:
- [ ] "Por Produto" tab appears in Relatórios
- [ ] Selecting a rede loads its products in the checkbox list
- [ ] "Todos" checkbox selects/deselects all products
- [ ] Buscar with no rede shows alert
- [ ] Buscar with no products selected shows alert
- [ ] Results show one section per product with correct unit label
- [ ] "Agrupar por Franqueado" groups rows by franqueado
- [ ] Imprimir opens print window with all sections

# Relatório Preço × Custo Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar relatório de Preço × Custo com histórico de custos, comparação por loja com margem e gráfico mensal com zoom; e melhorar a aba Custos em Cadastros para exibir produtos com nome e histórico expansível.

**Architecture:** Backend adiciona `getRelatorioPrecoVsCusto` em `relatorios.service.ts` e registra handler em `relatorios.ts`. Frontend cria componente `PrecoVsCustoTab` extraído em arquivo próprio e adiciona como nova aba em `Relatorios.tsx`. A aba Custos em `Cadastros.tsx` substitui o AG Grid por tabela nativa com expand. Recharts é instalado para o gráfico.

**Tech Stack:** React 19, TypeScript, Drizzle ORM + better-sqlite3, Recharts, Tailwind CSS, electron-vite

**Spec:** `docs/superpowers/specs/2026-03-21-preco-custo-design.md`

---

## Chunk 1: Backend — Tipos, IPC e Service

**Files:**
- Modify: `src/shared/types.ts` — adicionar `PrecoVsCustoResult`
- Modify: `src/shared/ipc-channels.ts` — adicionar `RELATORIO_PRECO_CUSTO`
- Modify: `src/main/services/relatorios.service.ts` — adicionar `getRelatorioPrecoVsCusto`
- Modify: `src/main/handlers/relatorios.ts` — registrar handler

---

### Task 1: Adicionar tipo `PrecoVsCustoResult` em `types.ts`

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Adicionar interfaces ao final de `src/shared/types.ts`**

```typescript
export interface PrecoVsCustoCusto {
  id: number
  custo_compra: number
  vigencia_inicio: string
  vigencia_fim: string | null
}

export interface PrecoVsCustoLoja {
  loja_id: number
  loja_nome: string          // "Franqueado — Loja" ou só "Loja"
  preco_venda: number | null
  custo_atual: number | null
  margem_reais: number | null
  margem_pct: number | null
}

export interface PrecoVsCustoGraficoDia {
  dia: string                // "YYYY-MM-DD"
  custo: number | null
  preco: number | null
  margem_pct: number | null
}

export interface PrecoVsCustoGraficoMes {
  mes: string                // "YYYY-MM"
  custo: number | null
  preco_medio: number | null
  margem_pct: number | null
  dias: PrecoVsCustoGraficoDia[]
}

export interface PrecoVsCustoResult {
  produto_nome: string
  historico_custos: PrecoVsCustoCusto[]
  comparacao_lojas: PrecoVsCustoLoja[]
  grafico_mensal: PrecoVsCustoGraficoMes[]
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(tipos): adicionar PrecoVsCustoResult para relatorio preco vs custo"
```

---

### Task 2: Adicionar canal IPC `RELATORIO_PRECO_CUSTO`

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Adicionar após `RELATORIO_POR_PRODUTO`**

```typescript
  RELATORIO_PRECO_CUSTO: 'relatorio:precoCusto',
```

A linha vai após `PRODUTOS_COM_PEDIDOS_NA_REDE` no objeto IPC.

- [ ] **Step 2: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(ipc): adicionar canal RELATORIO_PRECO_CUSTO"
```

---

### Task 3: Implementar `getRelatorioPrecoVsCusto` no service

**Files:**
- Modify: `src/main/services/relatorios.service.ts`

A função recebe `produto_id: number` e `loja_id?: number`.
Retorna `PrecoVsCustoResult`.

Lógica:
1. **produto_nome:** busca em `produtos` pelo `produto_id`
2. **historico_custos:** todos os registros de `custos` para esse produto, ordem decrescente por `vigencia_inicio`
3. **comparacao_lojas:**
   - Busca o custo vigente (vigencia_fim IS NULL) do produto
   - Para cada loja ativa (ou só a loja selecionada se `loja_id` fornecido): busca preço vigente em `precos`
   - Monta nome como `"${franqueado.nome} — ${loja.nome}"` se tiver franqueado, senão só `loja.nome`
   - Calcula `margem_reais = preco_venda - custo_atual`, `margem_pct = margem_reais / preco_venda * 100`
4. **grafico_mensal:** Para os últimos 12 meses:
   - Para cada mês: busca o custo que estava vigente naquele mês (vigencia_inicio <= último dia do mês AND (vigencia_fim IS NULL OR vigencia_fim >= primeiro dia do mês))
   - Para preço: se `loja_id` fornecido, usa preço vigente naquele mês para aquela loja; se não, média dos preços vigentes de todas as lojas com preço cadastrado
   - Para o drill-down de dias: busca os registros reais de `itens_pedido` JOIN `pedidos` daquele mês (filtrando por loja_id se fornecido), agrupa por dia com custo_unit e preco_unit médios

- [ ] **Step 1: Adicionar imports necessários no topo do service (se não existirem)**

Verificar que `custos`, `precos`, `produtos`, `lojas`, `franqueados` estão importados do schema.
A linha de import atual é:

```typescript
import { pedidos, itensPedido, produtos, lojas, redes, despesas as despesasTable, franqueados } from '../db/schema'
```

Adicionar `custos as custosTable, precos as precosTable` se não estiverem:

```typescript
import { pedidos, itensPedido, produtos, lojas, redes, despesas as despesasTable, franqueados, custos as custosTable, precos as precosTable } from '../db/schema'
```

Também adicionar `isNull, or` ao import do drizzle:

```typescript
import { eq, and, gte, lte, inArray, isNull, or } from 'drizzle-orm'
```

Adicionar import do tipo ao topo:

```typescript
import type { QuinzenaSummary, FinanceiroSummary, CobrancaLojaResult, NotaPagamento, ProdutoRelatorioResult, PrecoVsCustoResult, PrecoVsCustoCusto, PrecoVsCustoLoja, PrecoVsCustoGraficoMes, PrecoVsCustoGraficoDia } from '../../shared/types'
```

- [ ] **Step 2: Adicionar a função ao final do arquivo**

```typescript
export function getRelatorioPrecoVsCusto(produto_id: number, loja_id?: number): PrecoVsCustoResult {
  const db = getDb()

  // 1. Nome do produto
  const produto = db.select().from(produtos).where(eq(produtos.id, produto_id)).get()
  const produto_nome = produto?.nome ?? String(produto_id)

  // 2. Histórico de custos (mais recente primeiro)
  const historico_custos: PrecoVsCustoCusto[] = db
    .select()
    .from(custosTable)
    .where(eq(custosTable.produto_id, produto_id))
    .all()
    .sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))

  // 3. Custo vigente atual
  const custoVigente = historico_custos.find(c => c.vigencia_fim === null) ?? null

  // 4. Lojas a comparar
  const todasLojas = loja_id
    ? db.select().from(lojas).where(eq(lojas.id, loja_id)).all()
    : db.select().from(lojas).where(eq(lojas.ativo, 1)).all()
  const todosFranqueados = db.select().from(franqueados).all()

  // Preços vigentes para o produto
  const precosVigentes = db
    .select()
    .from(precosTable)
    .where(and(eq(precosTable.produto_id, produto_id), isNull(precosTable.vigencia_fim)))
    .all()

  const comparacao_lojas: PrecoVsCustoLoja[] = todasLojas.map(loja => {
    const franqueado = todosFranqueados.find(f => f.id === loja.franqueado_id)
    const loja_nome = franqueado ? `${franqueado.nome} — ${loja.nome}` : loja.nome
    const preco = precosVigentes.find(p => p.loja_id === loja.id)
    const preco_venda = preco?.preco_venda ?? null
    const custo_atual = custoVigente?.custo_compra ?? null
    const margem_reais = preco_venda != null && custo_atual != null ? preco_venda - custo_atual : null
    const margem_pct = preco_venda != null && margem_reais != null && preco_venda > 0
      ? (margem_reais / preco_venda) * 100
      : null
    return { loja_id: loja.id, loja_nome, preco_venda, custo_atual, margem_reais, margem_pct }
  }).filter(l => l.preco_venda != null) // só lojas com preço cadastrado

  // 5. Gráfico mensal — últimos 12 meses
  const now = new Date()
  const grafico_mensal: PrecoVsCustoGraficoMes[] = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ano = d.getFullYear()
    const mes = d.getMonth() + 1
    const mesStr = String(mes).padStart(2, '0')
    const mesLabel = `${ano}-${mesStr}`
    const firstDay = `${ano}-${mesStr}-01`
    const lastDay = `${ano}-${mesStr}-${new Date(ano, mes, 0).getDate()}`

    // Custo vigente neste mês
    const allCustos = db.select().from(custosTable).where(eq(custosTable.produto_id, produto_id)).all()
    const custoDoMes = allCustos.find(c =>
      c.vigencia_inicio <= lastDay &&
      (c.vigencia_fim === null || c.vigencia_fim >= firstDay)
    )
    const custoMes = custoDoMes?.custo_compra ?? null

    // Preço médio vigente neste mês (por loja selecionada ou média geral)
    const allPrecos = db.select().from(precosTable).where(eq(precosTable.produto_id, produto_id)).all()
    const precosDoMes = allPrecos.filter(p => {
      const dentroDoMes = p.vigencia_inicio <= lastDay && (p.vigencia_fim === null || p.vigencia_fim >= firstDay)
      if (!dentroDoMes) return false
      if (loja_id) return p.loja_id === loja_id
      return true
    })
    const preco_medio = precosDoMes.length > 0
      ? precosDoMes.reduce((s, p) => s + p.preco_venda, 0) / precosDoMes.length
      : null
    const margem_pct = preco_medio != null && custoMes != null && preco_medio > 0
      ? ((preco_medio - custoMes) / preco_medio) * 100
      : null

    // Dias com pedidos reais para drill-down
    const pedidosDoMes = db.select().from(pedidos).where(
      and(
        gte(pedidos.data_pedido, firstDay),
        lte(pedidos.data_pedido, lastDay),
        ...(loja_id ? [eq(pedidos.loja_id, loja_id)] : [])
      )
    ).all()

    const diaMap = new Map<string, { custo_sum: number; preco_sum: number; count: number }>()
    for (const ped of pedidosDoMes) {
      const itens = db.select().from(itensPedido).where(
        and(eq(itensPedido.pedido_id, ped.id), eq(itensPedido.produto_id, produto_id))
      ).all()
      for (const item of itens) {
        const prev = diaMap.get(ped.data_pedido) ?? { custo_sum: 0, preco_sum: 0, count: 0 }
        diaMap.set(ped.data_pedido, {
          custo_sum: prev.custo_sum + item.custo_unit,
          preco_sum: prev.preco_sum + item.preco_unit,
          count: prev.count + 1,
        })
      }
    }

    const dias: PrecoVsCustoGraficoDia[] = Array.from(diaMap.entries()).map(([dia, v]) => {
      const custo = v.count > 0 ? v.custo_sum / v.count : null
      const preco = v.count > 0 ? v.preco_sum / v.count : null
      const marg = preco != null && custo != null && preco > 0 ? ((preco - custo) / preco) * 100 : null
      return { dia, custo, preco, margem_pct: marg }
    }).sort((a, b) => a.dia.localeCompare(b.dia))

    grafico_mensal.push({ mes: mesLabel, custo: custoMes, preco_medio, margem_pct, dias })
  }

  return { produto_nome, historico_custos, comparacao_lojas, grafico_mensal }
}
```

- [ ] **Step 3: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/relatorios.service.ts
git commit -m "feat(service): adicionar getRelatorioPrecoVsCusto"
```

---

### Task 4: Registrar handler IPC

**Files:**
- Modify: `src/main/handlers/relatorios.ts`

- [ ] **Step 1: Adicionar import do novo service**

Adicionar `getRelatorioPrecoVsCusto` ao import existente:

```typescript
import { getRelatorioQuinzena, getRelatorioFinanceiro, getRelatorioCobranca, getNotasMes, getRelatorioPorProduto, getRelatorioPrecoVsCusto } from '../services/relatorios.service'
```

- [ ] **Step 2: Registrar handler ao final de `registerRelatoriosHandlers`**

```typescript
  ipcMain.handle(IPC.RELATORIO_PRECO_CUSTO, (_event, produto_id: number, loja_id?: number) => {
    return getRelatorioPrecoVsCusto(produto_id, loja_id)
  })
```

- [ ] **Step 3: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/relatorios.ts
git commit -m "feat(handler): registrar handler RELATORIO_PRECO_CUSTO"
```

---

## Chunk 2: Cadastros > Custos — Tabela Expansível

**Files:**
- Modify: `src/renderer/src/pages/Cadastros.tsx` — substituir CustosTab AG Grid por tabela nativa

---

### Task 5: Reescrever CustosTab com tabela expansível

**Files:**
- Modify: `src/renderer/src/pages/Cadastros.tsx` (função `CustosTab`, linhas ~551–603)

A nova tab:
- Agrupa os registros de `custos` por `produto_id`
- Para cada produto: mostra nome, custo vigente (vigencia_fim = null), data de início
- Botão ▶/▼ para expandir e ver registros históricos encerrados
- Mantém formulário de cadastro no topo (sem alteração)
- Não usa mais AG Grid (remover imports relacionados se não usados em outra tab — **verificar antes**)

- [ ] **Step 1: Verificar se AG Grid é usado em outras tabs além de Custos**

Pesquisar no arquivo:

```bash
grep -n "AgGridReact\|ag-theme-alpine\|ColDef" src/renderer/src/pages/Cadastros.tsx | head -30
```

Se usado em outras tabs: **não remover** imports do AG Grid.

- [ ] **Step 2: Substituir a função `CustosTab` completa**

Localizar o bloco `// ---- Custos Tab ----` até o fechamento da função (linhas ~551–603) e substituir por:

```tsx
// ---- Custos Tab ----
function CustosTab() {
  const { data: custos, loading, reload } = useIpc<Custo[]>(IPC.CUSTOS_LIST)
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const [newProdId, setNewProdId] = useState<number | ''>('')
  const [newCusto, setNewCusto] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  function toggleExpand(produtoId: number) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(produtoId) ? next.delete(produtoId) : next.add(produtoId)
      return next
    })
  }

  function formatMoney(v: number) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatDate(iso: string) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  const handleAdd = async () => {
    if (newProdId === '' || !newCusto) return
    await window.electron.invoke(IPC.CUSTOS_UPSERT, {
      produto_id: Number(newProdId),
      custo_compra: Number(newCusto),
    })
    setNewCusto('')
    reload()
  }

  // Agrupar por produto_id
  const produtosOrdenados = [...(produtos ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
  const custosMap = new Map<number, Custo[]>()
  for (const custo of custos ?? []) {
    const list = custosMap.get(custo.produto_id) ?? []
    list.push(custo)
    custosMap.set(custo.produto_id, list)
  }

  // Produtos que têm ao menos um custo cadastrado
  const produtosComCusto = produtosOrdenados.filter(p => custosMap.has(p.id))

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Formulário de cadastro */}
      <div className="flex gap-2">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={newProdId}
          onChange={e => setNewProdId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Produto</option>
          {produtosOrdenados.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm w-28"
          type="number"
          step="0.01"
          placeholder="Custo"
          value={newCusto}
          onChange={e => setNewCusto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
        >
          Definir Custo
        </button>
      </div>
      <p className="text-xs text-gray-500">
        O custo antigo é fechado automaticamente ao definir um novo custo para o mesmo produto.
      </p>

      {loading ? (
        <div className="text-gray-500">Carregando...</div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-left text-xs text-gray-600 w-8"></th>
                <th className="border px-3 py-2 text-left text-xs text-gray-600">PRODUTO</th>
                <th className="border px-3 py-2 text-right text-xs text-gray-600 w-32">CUSTO VIGENTE</th>
                <th className="border px-3 py-2 text-left text-xs text-gray-600 w-32">DESDE</th>
              </tr>
            </thead>
            <tbody>
              {produtosComCusto.map(prod => {
                const registros = [...(custosMap.get(prod.id) ?? [])].sort(
                  (a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio)
                )
                const vigente = registros.find(c => c.vigencia_fim === null)
                const historico = registros.filter(c => c.vigencia_fim !== null)
                const expanded = expandedIds.has(prod.id)

                return (
                  <>
                    <tr key={prod.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-2 text-center">
                        {historico.length > 0 && (
                          <button
                            onClick={() => toggleExpand(prod.id)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title={expanded ? 'Recolher histórico' : 'Ver histórico'}
                          >
                            {expanded ? '▼' : '▶'}
                          </button>
                        )}
                      </td>
                      <td className="border px-3 py-2 font-medium text-gray-800">{prod.nome}</td>
                      <td className="border px-3 py-2 text-right font-mono text-gray-800">
                        {vigente ? `R$ ${formatMoney(vigente.custo_compra)}` : <span className="text-gray-400 text-xs">Sem custo</span>}
                      </td>
                      <td className="border px-3 py-2 text-gray-500 text-xs">
                        {vigente ? formatDate(vigente.vigencia_inicio) : '—'}
                      </td>
                    </tr>
                    {expanded && historico.map(h => (
                      <tr key={h.id} className="bg-gray-50 text-xs text-gray-500">
                        <td className="border px-2 py-1"></td>
                        <td className="border px-3 py-1 pl-6 text-gray-400">↳ histórico</td>
                        <td className="border px-3 py-1 text-right font-mono">R$ {formatMoney(h.custo_compra)}</td>
                        <td className="border px-3 py-1">
                          {formatDate(h.vigencia_inicio)} → {h.vigencia_fim ? formatDate(h.vigencia_fim) : '—'}
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
              {produtosComCusto.length === 0 && (
                <tr>
                  <td colSpan={4} className="border px-3 py-4 text-center text-gray-400 text-xs">
                    Nenhum custo cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Iniciar dev server e verificar aba Custos visualmente**

```bash
npm run dev
```

Ir em Cadastros > Custos.
Verificar: produtos listados com nome, custo vigente em R$, botão ▶ mostra histórico.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/Cadastros.tsx
git commit -m "feat(cadastros): reescrever CustosTab com tabela expansivel por produto"
```

---

## Chunk 3: Frontend — Tab Preço × Custo (Filtros + Seções 1 e 2)

**Files:**
- Create: `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx`
- Modify: `src/renderer/src/pages/Relatorios.tsx` — adicionar aba

---

### Task 6: Criar componente `PrecoVsCustoTab` (filtros + seção 1 + seção 2)

**Files:**
- Create: `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx`

- [ ] **Step 1: Criar diretório se não existir**

```bash
mkdir -p "src/renderer/src/components/Relatorios"
```

- [ ] **Step 2: Criar `PrecoVsCustoTab.tsx`**

```tsx
// src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx
import { useState } from 'react'
import type { Produto, Loja, PrecoVsCustoResult } from '../../../../../shared/types'
import { IPC } from '../../../../../shared/ipc-channels'
import { useIpc } from '../../hooks/useIpc'

function formatMoney(v: number | null | undefined) {
  if (v == null) return '—'
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function margemColor(pct: number | null) {
  if (pct == null) return 'text-gray-400'
  if (pct >= 30) return 'text-emerald-600 font-semibold'
  if (pct >= 15) return 'text-amber-600 font-semibold'
  return 'text-red-600 font-semibold'
}

export function PrecoVsCustoTab() {
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)

  const [produtoId, setProdutoId] = useState<number | ''>('')
  const [lojaId, setLojaId] = useState<number | ''>('')
  const [resultado, setResultado] = useState<PrecoVsCustoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const produtosOrdenados = [...(produtos ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
  const lojasOrdenadas = [...(lojas ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )

  async function handleBuscar() {
    if (produtoId === '') { setErro('Selecione um produto'); return }
    setErro(null)
    setLoading(true)
    try {
      const data = await window.electron.invoke<PrecoVsCustoResult>(
        IPC.RELATORIO_PRECO_CUSTO,
        Number(produtoId),
        lojaId !== '' ? Number(lojaId) : undefined
      )
      setResultado(data)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Produto *</label>
          <select
            className="border rounded px-2 py-1.5 text-sm min-w-48"
            value={produtoId}
            onChange={e => { setProdutoId(e.target.value === '' ? '' : Number(e.target.value)); setResultado(null) }}
          >
            <option value="">Selecione...</option>
            {produtosOrdenados.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Loja</label>
          <select
            className="border rounded px-2 py-1.5 text-sm min-w-48"
            value={lojaId}
            onChange={e => { setLojaId(e.target.value === '' ? '' : Number(e.target.value)); setResultado(null) }}
          >
            <option value="">Todas as lojas</option>
            {lojasOrdenadas.map(l => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleBuscar}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Carregando...' : 'Buscar'}
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {resultado && (
        <>
          <h2 className="text-base font-semibold text-gray-800">{resultado.produto_nome}</h2>

          {/* Seção 1: Histórico de Custos */}
          <section>
            <h3 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Histórico de Custos de Compra
            </h3>
            <table className="text-sm border-collapse w-full max-w-2xl">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-3 py-2 text-left text-xs text-gray-500">VIGÊNCIA INÍCIO</th>
                  <th className="border px-3 py-2 text-left text-xs text-gray-500">VIGÊNCIA FIM</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">CUSTO DE COMPRA</th>
                  <th className="border px-3 py-2 text-center text-xs text-gray-500">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {resultado.historico_custos.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="border px-3 py-2">{formatDate(c.vigencia_inicio)}</td>
                    <td className="border px-3 py-2 text-gray-500">{formatDate(c.vigencia_fim)}</td>
                    <td className="border px-3 py-2 text-right font-mono font-semibold">
                      {formatMoney(c.custo_compra)}
                    </td>
                    <td className="border px-3 py-2 text-center">
                      {c.vigencia_fim === null ? (
                        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">
                          Vigente
                        </span>
                      ) : (
                        <span className="inline-block bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                          Encerrado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {resultado.historico_custos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="border px-3 py-4 text-center text-gray-400 text-xs">
                      Nenhum custo cadastrado para este produto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Seção 2: Comparação por Loja */}
          <section>
            <h3 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Comparação por Loja
            </h3>
            <table className="text-sm border-collapse w-full max-w-3xl">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-3 py-2 text-left text-xs text-gray-500">FRANQUIA / LOJA</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">PREÇO DE VENDA</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">CUSTO ATUAL</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">MARGEM R$</th>
                  <th className="border px-3 py-2 text-right text-xs text-gray-500">MARGEM %</th>
                </tr>
              </thead>
              <tbody>
                {resultado.comparacao_lojas.map(l => (
                  <tr key={l.loja_id} className="hover:bg-gray-50">
                    <td className="border px-3 py-2 font-medium text-gray-800">{l.loja_nome}</td>
                    <td className="border px-3 py-2 text-right font-mono">{formatMoney(l.preco_venda)}</td>
                    <td className="border px-3 py-2 text-right font-mono">{formatMoney(l.custo_atual)}</td>
                    <td className="border px-3 py-2 text-right font-mono">{formatMoney(l.margem_reais)}</td>
                    <td className={`border px-3 py-2 text-right ${margemColor(l.margem_pct)}`}>
                      {formatPct(l.margem_pct)}
                    </td>
                  </tr>
                ))}
                {resultado.comparacao_lojas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border px-3 py-4 text-center text-gray-400 text-xs">
                      Nenhuma loja com preço de venda cadastrado para este produto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx
git commit -m "feat(relatorios): criar PrecoVsCustoTab com filtros, historico e comparacao por loja"
```

---

### Task 7: Registrar nova aba em `Relatorios.tsx`

**Files:**
- Modify: `src/renderer/src/pages/Relatorios.tsx`

- [ ] **Step 1: Adicionar import do componente**

No topo de `Relatorios.tsx`, após os imports existentes:

```typescript
import { PrecoVsCustoTab } from '../components/Relatorios/PrecoVsCustoTab'
```

- [ ] **Step 2: Adicionar `'precocusto'` ao tipo de aba**

Localizar:
```typescript
type RelatTab = 'quinzena' | 'financeiro' | 'cobranca' | 'porproduto'
```

Substituir por:
```typescript
type RelatTab = 'quinzena' | 'financeiro' | 'cobranca' | 'porproduto' | 'precocusto'
```

- [ ] **Step 3: Adicionar botão da aba na navegação**

Localizar o array de abas:
```typescript
[['quinzena', 'Quinzena'], ['financeiro', 'Financeiro'], ['cobranca', 'Cobrança'], ['porproduto', 'Por Produto']]
```

Substituir por:
```typescript
[['quinzena', 'Quinzena'], ['financeiro', 'Financeiro'], ['cobranca', 'Cobrança'], ['porproduto', 'Por Produto'], ['precocusto', 'Preço × Custo']]
```

- [ ] **Step 4: Adicionar renderização condicional da tab**

Após `{activeTab === 'porproduto' && <PorProdutoTab />}`, adicionar:

```tsx
{activeTab === 'precocusto' && <PrecoVsCustoTab />}
```

- [ ] **Step 5: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 6: Iniciar dev server e testar**

```bash
npm run dev
```

Ir em Relatórios → aba "Preço × Custo".
Selecionar um produto → clicar Buscar.
Verificar: histórico de custos aparece, tabela de comparação por loja aparece com margens coloridas.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Relatorios.tsx
git commit -m "feat(relatorios): adicionar aba Preco x Custo"
```

---

## Chunk 4: Frontend — Gráfico com Recharts e Zoom

**Files:**
- Modify: `package.json` — instalar recharts
- Modify: `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx` — adicionar Seção 3

---

### Task 8: Instalar Recharts

- [ ] **Step 1: Instalar como dependência de produção**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm install recharts
```

Expected: sem erros, `recharts` aparece em `dependencies` no `package.json`.

- [ ] **Step 2: Verificar typecheck (recharts inclui seus próprios tipos)**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): instalar recharts para graficos"
```

---

### Task 9: Adicionar Seção 3 — Gráfico Mensal com Zoom

**Files:**
- Modify: `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx`

O gráfico usa `ComposedChart` do Recharts com:
- `Bar` para custo (vermelho) e preço de venda (azul)
- `Line` para margem % (verde) no eixo Y secundário
- Ao clicar num mês, `drillMes` é definido e o gráfico exibe os dias daquele mês
- Botão "← Voltar" reseta `drillMes`

- [ ] **Step 1: Adicionar imports do Recharts no topo do componente**

```tsx
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell
} from 'recharts'
```

- [ ] **Step 2: Adicionar estado de drill-down dentro de `PrecoVsCustoTab`**

```tsx
const [drillMes, setDrillMes] = useState<string | null>(null)
```

Resetar `drillMes` quando `setResultado(null)` for chamado (nos handlers de filtro).

- [ ] **Step 3: Adicionar função de formatação de labels**

```tsx
function labelMes(mes: string) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [, m] = mes.split('-')
  return meses[parseInt(m) - 1]
}

function labelDia(dia: string) {
  const [, , d] = dia.split('-')
  return `Dia ${parseInt(d)}`
}
```

- [ ] **Step 4: Adicionar Seção 3 dentro do bloco `{resultado && (...)}`, após Seção 2**

```tsx
          {/* Seção 3: Gráfico Mensal */}
          <section>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                {drillMes ? `Detalhe de ${drillMes}` : 'Evolução Mensal'}
              </h3>
              {drillMes && (
                <button
                  onClick={() => setDrillMes(null)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ← Voltar para visão mensal
                </button>
              )}
            </div>

            {(() => {
              const dadosGrafico = drillMes
                ? (resultado.grafico_mensal.find(m => m.mes === drillMes)?.dias ?? []).map(d => ({
                    label: labelDia(d.dia),
                    custo: d.custo,
                    preco: d.preco,
                    margem: d.margem_pct,
                  }))
                : resultado.grafico_mensal.map(m => ({
                    label: labelMes(m.mes),
                    custo: m.custo,
                    preco: m.preco_medio,
                    margem: m.margem_pct,
                    _mes: m.mes,
                  }))

              if (dadosGrafico.length === 0) {
                return (
                  <p className="text-xs text-gray-400">
                    {drillMes
                      ? 'Nenhum pedido com este produto neste mês.'
                      : 'Sem dados de pedidos nos últimos 12 meses.'}
                  </p>
                )
              }

              return (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart
                    data={dadosGrafico}
                    margin={{ top: 8, right: 40, left: 0, bottom: 0 }}
                    onClick={e => {
                      if (!drillMes && e?.activePayload?.[0]) {
                        const item = e.activePayload[0].payload as { _mes?: string }
                        if (item._mes) setDrillMes(item._mes)
                      }
                    }}
                    style={{ cursor: drillMes ? 'default' : 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={v => `R$${v.toFixed(0)}`}
                      width={60}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={v => `${v}%`}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'Margem %') return [`${value?.toFixed(1)}%`, name]
                        return [`R$ ${value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, name]
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="custo" name="Custo" fill="#fca5a5" radius={[3,3,0,0]} />
                    <Bar yAxisId="left" dataKey="preco" name="Preço de Venda" fill="#93c5fd" radius={[3,3,0,0]} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="margem"
                      name="Margem %"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )
            })()}

            {!drillMes && (
              <p className="text-xs text-gray-400 mt-1">
                Clique em um mês para ver o detalhe por dia.
              </p>
            )}
          </section>
```

- [ ] **Step 5: Garantir que `drillMes` reseta ao mudar filtros**

**Atenção:** os handlers de `onChange` foram escritos na Task 6 **antes** de `drillMes` existir. Neste passo é obrigatório voltar ao código do Task 6 e adicionar `setDrillMes(null)` nesses dois lugares:

```tsx
onChange={e => { setProdutoId(...); setResultado(null); setDrillMes(null) }}
onChange={e => { setLojaId(...); setResultado(null); setDrillMes(null) }}
```

- [ ] **Step 6: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 7: Iniciar dev server e testar gráfico**

```bash
npm run dev
```

Ir em Relatórios → Preço × Custo → buscar um produto.
Verificar:
- Gráfico aparece com barras de custo (vermelho claro) e preço (azul claro)
- Linha verde da margem % sobreposta
- Clicar num mês abre detalhe por dia
- Botão "← Voltar" retorna visão mensal

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx
git commit -m "feat(relatorios): adicionar grafico mensal com zoom por dia em PrecoVsCustoTab"
```

---

## Chunk 5: Build e Push Final

### Task 10: Push e build

- [ ] **Step 1: Typecheck final completo**

```bash
npm run typecheck
```

Expected: zero erros.

- [ ] **Step 2: Push para disparar build no GitHub Actions**

```bash
git push
```

Expected: CI inicia builds de mac e windows.

- [ ] **Step 3: Verificar build no GitHub Actions**

Acessar a aba Actions no repositório e confirmar que os builds de mac e windows passam sem erros.

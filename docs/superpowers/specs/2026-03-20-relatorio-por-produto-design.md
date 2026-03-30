# Relatório Por Produto — Design

## Goal

New tab "Por Produto" in the Relatórios page. The user selects a rede, period, and one or more products. The result shows, for each selected product, a table of stores (or franqueados) that bought it with quantity (in the product's unit) and total value.

## New Tab

Added as the 5th tab in `Relatorios.tsx`, after Quinzena, Financeiro, Cobrança, Notas — following the exact same tab pattern.

---

## Filters

| Field | Type | Notes |
|---|---|---|
| Rede | select | required; loads products for that rede |
| Mês | select | 1–12 |
| Ano | number | current year default |
| Período | radio | 1ª Quinzena / 2ª Quinzena / Mês inteiro |
| Produtos | multi-checkbox | lists all products for selected rede; "Todos" toggle |
| Agrupar por | radio | Loja / Franqueado |

Buscar button — disabled until rede and at least one product selected.

---

## Result Layout

For each selected product, one card/section:

```
┌─ ALFACE (kg) ────────────────────────────────┐
│ Loja                 Quantidade    Valor       │
│ SUBWAY AMAZONAS      45 kg         R$ 270,00  │
│ BOB'S CENTRO         30 kg         R$ 180,00  │
│ ─────────────────────────────────────────────  │
│ Total                75 kg         R$ 450,00  │
└───────────────────────────────────────────────┘
```

- Quantity column uses the product's `unidade` field (kg, un, cx, etc.)
- Rows sorted by quantity descending
- Stores/franqueados with zero quantity are omitted
- If "Agrupar por Franqueado": rows show franqueado name; stores with no franqueado group under "Sem franqueado"

Print button at top prints all sections.

---

## Backend

### New function: `getRelatorioPorProduto`

**Parameters:**
- `rede_id: number`
- `produto_ids: number[]`
- `mes: number`
- `ano: number`
- `periodo: '1' | '2' | 'mes'`
- `agrupar_por: 'loja' | 'franqueado'`

**Returns:** `ProdutoRelatorioResult[]`

```ts
type ProdutoRelatorioLinha = {
  nome: string        // loja or franqueado name
  quantidade: number
  valor: number
}

type ProdutoRelatorioResult = {
  produto_id: number
  produto_nome: string
  unidade: string
  linhas: ProdutoRelatorioLinha[]
  total_quantidade: number
  total_valor: number
}
```

**Query logic:**
1. Build date range from mes/ano/periodo (same as other reports)
2. Get pedidos in range for rede_id
3. Get itensPedido for those pedidos where produto_id IN produto_ids
4. Group by produto_id, then by loja_id (or franqueado_id via lojas join)
5. Sum quantidade and (quantidade * preco_unit) per group

### New IPC channel: `RELATORIO_POR_PRODUTO`

Registered in `relatorios.ts` handler, calls `getRelatorioPorProduto`.

### New shared type: `ProdutoRelatorioResult` in `types.ts`

---

## Files to Create/Modify

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `ProdutoRelatorioLinha`, `ProdutoRelatorioResult` |
| `src/shared/ipc-channels.ts` | Add `RELATORIO_POR_PRODUTO` |
| `src/main/services/relatorios.service.ts` | Add `getRelatorioPorProduto` |
| `src/main/handlers/relatorios.ts` | Register new IPC handler |
| `src/renderer/src/pages/Relatorios.tsx` | Add `PorProdutoTab` component + tab button |

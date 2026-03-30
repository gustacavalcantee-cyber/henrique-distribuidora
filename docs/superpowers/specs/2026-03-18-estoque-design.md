# Design: Controle de Estoque

**Date:** 2026-03-18

## Overview

A new "Estoque" tab inside the Lançamentos page that lets the user select one or more products, see total quantities sold per store network (rede) for the current day, compare against a physical stock count (CONTEM), and immediately see the surplus/deficit (S/F) with color coding.

## User Decisions

- **Location:** Tab inside Lançamentos (alongside rede tabs: Subway, Bob's, etc.)
- **Products:** User selects which products to show (default: last selection saved)
- **CONTEM:** Saved as default per product in localStorage, loaded automatically, editable
- **Colors:** S/F cell = green (positive), red (negative), yellow (zero)

## Layout

```
[ + Produto ]  [ ALFACE KG × ]  [ TOMATE KG × ]

              ALFACE KG    TOMATE KG
Subway            75           40
Bob's             70           30
10 Pasteis        20           10
Outros             0            0
─────────────────────────────────────
TOTAL            165           80
CONTEM           850          500    ← editable input, auto-saves
S/F             -685         +420    ← colored cell
```

- **Rows:** One per rede registered in the system + "Outros" catch-all + TOTAL + CONTEM + S/F
- **Columns:** Selected products (nome + unidade)
- **Outros row:** Sum of quantities from redes not present in the current day's orders (edge case filler)
- **TOTAL:** Sum of all rede rows
- **CONTEM:** Editable input; onChange saves to localStorage keyed by produto_id
- **S/F:** CONTEM − TOTAL; color: green > 0, yellow = 0, red < 0

## Data Flow

1. User opens "Estoque" tab (date already set in Lançamentos header)
2. Frontend loads saved product_ids from localStorage (`estoque_produtos`)
3. Frontend calls new IPC `estoque:quantidadesDia(data, produto_ids[])` → returns `Record<rede_id, Record<produto_id, number>>`
4. Frontend reads CONTEM defaults from localStorage (`estoque_contem_{produto_id}`)
5. Table renders with live S/F calculation
6. On CONTEM edit → auto-save to localStorage

## New Backend

### IPC Channel: `estoque:quantidadesDia`

**Input:** `{ data: string, produto_ids: number[] }`

**Query:**
```sql
SELECT p.rede_id, ip.produto_id, SUM(ip.quantidade) as total
FROM itens_pedido ip
JOIN pedidos p ON p.id = ip.pedido_id
WHERE p.data_pedido = :data
  AND ip.produto_id IN (:produto_ids)
GROUP BY p.rede_id, ip.produto_id
```

**Output:** `Record<rede_id, Record<produto_id, number>>`

## Frontend State

```ts
selectedProdIds: number[]          // from localStorage 'estoque_produtos'
contem: Record<number, number>     // from localStorage 'estoque_contem_{id}'
quantidades: Record<number, Record<number, number>>  // rede_id → produto_id → qty
```

## Persistence

- `localStorage['estoque_produtos']` → JSON array of produto_ids
- `localStorage['estoque_contem_{produto_id}']` → number string

## Files to Change

- `src/shared/ipc-channels.ts` — add `ESTOQUE_QUANTIDADES_DIA`
- `src/main/handlers/estoque.ts` — new handler file
- `src/main/index.ts` — register handler
- `src/renderer/src/pages/Lancamentos.tsx` — add "Estoque" tab + EstoqueTab component

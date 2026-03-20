# Lançamentos OC Placeholder + Auto-fill + TAB Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OC appear as a gray suggestion (placeholder) until the user types a quantity, auto-fill OC when quantities are entered, cancel orders when all quantities are cleared, and navigate between quantity cells with TAB.

**Architecture:** All changes are confined to existing files — no new files, no new IPC channels. `useOcNumbers` is simplified (auto-fill effect removed). `handleQuantidadeChange` in `Lancamentos.tsx` gains OC auto-fill logic. `handleCellBlur` gains auto-cancel logic. `LancamentosTable` gains TAB navigation via `data-cell-id` attributes. All three layout components (`LancamentosTable`, `LancamentosLista`, `LancamentosCards`) have `autoFilledOcIds` references removed.

**Tech Stack:** React, TypeScript, Electron IPC (`PEDIDOS_DELETE` already exists), Tailwind CSS

---

## Chunk 1: Simplify useOcNumbers + OC auto-fill on quantity input

### Task 1: Simplify useOcNumbers — remove auto-fill effect

**Files:**
- Modify: `src/renderer/src/hooks/useOcNumbers.ts`

**What to change:**
Remove the `autoFilledOcIds` state, its setter, the `useEffect` that writes placeholders into `row.numero_oc`, and the `resetAutoFill` callback. The hook should only compute `ocPlaceholders` and expose `handleOcChange`.

- [ ] **Step 1: Open `src/renderer/src/hooks/useOcNumbers.ts`**

- [ ] **Step 2: Remove `autoFilledOcIds` state and its setter (line 13)**

Remove:
```ts
const [autoFilledOcIds, setAutoFilledOcIds] = useState<Set<number>>(new Set())
```

- [ ] **Step 3: Remove the auto-fill `useEffect` (lines 52–63)**

Remove the entire block:
```ts
// Auto-preenche OC nas linhas vazias quando ha placeholders disponiveis
useEffect(() => {
  if (!activeRedeId || Object.keys(ocPlaceholders).length === 0) return
  const newAutoIds = new Set<number>()
  setRows(prev => prev.map(row => {
    if (row.numero_oc) return row
    const placeholder = ocPlaceholders[row.loja_id]
    if (!placeholder) return row
    newAutoIds.add(row.loja_id)
    return { ...row, numero_oc: placeholder }
  }))
  setAutoFilledOcIds(prev => new Set([...prev, ...newAutoIds]))
}, [JSON.stringify(ocPlaceholders)])
```

- [ ] **Step 4: Remove `resetAutoFill` callback and update `handleOcChange` to not reference `autoFilledOcIds`**

Remove:
```ts
const resetAutoFill = useCallback(() => {
  setAutoFilledOcIds(new Set())
}, [])
```

In `handleOcChange`, remove the line that deletes from `autoFilledOcIds`:
```ts
setAutoFilledOcIds(prev => { const s = new Set(prev); s.delete(lojaId); return s })
```

- [ ] **Step 5: Update the return statement**

Change from:
```ts
return { ocPlaceholders, autoFilledOcIds, handleOcChange, resetAutoFill }
```

To:
```ts
return { ocPlaceholders, handleOcChange }
```

- [ ] **Step 6: Verify the file looks correct — final version should be:**

```ts
import { useState, useEffect, useCallback } from 'react'
import type { LancamentoRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface UseOcNumbersArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  setRows: React.Dispatch<React.SetStateAction<LancamentoRow[]>>
}

export function useOcNumbers({ activeRedeId, rows, setRows }: UseOcNumbersArgs) {
  const [lastOcBase, setLastOcBase] = useState<{ prefix: string; num: number; pad: number } | null>(null)

  // Busca o ultimo OC desta rede para montar o placeholder
  useEffect(() => {
    if (!activeRedeId) return
    window.electron.invoke<string | null>(IPC.PEDIDOS_LAST_OC, activeRedeId).then(lastOc => {
      if (!lastOc) { setLastOcBase(null); return }
      const match = lastOc.match(/^(.*?)(\d+)$/)
      if (!match) { setLastOcBase(null); return }
      setLastOcBase({ prefix: match[1], num: parseInt(match[2], 10), pad: match[2].length })
    })
  }, [activeRedeId])

  // Calcula os placeholders para linhas sem OC preenchido
  const ocPlaceholders = (() => {
    let baseNum = lastOcBase?.num ?? 0
    let basePrefix = lastOcBase?.prefix ?? ''
    let basePad = lastOcBase?.pad ?? 5
    for (const row of rows) {
      if (!row.numero_oc) continue
      const m = row.numero_oc.match(/^(.*?)(\d+)$/)
      if (m) {
        const n = parseInt(m[2], 10)
        if (n >= baseNum) { baseNum = n; basePrefix = m[1]; basePad = m[2].length }
      }
    }
    if (baseNum === 0) return {} as Record<number, string>
    const result: Record<number, string> = {}
    let counter = 1
    for (const row of rows) {
      if (!row.numero_oc) {
        result[row.loja_id] = basePrefix + String(baseNum + counter).padStart(basePad, '0')
        counter++
      }
    }
    return result
  })()

  // Atualiza OC de uma linha e propaga sequencia para as seguintes
  const handleOcChange = useCallback((lojaId: number, value: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.loja_id === lojaId)
      if (idx === -1) return prev
      const updated = [...prev]
      updated[idx] = { ...updated[idx], numero_oc: value }
      const match = value.match(/^(.*?)(\d+)$/)
      if (match) {
        const prefix = match[1]
        const numStr = match[2]
        const baseNum = parseInt(numStr, 10)
        const pad = numStr.length
        for (let i = idx + 1; i < updated.length; i++) {
          updated[i] = { ...updated[i], numero_oc: prefix + String(baseNum + (i - idx)).padStart(pad, '0') }
        }
      }
      return updated
    })
  }, [setRows])

  return { ocPlaceholders, handleOcChange }
}
```

---

### Task 2: Update `Lancamentos.tsx` — remove `autoFilledOcIds` usages, add OC auto-fill on quantity change, add auto-cancel on blur

**Files:**
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Update the destructure of `useOcNumbers` (line 45)**

Change from:
```ts
const { ocPlaceholders, autoFilledOcIds, handleOcChange, resetAutoFill } = useOcNumbers({ activeRedeId, rows, setRows })
```
To:
```ts
const { ocPlaceholders, handleOcChange } = useOcNumbers({ activeRedeId, rows, setRows })
```

- [ ] **Step 2: Remove the `resetAutoFill()` call in the rede/date reset effect (line 107)**

Change from:
```ts
useEffect(() => {
  isFirstLoad.current = true
  allRowsRef.current = []
  setShowAddMenu(false)
  setShowGlobalProdMenu(false)
  resetRowProdIds()
  resetAutoFill()
}, [activeRedeId, dataPedido])
```
To:
```ts
useEffect(() => {
  isFirstLoad.current = true
  allRowsRef.current = []
  setShowAddMenu(false)
  setShowGlobalProdMenu(false)
  resetRowProdIds()
}, [activeRedeId, dataPedido])
```

- [ ] **Step 3: Update `handleQuantidadeChange` to auto-fill OC when first quantity is entered**

Change from:
```ts
const handleQuantidadeChange = useCallback((lojaId: number, produtoId: number, value: string) => {
  const qty = value === '' ? null : Number(value)
  setRows(prev => prev.map(row =>
    row.loja_id === lojaId
      ? { ...row, quantidades: { ...row.quantidades, [produtoId]: qty } }
      : row
  ))
}, [setRows])
```
To:
```ts
const handleQuantidadeChange = useCallback((lojaId: number, produtoId: number, value: string) => {
  const qty = value === '' ? null : Number(value)
  setRows(prev => prev.map(row => {
    if (row.loja_id !== lojaId) return row
    const updatedRow = { ...row, quantidades: { ...row.quantidades, [produtoId]: qty } }
    // Auto-fill OC from placeholder when user enters first quantity
    if (value !== '' && !row.numero_oc && ocPlaceholders[lojaId]) {
      updatedRow.numero_oc = ocPlaceholders[lojaId]
    }
    return updatedRow
  }))
}, [setRows, ocPlaceholders])
```

- [ ] **Step 4: Update `handleCellBlur` to auto-cancel (delete pedido) when all quantities are cleared**

Change from:
```ts
const handleCellBlur = useCallback(async (row: LancamentoRow) => {
  if (!activeRedeId || !row.numero_oc) return
  await saveRow(enrichRow(row), activeRedeId, dataPedido)
  await load(true)
}, [activeRedeId, dataPedido, saveRow, load, enrichRow])
```
To:
```ts
const handleCellBlur = useCallback(async (row: LancamentoRow) => {
  if (!activeRedeId) return

  // Check if all quantities are empty/null
  const enriched = enrichRow(row)
  const hasAnyQty = Object.values(enriched.quantidades).some(q => q != null && q > 0)

  if (!hasAnyQty && row.pedido_id) {
    // All quantities cleared — cancel this store's order
    await window.electron.invoke(IPC.PEDIDOS_DELETE, row.pedido_id)
    // Clear OC so placeholder reappears
    setRows(prev => prev.map(r =>
      r.loja_id === row.loja_id ? { ...r, numero_oc: '', pedido_id: null } : r
    ))
    return
  }

  if (!row.numero_oc) return
  await saveRow(enriched, activeRedeId, dataPedido)
  await load(true)
}, [activeRedeId, dataPedido, saveRow, load, enrichRow, setRows])
```

- [ ] **Step 5: Remove `autoFilledOcIds` from `sharedProps` (around line 346)**

In the `sharedProps` object, remove:
```ts
autoFilledOcIds,
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/useOcNumbers.ts src/renderer/src/pages/Lancamentos.tsx
git commit -m "feat: OC as placeholder only, auto-fill on quantity input, auto-cancel when cleared"
```

---

## Chunk 2: Remove autoFilledOcIds from layout components + TAB navigation

### Task 3: Remove `autoFilledOcIds` prop and gray styling from all three layout components

**Files:**
- Modify: `src/renderer/src/components/Lancamentos/LancamentosTable.tsx`
- Modify: `src/renderer/src/components/Lancamentos/LancamentosLista.tsx`
- Modify: `src/renderer/src/components/Lancamentos/LancamentosCards.tsx`

**LancamentosTable.tsx:**

- [ ] **Step 1: Remove `autoFilledOcIds` from the `LancamentosTableProps` interface**

Remove:
```ts
autoFilledOcIds: Set<number>
```

- [ ] **Step 2: Remove `autoFilledOcIds` from destructured props**

In the function signature, remove `autoFilledOcIds` from the destructured parameters.

- [ ] **Step 3: Simplify OC input className — remove gray color logic**

Change from:
```tsx
className={`w-full px-1 py-0.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded ${autoFilledOcIds.has(row.loja_id) ? 'text-gray-400' : 'text-slate-800'}`}
```
To:
```tsx
className="w-full px-1 py-0.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
```

**LancamentosLista.tsx:**

- [ ] **Step 4: Remove `autoFilledOcIds` from `LancamentosListaProps` interface**

Remove:
```ts
autoFilledOcIds: Set<number>
```

- [ ] **Step 5: Remove `autoFilledOcIds` from destructured props**

- [ ] **Step 6: Simplify OC input className**

Change from:
```tsx
className={`w-24 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white ${autoFilledOcIds.has(row.loja_id) ? 'text-gray-400' : 'text-slate-800'}`}
```
To:
```tsx
className="w-24 px-2 py-1 text-sm text-slate-800 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
```

**LancamentosCards.tsx:**

- [ ] **Step 7: Remove `autoFilledOcIds` from `LancamentosCardsProps` interface**

Remove:
```ts
autoFilledOcIds: Set<number>
```

- [ ] **Step 8: Remove `autoFilledOcIds` from destructured props**

- [ ] **Step 9: Simplify OC input className**

Change from:
```tsx
className={`flex-1 min-w-0 px-2 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white ${autoFilledOcIds.has(row.loja_id) ? 'text-gray-400' : 'text-slate-700'}`}
```
To:
```tsx
className="flex-1 min-w-0 px-2 py-0.5 text-xs text-slate-700 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
```

---

### Task 4: Add TAB navigation to `LancamentosTable`

**Files:**
- Modify: `src/renderer/src/components/Lancamentos/LancamentosTable.tsx`

TAB navigation should move focus between quantity inputs: left → right within a row, then first product of the next row. Shift+TAB navigates in reverse. Inactive product cells (no input rendered) are skipped automatically since no `data-cell-id` element exists for them.

- [ ] **Step 1: Add `data-cell-id` attribute to each quantity input**

In the quantity input (inside `visibleProdutos.map(p => { ... })`), find the `prodIndex` from the map. Update the `.map` call to include the index:

Change from:
```tsx
{visibleProdutos.map(p => {
  const isActive = rowProdIds[row.loja_id]?.has(p.id)
  const qty = row.quantidades[p.id]
  return (
    <td key={p.id} className="border px-1 py-0.5">
      {isActive ? (
        <input
          className="w-full px-1 py-0.5 text-sm text-center text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
          type="number"
          step={p.unidade === 'KG' ? '0.1' : '1'}
          min="0"
          value={qty ?? ''}
          onChange={e => onQuantidadeChange(row.loja_id, p.id, e.target.value)}
          onBlur={() => onCellBlur(row)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
```
To:
```tsx
{visibleProdutos.map((p, prodIndex) => {
  const isActive = rowProdIds[row.loja_id]?.has(p.id)
  const qty = row.quantidades[p.id]
  return (
    <td key={p.id} className="border px-1 py-0.5">
      {isActive ? (
        <input
          data-cell-id={`${row.loja_id}-${prodIndex}`}
          className="w-full px-1 py-0.5 text-sm text-center text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
          type="number"
          step={p.unidade === 'KG' ? '0.1' : '1'}
          min="0"
          value={qty ?? ''}
          onChange={e => onQuantidadeChange(row.loja_id, p.id, e.target.value)}
          onBlur={() => onCellBlur(row)}
          onKeyDown={e => {
            if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); return }
            if (e.key === 'Tab') {
              e.preventDefault()
              const forward = !e.shiftKey
              const totalProd = visibleProdutos.length
              const rowIndex = rows.findIndex(r => r.loja_id === row.loja_id)
              let pi = prodIndex
              let ri = rowIndex
              // Loop until we find an existing input element (skip inactive cells)
              for (let attempts = 0; attempts < rows.length * totalProd; attempts++) {
                if (forward) { pi++; if (pi >= totalProd) { pi = 0; ri++ } }
                else { pi--; if (pi < 0) { pi = totalProd - 1; ri-- } }
                if (ri < 0 || ri >= rows.length) break
                const nextLojaId = rows[ri].loja_id
                const next = document.querySelector<HTMLInputElement>(
                  `[data-cell-id="${nextLojaId}-${pi}"]`
                )
                if (next) { next.focus(); break }
              }
            }
          }}
        />
```

- [ ] **Step 2: Verify `rows` is now used inside the map — add it to the component's visible scope if needed**

`rows` is already a prop of `LancamentosTable`, so it's accessible inside the `rows.map(row => ...)` callback. No changes needed.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Lancamentos/LancamentosTable.tsx src/renderer/src/components/Lancamentos/LancamentosLista.tsx src/renderer/src/components/Lancamentos/LancamentosCards.tsx
git commit -m "feat: TAB navigation in quantity cells, remove autoFilledOcIds from layout components"
```

---

## Manual Testing Checklist

After implementation, verify:

- [ ] Open Lançamentos on a rede that has a previous OC (e.g. `OC00100`)
- [ ] Confirm OC inputs are **empty** (not filled), but show gray placeholder `OC00101`, `OC00102`, etc.
- [ ] Type a quantity in any product cell for the first row → OC field should auto-fill with `OC00101`
- [ ] Press TAB → focus should jump to the next product cell in the same row
- [ ] Press TAB at the last product of a row → focus should jump to the first product of the next row
- [ ] Press Shift+TAB → focus should go backwards
- [ ] Clear the quantity back to empty, then blur → pedido should be deleted, OC should clear back to empty (placeholder reappears)
- [ ] Edit OC manually to `OC00200` in row 1 → rows 2+ should update to `OC00201`, `OC00202`, etc.
- [ ] Switch to Lista/Cards layout — verify OC inputs are always dark (no gray coloring behavior)
- [ ] Verify TypeScript compiles without errors: `npm run typecheck` (or `npx tsc --noEmit`)

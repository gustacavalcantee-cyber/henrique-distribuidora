# Design: Lançamentos — OC Placeholder + Auto-fill + TAB Navigation

**Date:** 2026-03-20
**Status:** Approved

---

## Summary

Three UX improvements to the Lançamentos table:

1. **OC as true placeholder** — The last OC sequence suggestion appears in gray as HTML placeholder text only; it is never written to `row.numero_oc` automatically on page load.
2. **OC auto-fill on first quantity input** — When the user types any quantity in a row that still has an empty OC, the OC field is automatically filled with the placeholder value for that row.
3. **TAB navigation between quantity cells** — Pressing TAB in a quantity input moves focus to the next product cell (left → right within a row, then first product of the next row). Shift+TAB navigates in reverse.

---

## Architecture

All changes are confined to three files:

| File | Change |
|------|--------|
| `src/renderer/src/hooks/useOcNumbers.ts` | Remove auto-fill effect and `autoFilledOcIds` state |
| `src/renderer/src/hooks/useLancamentos.ts` | Trigger OC fill inside `handleQuantidadeChange` |
| `src/renderer/src/components/Lancamentos/LancamentosTable.tsx` | Add `data-cell-id` attributes + TAB `onKeyDown` handler; remove gray styling based on `autoFilledOcIds` |

No new files, no new IPC channels, no database changes.

---

## Detailed Design

### 1. useOcNumbers.ts — Remove auto-fill

**Remove entirely:**
- The `autoFilledOcIds` state and its setter
- The `useEffect` that writes `ocPlaceholders` values into `row.numero_oc`
- The `resetAutoFill` callback

**Keep:**
- `lastOcBase` state and its fetch effect (unchanged)
- `ocPlaceholders` computed value (unchanged)
- `handleOcChange` callback (unchanged)

**New return shape:**
```ts
return { ocPlaceholders, handleOcChange }
```

### 2. useLancamentos.ts — OC fill on quantity change

Inside `handleQuantidadeChange(lojaId, prodId, value)`, before updating quantities:

```ts
if (value !== '') {
  const row = rows.find(r => r.loja_id === lojaId)
  if (row && !row.numero_oc && ocPlaceholders[lojaId]) {
    // fill OC from placeholder
    setRows(prev => prev.map(r =>
      r.loja_id === lojaId ? { ...r, numero_oc: ocPlaceholders[lojaId] } : r
    ))
  }
}
```

This runs before the quantity update so the OC is already set when `onCellBlur` saves the row.

### 3. LancamentosTable.tsx — TAB navigation + cleanup

**Each quantity input** receives:
```tsx
data-cell-id={`${row.loja_id}-${prodIndex}`}
onKeyDown={e => handleCellKeyDown(e, row.loja_id, prodIndex)}
```

**TAB handler** (defined inside the component or passed as a prop from `useLancamentos`):
```ts
function handleCellKeyDown(
  e: React.KeyboardEvent,
  lojaId: number,
  prodIndex: number
) {
  if (e.key !== 'Tab') return
  e.preventDefault()

  const totalProd = visibleProdutos.length
  const rowIndex = rows.findIndex(r => r.loja_id === lojaId)

  let nextProd = prodIndex + (e.shiftKey ? -1 : 1)
  let nextRow = rowIndex

  if (nextProd >= totalProd) { nextProd = 0; nextRow++ }
  if (nextProd < 0) { nextProd = totalProd - 1; nextRow-- }

  if (nextRow < 0 || nextRow >= rows.length) return

  const nextLojaId = rows[nextRow].loja_id
  const next = document.querySelector<HTMLInputElement>(
    `[data-cell-id="${nextLojaId}-${nextProd}"]`
  )
  next?.focus()
}
```

**Remove from LancamentosTable:**
- `autoFilledOcIds` prop and its usage in OC input className (gray color logic)

**OC input** becomes simply:
```tsx
<input
  className="w-full px-1 py-0.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
  placeholder={ocPlaceholders[row.loja_id] ?? 'OC'}
  value={row.numero_oc}
  onChange={e => onOcChange(row.loja_id, e.target.value)}
  onBlur={() => onCellBlur(row)}
/>
```

---

## Data Flow

```
User types quantity
  → handleQuantidadeChange(lojaId, prodId, value)
      → if row.numero_oc === '' && value !== ''
          → fill row.numero_oc from ocPlaceholders[lojaId]
      → update row.quantidades[prodId]
  → onCellBlur saves row (OC already set)

User presses TAB on quantity input
  → handleCellKeyDown prevents default
  → calculates next (lojaId, prodIndex)
  → querySelector('[data-cell-id="..."]').focus()
```

---

## Error Handling

- If `ocPlaceholders[lojaId]` is undefined (no last OC in network), OC stays empty — no crash.
- If TAB target doesn't exist (last cell + last row on forward, or first cell + first row on backward), navigation is silently ignored.
- TAB skips inactive product cells (where `isActive` is false and no input is rendered) — the `querySelector` will simply find no element for that `data-cell-id`, so the handler should skip ahead. Implementation note: build the next-cell search in a loop until a matching DOM element is found.

---

## Testing

- Start a new day on a rede with a previous OC (e.g. `OC00100`).
- Verify placeholder shows `OC00101` in gray in the first row, `OC00102` in the second, etc.
- Verify `row.numero_oc` is empty (input value is blank, only placeholder visible).
- Type a quantity for the first row — verify OC field fills with `OC00101` automatically.
- Press TAB — verify focus moves to the next product cell.
- Press Shift+TAB — verify focus moves back.
- Edit OC manually in row 1 to `OC00200` — verify rows 2+ update to `OC00201`, `OC00202`, etc.

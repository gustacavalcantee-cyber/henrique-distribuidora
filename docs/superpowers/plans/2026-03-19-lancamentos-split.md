# Lancamentos Split — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividir `Lancamentos.tsx` (1010 linhas) em 9 arquivos com responsabilidade unica, sem mudar nenhum comportamento visivel.

**Architecture:** Extrair logica em hooks (`useRowProdutos`, `useOcNumbers`), mover componentes visuais para `components/Lancamentos/`, e deixar `Lancamentos.tsx` como orquestrador fino de ~80 linhas. Cada extracao e feita um arquivo por vez — ao final de cada tarefa o app DEVE continuar funcionando identicamente.

**Tech Stack:** React 18, TypeScript, Electron, Tailwind CSS, Vite. Sem framework de testes para componentes UI — verificacao via `npm run dev`.

---

## Arquivos

### Criados
- `src/renderer/src/hooks/useRowProdutos.ts` — estado e handlers de colunas de produto por loja
- `src/renderer/src/hooks/useOcNumbers.ts` — numeracao OC, placeholders e auto-fill
- `src/renderer/src/components/Lancamentos/ShareModal.tsx` — modal de share/WhatsApp
- `src/renderer/src/components/Lancamentos/ProdutoRowMenu.tsx` — picker de produtos por loja (portal)
- `src/renderer/src/components/Lancamentos/LancamentosTable.tsx` — tabela principal
- `src/renderer/src/components/Lancamentos/LancamentosHeader.tsx` — cabecalho (data, editar, produto global)
- `src/renderer/src/pages/EstoqueTab.tsx` — aba de estoque

### Modificados
- `src/renderer/src/pages/Lancamentos.tsx` — reescrito como orquestrador ~80 linhas

---

## Chunk 1: Extrair EstoqueTab e hooks de estado

### Task 1: Extrair EstoqueTab para arquivo proprio

**Files:**
- Create: `src/renderer/src/pages/EstoqueTab.tsx`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Criar o arquivo EstoqueTab.tsx**

Copiar o codigo da funcao `EstoqueTab` (linhas 821-1009 do Lancamentos.tsx) e a interface `EstoqueTabProps` para o novo arquivo:

```tsx
// src/renderer/src/pages/EstoqueTab.tsx
import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import type { Rede, Produto } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface EstoqueTabProps {
  dataPedido: string
  redes: Rede[]
  produtos: Produto[]
}

export function EstoqueTab({ dataPedido, redes, produtos }: EstoqueTabProps) {
  const STORAGE_PRODS_KEY = 'estoque_produtos'

  const [selectedProdIds, setSelectedProdIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PRODS_KEY) ?? '[]') } catch { return [] }
  })

  const [contem, setContem] = useState<Record<number, string>>(() => {
    const result: Record<number, string> = {}
    try {
      const ids: number[] = JSON.parse(localStorage.getItem(STORAGE_PRODS_KEY) ?? '[]')
      for (const id of ids) {
        const v = localStorage.getItem(`estoque_contem_${id}`)
        if (v != null) result[id] = v
      }
    } catch { /* ignore */ }
    return result
  })

  const [quantidades, setQuantidades] = useState<Record<number, Record<number, number>>>({})
  const [showProdPicker, setShowProdPicker] = useState(false)
  const [prodSearch, setProdSearch] = useState('')

  const uniqueProdutos = [...produtos]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)

  const selectedProdutos = uniqueProdutos.filter(p => selectedProdIds.includes(p.id))

  useEffect(() => {
    if (selectedProdIds.length === 0) { setQuantidades({}); return }
    window.electron.invoke<Record<number, Record<number, number>>>(
      IPC.ESTOQUE_QUANTIDADES_DIA, dataPedido, selectedProdIds
    ).then(setQuantidades).catch(() => setQuantidades({}))
  }, [dataPedido, JSON.stringify(selectedProdIds)])

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

  const handleContemChange = (prodId: number, value: string) => {
    setContem(prev => ({ ...prev, [prodId]: value }))
    localStorage.setItem(`estoque_contem_${prodId}`, value)
  }

  const totals: Record<number, number> = {}
  for (const prodId of selectedProdIds) {
    totals[prodId] = Object.values(quantidades).reduce((sum, redeQtd) => sum + (redeQtd[prodId] ?? 0), 0)
  }

  const sfColor = (prodId: number): string => {
    const contemVal = parseFloat(contem[prodId] ?? '0') || 0
    const diff = contemVal - (totals[prodId] ?? 0)
    if (diff > 0) return 'bg-green-100 text-green-800 font-bold'
    if (diff < 0) return 'bg-red-100 text-red-800 font-bold'
    return 'bg-yellow-100 text-yellow-800 font-bold'
  }

  const sfValue = (prodId: number): string => {
    const contemVal = parseFloat(contem[prodId] ?? '0') || 0
    const diff = contemVal - (totals[prodId] ?? 0)
    return (diff > 0 ? '+' : '') + (Math.round(diff * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }

  const availableToAdd = uniqueProdutos.filter(p =>
    !selectedProdIds.includes(p.id) &&
    p.nome.toLowerCase().includes(prodSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4" onClick={() => setShowProdPicker(false)}>
      <div className="flex items-center gap-2 flex-wrap">
        {selectedProdutos.map(p => (
          <span key={p.id} className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 text-sm rounded-full">
            {p.nome} {p.unidade}
            <button onClick={() => handleRemoveProd(p.id)} className="ml-1 text-emerald-600 hover:text-red-500 font-bold leading-none">x</button>
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
                      {qty > 0
                        ? (Math.round(qty * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                        : <span className="text-gray-300">-</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="bg-gray-50">
              <td className="border px-3 py-1.5 text-xs text-gray-600 font-bold">TOTAL</td>
              {selectedProdutos.map(p => (
                <td key={p.id} className="border px-3 py-1.5 text-center text-sm font-bold">
                  {(Math.round((totals[p.id] ?? 0) * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
              ))}
            </tr>
            <tr className="bg-blue-50">
              <td className="border px-3 py-1.5 text-xs text-blue-700 font-semibold">CONTEM</td>
              {selectedProdutos.map(p => (
                <td key={p.id} className="border px-1 py-0.5">
                  <input
                    type="number"
                    className="w-full px-1 py-0.5 text-sm text-center border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    value={contem[p.id] ?? ''}
                    onChange={e => handleContemChange(p.id, e.target.value)}
                    placeholder="0"
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border px-3 py-1.5 text-xs font-semibold text-gray-600">S/F</td>
              {selectedProdutos.map(p => (
                <td key={p.id} className={`border px-3 py-1.5 text-center text-sm ${sfColor(p.id)}`}>
                  {sfValue(p.id)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Em Lancamentos.tsx, substituir o bloco EstoqueTab por import**

No topo do arquivo, adicionar:
```ts
import { EstoqueTab } from './EstoqueTab'
```

Depois remover toda a funcao `EstoqueTab` e a interface `EstoqueTabProps` do final do arquivo (linhas 821-1009).

- [ ] **Step 3: Verificar que o app ainda funciona**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm run dev
```

Abrir o app, ir na aba **Estoque** e confirmar que funciona igual a antes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/EstoqueTab.tsx src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract EstoqueTab to own file"
```

---

### Task 2: Criar hook useRowProdutos

**Files:**
- Create: `src/renderer/src/hooks/useRowProdutos.ts`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Criar o arquivo useRowProdutos.ts**

```ts
// src/renderer/src/hooks/useRowProdutos.ts
import { useState, useCallback, useEffect } from 'react'
import type { Produto, LancamentoRow } from '../../../shared/types'

interface UseRowProdutosArgs {
  activeRedeId: number | null
  rows: LancamentoRow[]
  produtos: Produto[]
}

export function useRowProdutos({ activeRedeId, rows, produtos }: UseRowProdutosArgs) {
  const [rowProdIds, setRowProdIds] = useState<Record<number, Set<number>>>({})
  const [showRowProdMenu, setShowRowProdMenu] = useState<number | null>(null)
  const [rowProdSearch, setRowProdSearch] = useState('')
  const [rowProdMenuPos, setRowProdMenuPos] = useState<{ top: number; left: number } | null>(null)

  // Inicializa do localStorage ou dos produtos da rede + quantidades existentes
  useEffect(() => {
    if (!activeRedeId || rows.length === 0 || produtos.length === 0) return
    setRowProdIds(prev => {
      const next = { ...prev }
      for (const row of rows) {
        if (next[row.loja_id] !== undefined) continue
        const key = `row_prods_${activeRedeId}_${row.loja_id}`
        const saved = localStorage.getItem(key)
        if (saved) {
          const ids: number[] = JSON.parse(saved)
          next[row.loja_id] = new Set(ids.filter(id => produtos.some(p => p.id === id)))
        } else {
          const redeProds = produtos.filter(p => p.rede_id === activeRedeId).map(p => p.id)
          const fromOrder = Object.entries(row.quantidades)
            .filter(([, qty]) => qty != null)
            .map(([id]) => Number(id))
          next[row.loja_id] = new Set([...redeProds, ...fromOrder])
        }
      }
      return next
    })
  }, [activeRedeId, rows, produtos])

  // Chame isso ao trocar de rede ou data
  const resetRowProdIds = useCallback(() => {
    setRowProdIds({})
    setShowRowProdMenu(null)
  }, [])

  // Liga/desliga um produto para uma loja especifica
  const handleToggleRowProd = useCallback((lojaId: number, prodId: number) => {
    if (!activeRedeId) return
    setRowProdIds(prev => {
      const current = new Set(prev[lojaId] ?? [])
      current.has(prodId) ? current.delete(prodId) : current.add(prodId)
      const next = { ...prev, [lojaId]: current }
      localStorage.setItem(`row_prods_${activeRedeId}_${lojaId}`, JSON.stringify([...current]))
      return next
    })
  }, [activeRedeId])

  // Remove uma coluna de produto de TODAS as lojas
  const handleRemoveColumn = useCallback((prodId: number) => {
    if (!activeRedeId) return
    setRowProdIds(prev => {
      const next = { ...prev }
      for (const lojaId of Object.keys(next).map(Number)) {
        const s = new Set(next[lojaId])
        s.delete(prodId)
        next[lojaId] = s
        localStorage.setItem(`row_prods_${activeRedeId}_${lojaId}`, JSON.stringify([...s]))
      }
      return next
    })
  }, [activeRedeId])

  // Liga/desliga um produto para TODAS as lojas simultaneamente
  const handleToggleGlobalProd = useCallback((prodId: number) => {
    if (!activeRedeId) return
    setRowProdIds(prev => {
      const inAll = rows.length > 0 && rows.every(row => prev[row.loja_id]?.has(prodId))
      const addToAll = !inAll
      const next = { ...prev }
      for (const row of rows) {
        const s = new Set(next[row.loja_id] ?? [])
        addToAll ? s.add(prodId) : s.delete(prodId)
        next[row.loja_id] = s
        localStorage.setItem(`row_prods_${activeRedeId}_${row.loja_id}`, JSON.stringify([...s]))
      }
      return next
    })
  }, [activeRedeId, rows])

  return {
    rowProdIds,
    showRowProdMenu, setShowRowProdMenu,
    rowProdSearch, setRowProdSearch,
    rowProdMenuPos, setRowProdMenuPos,
    resetRowProdIds,
    handleToggleRowProd,
    handleRemoveColumn,
    handleToggleGlobalProd,
  }
}
```

- [ ] **Step 2: Substituir estado/handlers em Lancamentos.tsx**

No `Lancamentos.tsx`:

1. Adicionar import no topo:
```ts
import { useRowProdutos } from '../hooks/useRowProdutos'
```

2. Remover os estados:
```ts
// REMOVER estas linhas:
const [rowProdIds, setRowProdIds] = useState<Record<number, Set<number>>>({})
const [showRowProdMenu, setShowRowProdMenu] = useState<number | null>(null)
const [rowProdSearch, setRowProdSearch] = useState('')
const [rowProdMenuPos, setRowProdMenuPos] = useState<{ top: number; left: number } | null>(null)
```

3. Remover os 3 useEffects de rowProdIds (inicializacao e reset) e os 3 handlers (`handleToggleRowProd`, `handleRemoveColumn`, `handleToggleGlobalProd`).

4. Adicionar o hook logo apos o `useLancamentos`:
```ts
const {
  rowProdIds,
  showRowProdMenu, setShowRowProdMenu,
  rowProdSearch, setRowProdSearch,
  rowProdMenuPos, setRowProdMenuPos,
  resetRowProdIds,
  handleToggleRowProd,
  handleRemoveColumn,
  handleToggleGlobalProd,
} = useRowProdutos({ activeRedeId, rows, produtos })
```

5. No useEffect de reset (troca de rede/data), substituir `setRowProdIds({})` por `resetRowProdIds()`:
```ts
useEffect(() => {
  isFirstLoad.current = true
  allRowsRef.current = []
  setShowAddMenu(false)
  setShowGlobalProdMenu(false)
  resetRowProdIds() // <-- era setRowProdIds({}) + setShowRowProdMenu(null)
}, [activeRedeId, dataPedido])
```

- [ ] **Step 3: Verificar que o app funciona**

```bash
npm run dev
```

Testar: abrir aba Lancamentos, verificar que colunas de produtos aparecem, adicionar/remover produto de uma loja, confirmar que a selecao persiste apos trocar de rede e voltar.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useRowProdutos.ts src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract useRowProdutos hook"
```

---

### Task 3: Criar hook useOcNumbers

**Files:**
- Create: `src/renderer/src/hooks/useOcNumbers.ts`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Criar useOcNumbers.ts**

```ts
// src/renderer/src/hooks/useOcNumbers.ts
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
  const [autoFilledOcIds, setAutoFilledOcIds] = useState<Set<number>>(new Set())

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

  // Atualiza OC de uma linha e propaga sequencia para as seguintes
  const handleOcChange = useCallback((lojaId: number, value: string) => {
    setAutoFilledOcIds(prev => { const s = new Set(prev); s.delete(lojaId); return s })
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

  const resetAutoFill = useCallback(() => {
    setAutoFilledOcIds(new Set())
  }, [])

  return { ocPlaceholders, autoFilledOcIds, handleOcChange, resetAutoFill }
}
```

- [ ] **Step 2: Substituir em Lancamentos.tsx**

1. Adicionar import:
```ts
import { useOcNumbers } from '../hooks/useOcNumbers'
```

2. Remover estados:
```ts
// REMOVER:
const [lastOcBase, setLastOcBase] = useState<...>(null)
const [autoFilledOcIds, setAutoFilledOcIds] = useState<Set<number>>(new Set())
```

3. Remover o useEffect que busca `PEDIDOS_LAST_OC`, a variavel `ocPlaceholders`, o useEffect de auto-fill, e o handler `handleOcChange`.

4. Adicionar o hook:
```ts
const { ocPlaceholders, autoFilledOcIds, handleOcChange, resetAutoFill } = useOcNumbers({
  activeRedeId,
  rows,
  setRows,
})
```

5. No useEffect de reset, adicionar `resetAutoFill()`:
```ts
useEffect(() => {
  isFirstLoad.current = true
  allRowsRef.current = []
  setShowAddMenu(false)
  setShowGlobalProdMenu(false)
  resetRowProdIds()
  resetAutoFill() // <-- adicionar
}, [activeRedeId, dataPedido])
```

- [ ] **Step 3: Verificar que o app funciona**

```bash
npm run dev
```

Testar: ao trocar de rede, OC deve ser calculado automaticamente em sequencia. Ao digitar um OC em uma linha, as seguintes devem ser atualizadas.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useOcNumbers.ts src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract useOcNumbers hook"
```

---

## Chunk 2: Extrair componentes visuais

### Task 4: Criar ShareModal

**Files:**
- Create: `src/renderer/src/components/Lancamentos/ShareModal.tsx`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Criar pasta e arquivo**

```bash
mkdir -p "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa/src/renderer/src/components/Lancamentos"
```

```tsx
// src/renderer/src/components/Lancamentos/ShareModal.tsx
import { createPortal } from 'react-dom'
import { Share2, X, Check } from 'lucide-react'
import { IPC } from '../../../../shared/ipc-channels'

interface ShareModalProps {
  sharePreview: { image: string; pedidoId: number } | null
  shareCopied: boolean
  onClose: () => void
  onCopy: () => void
}

export function ShareModal({ sharePreview, shareCopied, onClose, onCopy }: ShareModalProps) {
  if (!sharePreview) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl flex flex-col max-h-[90vh] mx-4"
        style={{ width: 580 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <Share2 size={16} />
            Previa da nota
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 bg-gray-100">
          <img src={sharePreview.image} alt="Nota" className="w-full shadow-md rounded" />
        </div>
        <div className="flex gap-2 justify-end px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            {shareCopied
              ? <><Check size={14} className="text-green-600" /> Copiado!</>
              : 'Copiar imagem'}
          </button>
          <a
            href={sharePreview.image}
            download={`nota-${sharePreview.pedidoId}.png`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            Salvar
          </a>
          <button
            onClick={async () => {
              await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview.image)
              await window.electron.invoke(IPC.SHARE_NOTA, sharePreview.pedidoId)
              onClose()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            <Share2 size={14} />
            Enviar via WhatsApp
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Substituir em Lancamentos.tsx**

1. Adicionar import:
```ts
import { ShareModal } from '../components/Lancamentos/ShareModal'
```

2. No JSX do Lancamentos, localizar o bloco `{sharePreview && createPortal(...)}` (linhas 767-816) e substituir por:
```tsx
<ShareModal
  sharePreview={sharePreview}
  shareCopied={shareCopied}
  onClose={() => setSharePreview(null)}
  onCopy={async () => {
    await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview!.image)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }}
/>
```

3. Remover o import de `createPortal` se nao for mais usado em outro lugar no arquivo (verificar se `ProdutoRowMenu` ainda usa portal — sim, por enquanto ainda usa, entao manter o import).

- [ ] **Step 3: Verificar**

```bash
npm run dev
```

Clicar em "Enviar" em uma linha, confirmar que o modal de previa aparece, as opcoes Copiar/Salvar/WhatsApp funcionam.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Lancamentos/ShareModal.tsx src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract ShareModal component"
```

---

### Task 5: Criar ProdutoRowMenu

**Files:**
- Create: `src/renderer/src/components/Lancamentos/ProdutoRowMenu.tsx`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Criar ProdutoRowMenu.tsx**

```tsx
// src/renderer/src/components/Lancamentos/ProdutoRowMenu.tsx
import { createPortal } from 'react-dom'
import type { Produto, Preco } from '../../../../shared/types'
import { IPC } from '../../../../shared/ipc-channels'

interface ProdutoRowMenuProps {
  lojaId: number
  lojaNome: string
  pos: { top: number; left: number }
  produtos: Produto[]
  precos: Preco[]
  rowProdIds: Record<number, Set<number>>
  rowProdSearch: string
  rowInlinePriceDraft: Record<number, string>
  onSearch: (v: string) => void
  onToggle: (lojaId: number, prodId: number) => void
  onPriceDraftChange: (prodId: number, v: string) => void
  onPriceBlur: (prodId: number, val: string) => Promise<void>
}

export function ProdutoRowMenu({
  lojaId,
  lojaNome,
  pos,
  produtos,
  rowProdIds,
  rowProdSearch,
  rowInlinePriceDraft,
  onSearch,
  onToggle,
  onPriceDraftChange,
  onPriceBlur,
}: ProdutoRowMenuProps) {
  return createPortal(
    <div
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded shadow-xl w-72"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-600">
        {lojaNome}
      </div>
      <div className="p-1.5 border-b border-gray-100">
        <input
          autoFocus
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Buscar produto..."
          value={rowProdSearch}
          onChange={e => onSearch(e.target.value)}
        />
      </div>
      <div className="px-3 py-1 border-b border-gray-100 grid grid-cols-2 gap-2 text-xs text-gray-400">
        <span>Produto</span><span className="text-right">Preco (R$)</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {[...produtos]
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
          .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
          .filter(p => p.nome.toLowerCase().includes(rowProdSearch.toLowerCase()))
          .map(p => {
            const isActive = rowProdIds[lojaId]?.has(p.id)
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1 px-2 py-1 border-b border-gray-50 ${isActive ? 'bg-white' : 'bg-gray-50'}`}
              >
                <button
                  onClick={() => onToggle(lojaId, p.id)}
                  className={`flex items-center gap-1.5 flex-1 text-left text-sm ${isActive ? 'text-gray-800' : 'text-gray-400'}`}
                >
                  <span className={`w-4 text-center text-xs font-bold ${isActive ? 'text-blue-500' : 'text-gray-300'}`}>
                    {isActive ? '✓' : '+'}
                  </span>
                  <span className="flex-1">{p.nome}</span>
                  <span className="text-xs opacity-40">{p.unidade}</span>
                </button>
                <input
                  className="w-16 px-1 py-0.5 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="-"
                  value={rowInlinePriceDraft[p.id] ?? ''}
                  onChange={e => onPriceDraftChange(p.id, e.target.value)}
                  onBlur={e => onPriceBlur(p.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>
            )
          })}
        {produtos.filter(p => p.nome.toLowerCase().includes(rowProdSearch.toLowerCase())).length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado.</p>
        )}
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Substituir em Lancamentos.tsx**

1. Adicionar import:
```ts
import { ProdutoRowMenu } from '../components/Lancamentos/ProdutoRowMenu'
```

2. Localizar o bloco `{showRowProdMenu !== null && rowProdMenuPos && createPortal(...)}` (linhas 467-535) e substituir por:
```tsx
{showRowProdMenu !== null && rowProdMenuPos && (
  <ProdutoRowMenu
    lojaId={showRowProdMenu}
    lojaNome={rows.find(r => r.loja_id === showRowProdMenu)?.loja_nome ?? ''}
    pos={rowProdMenuPos}
    produtos={produtos}
    precos={precos}
    rowProdIds={rowProdIds}
    rowProdSearch={rowProdSearch}
    rowInlinePriceDraft={rowInlinePriceDraft}
    onSearch={setRowProdSearch}
    onToggle={handleToggleRowProd}
    onPriceDraftChange={(prodId, v) => setRowInlinePriceDraft(prev => ({ ...prev, [prodId]: v }))}
    onPriceBlur={async (prodId, val) => {
      if (val === '' || isNaN(Number(val))) return
      await window.electron.invoke(IPC.PRECOS_UPSERT, {
        produto_id: prodId,
        loja_id: showRowProdMenu!,
        preco_venda: Number(val),
      })
      const updated = await window.electron.invoke<Preco[]>(IPC.PRECOS_LIST)
      setPrecos(updated)
    }}
  />
)}
```

- [ ] **Step 3: Verificar**

```bash
npm run dev
```

Clicar no botao "+" de ACOES em uma linha no modo Editar, confirmar que o menu de produtos aparece com busca e campo de preco funcionando.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Lancamentos/ProdutoRowMenu.tsx src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract ProdutoRowMenu component"
```

---

### Task 6: Criar LancamentosTable

**Files:**
- Create: `src/renderer/src/components/Lancamentos/LancamentosTable.tsx`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Definir a interface de props**

A tabela precisa de todos os dados e handlers que usa. Criar o arquivo:

```tsx
// src/renderer/src/components/Lancamentos/LancamentosTable.tsx
import { ChevronUp, ChevronDown, X, Plus, Printer } from 'lucide-react'
import { Share2 } from 'lucide-react'
import type { Produto, LancamentoRow } from '../../../../shared/types'

interface LancamentosTableProps {
  rows: LancamentoRow[]
  visibleProdutos: Produto[]
  totals: Record<number, number>
  rowProdIds: Record<number, Set<number>>
  editMode: boolean
  autoFilledOcIds: Set<number>
  ocPlaceholders: Record<number, string>
  editingLojaId: number | null
  editingLojaNome: string
  showRowProdMenu: number | null
  shareLoading: boolean
  onQuantidadeChange: (lojaId: number, prodId: number, value: string) => void
  onOcChange: (lojaId: number, value: string) => void
  onCellBlur: (row: LancamentoRow) => void
  onMoveUp: (lojaId: number) => void
  onMoveDown: (lojaId: number) => void
  onDeleteRow: (lojaId: number) => void
  onRemoveColumn: (prodId: number) => void
  onToggleRowProd: (lojaId: number, prodId: number) => void
  onSaveLojaNome: (lojaId: number) => void
  onPrint: (row: LancamentoRow) => void
  onShare: (row: LancamentoRow) => void
  onOpenRowProdMenu: (e: React.MouseEvent, lojaId: number) => void
  onEditLoja: (lojaId: number, nome: string) => void
  onEditLojaNameChange: (v: string) => void
  onEditLojaKeyDown: (e: React.KeyboardEvent, lojaId: number) => void
  onApplyAll: (prodId: number, qty: number | null) => void
}

export function LancamentosTable({
  rows, visibleProdutos, totals, rowProdIds, editMode,
  autoFilledOcIds, ocPlaceholders, editingLojaId, editingLojaNome,
  showRowProdMenu, shareLoading,
  onQuantidadeChange, onOcChange, onCellBlur, onMoveUp, onMoveDown,
  onDeleteRow, onRemoveColumn, onToggleRowProd, onSaveLojaNome,
  onPrint, onShare, onOpenRowProdMenu, onEditLoja, onEditLojaNameChange,
  onEditLojaKeyDown, onApplyAll,
}: LancamentosTableProps) {
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
        <thead>
          {/* Linha de totais */}
          <tr className="bg-gray-100">
            <th className="border px-2 py-1 text-left text-xs text-gray-500 w-28">TOTAL</th>
            <th className="border px-2 py-1 w-32"></th>
            {visibleProdutos.map(p => (
              <th key={p.id} className="border px-2 py-1 text-center font-bold w-24">
                {totals[p.id] != null
                  ? (Math.round(totals[p.id] * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                  : ''}
              </th>
            ))}
            <th className="border px-2 py-1 w-36"></th>
          </tr>

          {/* Linha TODAS — so em modo edicao */}
          {editMode && (
            <tr className="bg-emerald-50">
              <th className="border px-2 py-1 text-left text-xs text-emerald-700 font-semibold w-28">TODAS</th>
              <th className="border px-2 py-1 w-32 text-xs text-emerald-600 font-normal text-left">Aplicar a todas</th>
              {visibleProdutos.map(p => (
                <th key={p.id} className="border px-1 py-0.5 w-24">
                  <input
                    className="w-full px-1 py-0.5 text-sm text-center text-emerald-800 bg-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded placeholder-emerald-300"
                    type="number"
                    step={p.unidade === 'KG' ? '0.1' : '1'}
                    min="0"
                    placeholder="-"
                    onChange={e => {
                      const qty = e.target.value === '' ? null : Number(e.target.value)
                      onApplyAll(p.id, qty)
                    }}
                  />
                </th>
              ))}
              <th className="border px-2 py-1 w-36"></th>
            </tr>
          )}

          {/* Cabecalho das colunas */}
          <tr className="bg-gray-50">
            <th className="border px-2 py-1 text-left text-xs text-gray-600">NOTA</th>
            <th className="border px-2 py-1 text-left text-xs text-gray-600">LOJA</th>
            {visibleProdutos.map(p => (
              <th key={p.id} className="border px-1 py-1 text-center text-xs text-gray-600 uppercase">
                <div className="flex items-center justify-center gap-1">
                  <span>{p.nome}</span>
                  {editMode && (
                    <button
                      onClick={() => onRemoveColumn(p.id)}
                      title="Remover de todas as lojas"
                      className="text-gray-300 hover:text-red-400 leading-none"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="text-gray-400 font-normal">{p.unidade}</div>
              </th>
            ))}
            <th className="border px-2 py-1 text-xs text-gray-600">ACOES</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.loja_id} className="hover:bg-gray-50">
              {/* Campo OC */}
              <td className="border px-1 py-0.5">
                <input
                  className={`w-full px-1 py-0.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded ${autoFilledOcIds.has(row.loja_id) ? 'text-gray-400' : 'text-slate-800'}`}
                  placeholder={ocPlaceholders[row.loja_id] ?? 'OC'}
                  value={row.numero_oc}
                  onChange={e => onOcChange(row.loja_id, e.target.value)}
                  onBlur={() => onCellBlur(row)}
                />
              </td>

              {/* Nome da loja */}
              <td className="border px-1 py-0.5 font-medium text-gray-700 whitespace-nowrap">
                {editingLojaId === row.loja_id ? (
                  <input
                    autoFocus
                    className="w-full px-1 py-0.5 text-sm text-slate-800 bg-white border border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                    value={editingLojaNome}
                    onChange={e => onEditLojaNameChange(e.target.value)}
                    onBlur={() => onSaveLojaNome(row.loja_id)}
                    onKeyDown={e => onEditLojaKeyDown(e, row.loja_id)}
                  />
                ) : (
                  <span
                    className="block px-1 py-0.5 cursor-pointer hover:bg-gray-100 rounded"
                    title="Clique duplo para editar"
                    onDoubleClick={() => onEditLoja(row.loja_id, row.loja_nome)}
                  >
                    {row.loja_nome}
                  </span>
                )}
              </td>

              {/* Celulas de quantidade */}
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
                    ) : editMode ? (
                      <button
                        className="w-full h-6 flex items-center justify-center text-gray-200 hover:text-blue-400 hover:bg-blue-50 rounded"
                        title="Adicionar para esta loja"
                        onClick={e => { e.stopPropagation(); onToggleRowProd(row.loja_id, p.id) }}
                      >
                        <Plus size={10} />
                      </button>
                    ) : null}
                  </td>
                )
              })}

              {/* Acoes */}
              <td className="border px-1 py-0.5">
                <div className="flex items-center gap-1">
                  {editMode && (
                    <>
                      <button
                        onClick={e => onOpenRowProdMenu(e, row.loja_id)}
                        title="Gerenciar produtos desta loja"
                        className={`flex items-center gap-0.5 px-1 py-0.5 text-xs rounded ${
                          (rowProdIds[row.loja_id]?.size ?? 0) === 0
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                        }`}
                      >
                        <Plus size={12} />
                        {(rowProdIds[row.loja_id]?.size ?? 0) === 0 && <span>Produtos</span>}
                      </button>
                      <button
                        onClick={() => onMoveUp(row.loja_id)}
                        title="Mover para cima"
                        className="p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => onMoveDown(row.loja_id)}
                        title="Mover para baixo"
                        className="p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onPrint(row)}
                    disabled={!row.pedido_id}
                    title="Imprimir"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer size={12} />
                    Imprimir
                  </button>
                  <button
                    onClick={() => onShare(row)}
                    disabled={!row.pedido_id || shareLoading}
                    title="Compartilhar nota como imagem"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Share2 size={12} />
                    {shareLoading ? 'Gerando...' : 'Enviar'}
                  </button>
                  {editMode && (
                    <button
                      onClick={() => onDeleteRow(row.loja_id)}
                      title="Remover da lista"
                      className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={visibleProdutos.length + 3} className="text-center text-gray-400 py-8">
                Nenhuma loja cadastrada para esta rede.
              </td>
            </tr>
          )}
          {rows.length > 0 && visibleProdutos.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center text-gray-400 py-6 text-sm">
                Clique em <strong>+</strong> em ACOES para adicionar produtos a cada loja.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Substituir em Lancamentos.tsx**

1. Adicionar import:
```ts
import { LancamentosTable } from '../components/Lancamentos/LancamentosTable'
```

2. Substituir o bloco `<div style={{ overflowX: 'auto'... }}>...</div>` (que contem a tabela inteira) por:
```tsx
<LancamentosTable
  rows={rows}
  visibleProdutos={visibleProdutos}
  totals={totals}
  rowProdIds={rowProdIds}
  editMode={editMode}
  autoFilledOcIds={autoFilledOcIds}
  ocPlaceholders={ocPlaceholders}
  editingLojaId={editingLojaId}
  editingLojaNome={editingLojaNome}
  showRowProdMenu={showRowProdMenu}
  shareLoading={shareLoading}
  onQuantidadeChange={handleQuantidadeChange}
  onOcChange={handleOcChange}
  onCellBlur={handleCellBlur}
  onMoveUp={handleMoveUp}
  onMoveDown={handleMoveDown}
  onDeleteRow={handleDeleteRow}
  onRemoveColumn={handleRemoveColumn}
  onToggleRowProd={handleToggleRowProd}
  onSaveLojaNome={handleSaveLojaNome}
  onPrint={handlePrint}
  onShare={handleShare}
  onOpenRowProdMenu={(e, lojaId) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pickerW = 288; const pickerH = 400
    const rawLeft = rect.left - 150
    const left = Math.min(window.innerWidth - pickerW - 4, Math.max(4, rawLeft))
    const top = rect.bottom + 4 + pickerH > window.innerHeight
      ? Math.max(4, rect.top - pickerH - 4) : rect.bottom + 4
    setRowProdMenuPos({ top, left })
    setShowRowProdMenu(showRowProdMenu === lojaId ? null : lojaId)
    setRowProdSearch('')
    setShowGlobalProdMenu(false)
    setShowAddMenu(false)
    const draft: Record<number, string> = {}
    for (const p of produtos) {
      const pr = precos.find(x => x.produto_id === p.id && x.loja_id === lojaId && x.vigencia_fim === null)
      if (pr) draft[p.id] = String(pr.preco_venda)
    }
    setRowInlinePriceDraft(draft)
  }}
  onEditLoja={(lojaId, nome) => { setEditingLojaId(lojaId); setEditingLojaNome(nome) }}
  onEditLojaNameChange={setEditingLojaNome}
  onEditLojaKeyDown={(e, lojaId) => {
    if (e.key === 'Enter') handleSaveLojaNome(lojaId)
    if (e.key === 'Escape') setEditingLojaId(null)
  }}
  onApplyAll={(prodId, qty) => {
    setRows(prev => prev.map(row => {
      if (!rowProdIds[row.loja_id]?.has(prodId)) return row
      return { ...row, quantidades: { ...row.quantidades, [prodId]: qty } }
    }))
  }}
/>
```

- [ ] **Step 3: Verificar**

```bash
npm run dev
```

Verificar: tabela renderiza corretamente, campos editaveis funcionam, botoes de acao (imprimir, enviar, mover, remover) funcionam.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Lancamentos/LancamentosTable.tsx src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract LancamentosTable component"
```

---

### Task 7: Criar LancamentosHeader

**Files:**
- Create: `src/renderer/src/components/Lancamentos/LancamentosHeader.tsx`
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Criar LancamentosHeader.tsx**

```tsx
// src/renderer/src/components/Lancamentos/LancamentosHeader.tsx
import { Plus, Pencil, Check } from 'lucide-react'
import type { Produto, LancamentoRow } from '../../../../shared/types'

interface LancamentosHeaderProps {
  dataPedido: string
  editMode: boolean
  hiddenRows: LancamentoRow[]
  showAddMenu: boolean
  showGlobalProdMenu: boolean
  globalProdSearch: string
  rows: LancamentoRow[]
  produtos: Produto[]
  rowProdIds: Record<number, Set<number>>
  onDateChange: (v: string) => void
  onToggleEditMode: () => void
  onToggleAddMenu: () => void
  onRestoreRow: (lojaId: number) => void
  onToggleGlobalProdMenu: () => void
  onGlobalProdSearch: (v: string) => void
  onToggleGlobalProd: (prodId: number) => void
}

export function LancamentosHeader({
  dataPedido, editMode, hiddenRows, showAddMenu, showGlobalProdMenu,
  globalProdSearch, rows, produtos, rowProdIds,
  onDateChange, onToggleEditMode, onToggleAddMenu, onRestoreRow,
  onToggleGlobalProdMenu, onGlobalProdSearch, onToggleGlobalProd,
}: LancamentosHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="text-2xl font-bold text-gray-900">Lancamentos</h2>

      {/* Seletor de data */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Data:</label>
        <input
          type="date"
          value={dataPedido}
          onChange={e => onDateChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      {/* Restaurar loja oculta */}
      {editMode && hiddenRows.length > 0 && (
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); onToggleAddMenu() }}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            <Plus size={14} />
            Adicionar loja
          </button>
          {showAddMenu && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 min-w-40"
              onClick={e => e.stopPropagation()}
            >
              {hiddenRows.map(r => (
                <button
                  key={r.loja_id}
                  onClick={() => onRestoreRow(r.loja_id)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {r.loja_nome}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botao Editar/Concluido */}
      <button
        onClick={e => { e.stopPropagation(); onToggleEditMode() }}
        className={`flex items-center gap-1 px-3 py-1 text-sm rounded font-medium ${
          editMode
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {editMode ? <><Check size={14} /> Concluido</> : <><Pencil size={14} /> Editar</>}
      </button>

      {/* Botao Produto global */}
      {editMode && (
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); onToggleGlobalProdMenu() }}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus size={14} />
            Produto
          </button>
          {showGlobalProdMenu && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 w-64"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
                Adicionar para todas as lojas
              </div>
              <div className="p-1.5 border-b border-gray-100">
                <input
                  autoFocus
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Buscar produto..."
                  value={globalProdSearch}
                  onChange={e => onGlobalProdSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {[...produtos]
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
                  .filter(p => p.nome.toLowerCase().includes(globalProdSearch.toLowerCase()))
                  .map(p => {
                    const inAll = rows.length > 0 && rows.every(row => rowProdIds[row.loja_id]?.has(p.id))
                    const inSome = rows.some(row => rowProdIds[row.loja_id]?.has(p.id))
                    return (
                      <button
                        key={p.id}
                        onClick={() => onToggleGlobalProd(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50"
                      >
                        <span className={`w-4 text-center text-xs font-bold flex-shrink-0 ${inAll ? 'text-blue-500' : inSome ? 'text-blue-300' : 'text-gray-300'}`}>
                          {inAll ? '✓' : inSome ? '-' : '+'}
                        </span>
                        <span className="flex-1 text-left">{p.nome}</span>
                        <span className="text-xs text-gray-400">{p.unidade}</span>
                      </button>
                    )
                  })}
                {produtos.filter(p => p.nome.toLowerCase().includes(globalProdSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Substituir em Lancamentos.tsx**

1. Adicionar import:
```ts
import { LancamentosHeader } from '../components/Lancamentos/LancamentosHeader'
```

2. Substituir o bloco `<div className="flex items-center gap-4">...</div>` do cabecalho por:
```tsx
<LancamentosHeader
  dataPedido={dataPedido}
  editMode={editMode}
  hiddenRows={hiddenRows}
  showAddMenu={showAddMenu}
  showGlobalProdMenu={showGlobalProdMenu}
  globalProdSearch={globalProdSearch}
  rows={rows}
  produtos={produtos}
  rowProdIds={rowProdIds}
  onDateChange={setDataPedido}
  onToggleEditMode={() => setEditMode(v => !v)}
  onToggleAddMenu={() => { setShowAddMenu(v => !v); setShowGlobalProdMenu(false) }}
  onRestoreRow={handleRestoreRow}
  onToggleGlobalProdMenu={() => { setShowGlobalProdMenu(v => !v); setShowAddMenu(false); setGlobalProdSearch('') }}
  onGlobalProdSearch={setGlobalProdSearch}
  onToggleGlobalProd={handleToggleGlobalProd}
/>
```

- [ ] **Step 3: Verificar**

```bash
npm run dev
```

Verificar: seletor de data, botao Editar, botao Produto (menu global), botao Adicionar loja — todos funcionando.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Lancamentos/LancamentosHeader.tsx src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: extract LancamentosHeader component"
```

---

## Chunk 3: Limpar orquestrador final

### Task 8: Verificar e limpar Lancamentos.tsx

**Files:**
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Checar o tamanho atual**

```bash
wc -l "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa/src/renderer/src/pages/Lancamentos.tsx"
```

Esperado: entre 80 e 130 linhas. Se ainda estiver acima de 150, verificar o que nao foi extraido.

- [ ] **Step 2: Remover imports nao usados**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm run build 2>&1 | grep "unused\|is defined but never used\|no-unused"
```

Remover qualquer import que o TypeScript reportar como nao utilizado.

- [ ] **Step 3: Verificacao final completa do app**

```bash
npm run dev
```

Testar TODOS os fluxos:
1. Trocar de rede → rows carregam, colunas de produto aparecem
2. Digitar OC → sequencia propaga para linhas seguintes
3. Digitar quantidade → salva ao sair do campo
4. Botao Editar → modo edicao ativa/desativa
5. Menu Produto (global) → adiciona/remove de todas as lojas
6. Menu + em ACOES → abre picker por loja com campo de preco
7. Imprimir → abre janela de impressao
8. Enviar → abre modal de previa, botoes Copiar/Salvar/WhatsApp funcionam
9. Aba Estoque → carrega quantidades, calcula S/F
10. Mover linha para cima/baixo → ordem persiste ao recarregar

- [ ] **Step 4: Commit final**

```bash
git add src/renderer/src/pages/Lancamentos.tsx
git commit -m "refactor: Lancamentos.tsx agora e orquestrador de ~100 linhas"
```

---

## Resumo: Mapa de Bugs Apos a Refatoracao

| Sintoma | Arquivo |
|---|---|
| Produto sumiu da coluna | `hooks/useRowProdutos.ts` |
| OC preencheu numero errado | `hooks/useOcNumbers.ts` |
| Pedido nao salva corretamente | `hooks/useLancamentos.ts` |
| Tabela nao renderiza / scroll quebrado | `components/Lancamentos/LancamentosTable.tsx` |
| Modal de share nao abre | `components/Lancamentos/ShareModal.tsx` |
| Menu de produto por loja bugado | `components/Lancamentos/ProdutoRowMenu.tsx` |
| Botoes do cabecalho nao funcionam | `components/Lancamentos/LancamentosHeader.tsx` |
| Estoque mostrando valor errado | `pages/EstoqueTab.tsx` |

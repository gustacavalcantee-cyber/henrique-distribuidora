# Financeiro Franqueado + Compartilhar em Todas as Abas — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar filtro por franqueado no FinanceiroTab (afetando cards + notas) e botão "Compartilhar" que gera uma imagem PNG em todas as 5 abas de Relatórios.

**Architecture:** Novo IPC channel `RENDER_HTML_IMAGE` no main process renderiza HTML arbitrário em janela offscreen e retorna base64 PNG. Cada aba monta HTML simples do seu conteúdo atual, chama o IPC e exibe no novo `RelatorioShareModal`. O filtro de franqueado no Financeiro é passado ao backend, que filtra pedidos pelas lojas do franqueado.

**Tech Stack:** Electron + React + TypeScript + Drizzle ORM + Tailwind CSS + Lucide icons

---

## Spec

`docs/superpowers/specs/2026-03-21-financeiro-compartilhar-design.md`

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/ipc-channels.ts` | Modify | Adicionar `RENDER_HTML_IMAGE` |
| `src/main/handlers/print.ts` | Modify | Handler `RENDER_HTML_IMAGE` (offscreen render) |
| `src/main/services/relatorios.service.ts` | Modify | `franqueado_id?` em `getRelatorioFinanceiro` e `getNotasMes` |
| `src/main/handlers/relatorios.ts` | Modify | Repassar `franqueado_id` nos dois handlers |
| `src/renderer/src/components/Relatorios/RelatorioShareModal.tsx` | Create | Modal de prévia: copiar + salvar PNG |
| `src/renderer/src/pages/Relatorios.tsx` | Modify | Filtro franqueado no Financeiro + share em 4 abas |
| `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx` | Modify | Share na aba Preço × Custo |

---

## Chunk 1: Backend

### Task 1: IPC channel `RENDER_HTML_IMAGE`

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/handlers/print.ts`

**Context:**
- `RENDER_HTML_IMAGE` recebe um HTML string e retorna base64 PNG
- Pattern já existe em `GET_NOTA_IMAGE`: cria BrowserWindow `show: false`, carrega HTML via `loadURL`, captura com `capturePage()`
- Diferença: aqui o HTML é arbitrário e o tamanho é dinâmico — precisamos ler `document.body.scrollHeight` e redimensionar antes de capturar
- O handler fica em `print.ts` (já tem `BrowserWindow`, `nativeImage`, etc.)

- [ ] **Step 1: Adicionar channel em ipc-channels.ts**

No arquivo `src/shared/ipc-channels.ts`, adicionar antes do `} as const`:

```typescript
  RENDER_HTML_IMAGE: 'render:htmlImage',
```

- [ ] **Step 2: Adicionar handler em print.ts**

No arquivo `src/main/handlers/print.ts`, dentro da função `registerPrintHandlers()`, adicionar antes do fechamento `}`:

```typescript
  ipcMain.handle(IPC.RENDER_HTML_IMAGE, async (_event, html: string, width = 600) => {
    const win = new BrowserWindow({
      width,
      height: 800,
      show: false,
      frame: false,
      webPreferences: { sandbox: false },
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise(r => setTimeout(r, 300))
    const contentHeight: number = await win.webContents.executeJavaScript('document.body.scrollHeight')
    win.setSize(width, Math.min(contentHeight + 20, 4000))
    await new Promise(r => setTimeout(r, 100))
    const image = await win.webContents.capturePage()
    win.close()
    return image.toDataURL()
  })
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/gustavocavalcante/Library/CloudStorage/GoogleDrive-gustacavalcantee@gmail.com/Meu Drive/Programa"
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/handlers/print.ts
git commit -m "feat: add RENDER_HTML_IMAGE IPC handler for offscreen report capture"
```

---

### Task 2: Backend — filtro franqueado_id no Financeiro

**Files:**
- Modify: `src/main/services/relatorios.service.ts`
- Modify: `src/main/handlers/relatorios.ts`

**Context:**
- `getRelatorioFinanceiro(mes, ano, rede_id?)` → adicionar `franqueado_id?: number`
- `getNotasMes(mes, ano, rede_id?)` → mesma mudança
- Lógica: quando `franqueado_id` é informado, buscar lojas com `franqueado_id = X`, depois filtrar pedidos com `inArray(pedidos.loja_id, lojaIds)`
- Em `relatorios.service.ts`: `lojas` e `franqueados` já são usados em outras funções do mesmo arquivo — import já existe
- Os handlers em `relatorios.ts` fazem `ipcMain.handle(IPC.RELATORIO_FINANCEIRO, ...)` e `ipcMain.handle(IPC.NOTAS_LIST, ...)` — precisam extrair e repassar o novo parâmetro

- [ ] **Step 1: Modificar getRelatorioFinanceiro em relatorios.service.ts**

Localizar a assinatura atual:
```typescript
export function getRelatorioFinanceiro(mes: number, ano: number, rede_id?: number): FinanceiroSummary {
```

Substituir por:
```typescript
export function getRelatorioFinanceiro(mes: number, ano: number, rede_id?: number, franqueado_id?: number): FinanceiroSummary {
```

Localizar dentro da função:
```typescript
  const pedidoConditions: ReturnType<typeof gte>[] = [gte(pedidos.data_pedido, data_inicio), lte(pedidos.data_pedido, data_fim)]
  if (rede_id) pedidoConditions.push(eq(pedidos.rede_id, rede_id))

  const pedidosList = db.select().from(pedidos).where(and(...pedidoConditions)).all()
```

Substituir por:
```typescript
  const pedidoConditions: ReturnType<typeof gte>[] = [gte(pedidos.data_pedido, data_inicio), lte(pedidos.data_pedido, data_fim)]
  if (rede_id) pedidoConditions.push(eq(pedidos.rede_id, rede_id))
  if (franqueado_id) {
    const lojasDoFranqueado = db.select().from(lojas).where(eq(lojas.franqueado_id, franqueado_id)).all()
    const ids = lojasDoFranqueado.map(l => l.id)
    if (ids.length > 0) pedidoConditions.push(inArray(pedidos.loja_id, ids))
    else return { receita_bruta: 0, custo_produtos: 0, margem_bruta: 0, despesas: 0, lucro_liquido: 0, por_rede: [], top_lojas: [] }
  }

  const pedidosList = db.select().from(pedidos).where(and(...pedidoConditions)).all()
```

Também atualizar o filtro de despesas para incluir franqueado (somente se houver lojas associadas ao franqueado). Localizar:
```typescript
  const despesaConditions: ReturnType<typeof gte>[] = [gte(despesasTable.data, data_inicio), lte(despesasTable.data, data_fim)]
  if (rede_id) despesaConditions.push(eq(despesasTable.rede_id, rede_id))
```

Substituir por:
```typescript
  const despesaConditions: ReturnType<typeof gte>[] = [gte(despesasTable.data, data_inicio), lte(despesasTable.data, data_fim)]
  if (rede_id) despesaConditions.push(eq(despesasTable.rede_id, rede_id))
  // franqueado_id não filtra despesas (despesas são por rede, não por loja)
```

(Não alterar o filtro de despesas — despesas são por rede, não por loja/franqueado.)

- [ ] **Step 2: Modificar getNotasMes em relatorios.service.ts**

Localizar a assinatura atual:
```typescript
export function getNotasMes(mes: number, ano: number, rede_id?: number): NotaPagamento[] {
```

Substituir por:
```typescript
export function getNotasMes(mes: number, ano: number, rede_id?: number, franqueado_id?: number): NotaPagamento[] {
```

Localizar dentro da função:
```typescript
  const conditions = [
    gte(pedidos.data_pedido, data_inicio),
    lte(pedidos.data_pedido, data_fim),
  ]
  if (rede_id) conditions.push(eq(pedidos.rede_id, rede_id))
```

Substituir por:
```typescript
  const conditions: ReturnType<typeof gte>[] = [
    gte(pedidos.data_pedido, data_inicio),
    lte(pedidos.data_pedido, data_fim),
  ]
  if (rede_id) conditions.push(eq(pedidos.rede_id, rede_id))
  if (franqueado_id) {
    const lojasDoFranqueado = db.select().from(lojas).where(eq(lojas.franqueado_id, franqueado_id)).all()
    const ids = lojasDoFranqueado.map(l => l.id)
    if (ids.length > 0) conditions.push(inArray(pedidos.loja_id, ids))
    else return []
  }
```

Note: o import de `lojas` já existe no arquivo (`import { ..., lojas, ... } from '../db/schema'`). Verificar se `inArray` está no import de drizzle-orm — já está (usado em outras funções).

- [ ] **Step 3: Atualizar handlers em relatorios.ts**

Localizar o handler do financeiro. O arquivo `src/main/handlers/relatorios.ts` tem handlers que chamam as funções de serviço. Localizar o trecho que registra `RELATORIO_FINANCEIRO` e `NOTAS_LIST`.

Para `RELATORIO_FINANCEIRO`, extrair o 4º argumento:
```typescript
ipcMain.handle(IPC.RELATORIO_FINANCEIRO, (_event, mes, ano, rede_id, franqueado_id) =>
  getRelatorioFinanceiro(mes, ano, rede_id, franqueado_id)
)
```

Para `NOTAS_LIST`, extrair o 4º argumento:
```typescript
ipcMain.handle(IPC.NOTAS_LIST, (_event, mes, ano, rede_id, franqueado_id) =>
  getNotasMes(mes, ano, rede_id, franqueado_id)
)
```

(Ver a assinatura atual dos handlers no arquivo para confirmar o padrão exato antes de editar.)

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/relatorios.service.ts src/main/handlers/relatorios.ts
git commit -m "feat(backend): add franqueado_id filter to getRelatorioFinanceiro and getNotasMes"
```

---

## Chunk 2: Modal + FinanceiroTab

### Task 3: Criar RelatorioShareModal

**Files:**
- Create: `src/renderer/src/components/Relatorios/RelatorioShareModal.tsx`

**Context:**
- Modal simples: prévia da imagem + botão "Copiar imagem" (usa `CLIPBOARD_WRITE_IMAGE`) + botão "Salvar PNG" (link download) + botão fechar
- Não tem botão WhatsApp (essa funcionalidade é específica de notas individuais no `ShareModal` existente)
- Usa `createPortal` no `document.body` — mesmo padrão do `ShareModal` existente em `src/renderer/src/components/Lancamentos/ShareModal.tsx`
- Ícones: `Share2`, `X`, `Check` do pacote `lucide-react` (já instalado)
- O estado `copied` é local ao componente (não precisa subir para o pai)

- [ ] **Step 1: Criar o arquivo**

Criar `src/renderer/src/components/Relatorios/RelatorioShareModal.tsx`:

```tsx
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2, X, Check } from 'lucide-react'
import { IPC } from '../../../../shared/ipc-channels'

interface RelatorioShareModalProps {
  image: string | null
  filename?: string
  onClose: () => void
}

export function RelatorioShareModal({ image, filename = 'relatorio.png', onClose }: RelatorioShareModalProps) {
  const [copied, setCopied] = useState(false)

  if (!image) return null

  const handleCopy = async () => {
    await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, image)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
            Prévia para compartilhar
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 bg-gray-100">
          <img src={image} alt="Relatório" className="w-full shadow-md rounded" />
        </div>
        <div className="flex gap-2 justify-end px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            {copied
              ? <><Check size={14} className="text-green-600" /> Copiado!</>
              : 'Copiar imagem'}
          </button>
          <a
            href={image}
            download={filename}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            Salvar PNG
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Relatorios/RelatorioShareModal.tsx
git commit -m "feat: add RelatorioShareModal component for sharing report images"
```

---

### Task 4: FinanceiroTab — filtro franqueado + share

**Files:**
- Modify: `src/renderer/src/pages/Relatorios.tsx` (função `FinanceiroTab`, linhas ~386–563)

**Context:**
- A função `FinanceiroTab` começa na linha ~386 e termina na linha ~563 (antes de `CobrancaTab`)
- Atualmente tem: `redes`, `mes`, `ano`, `redeId`, `summary`, `notas`, `loading`
- Adicionar: `franqueados` (via `useIpc`), `franqueadoId` state, `shareImage` state, `shareLoading` state
- O import de `useIpc` já existe; `Franqueado` já está no import de tipos na linha 3
- `RelatorioShareModal` precisa ser importado no topo do arquivo
- `Share2` do lucide-react precisa ser adicionado ao import (verificar se já está — `Printer` está, `Share2` pode não estar)

**HTML para share do Financeiro:** mostra notas em aberto/atrasadas por loja + total em aberto. Só exibe se houver notas abertas. Se não houver, alert "Não há notas em aberto para compartilhar."

- [ ] **Step 1: Adicionar imports em Relatorios.tsx**

Localizar a linha de import do lucide-react:
```typescript
import { Printer } from 'lucide-react'
```

Substituir por:
```typescript
import { Printer, Share2 } from 'lucide-react'
```

Adicionar import do RelatorioShareModal logo após os outros imports:
```typescript
import { RelatorioShareModal } from '../components/Relatorios/RelatorioShareModal'
```

- [ ] **Step 2: Adicionar estado franqueado e share em FinanceiroTab**

Localizar dentro de `function FinanceiroTab()`:
```typescript
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const now = new Date()
  const [mes, setMes] = useState(0)
  const [ano, setAno] = useState(now.getFullYear())
  const [redeId, setRedeId] = useState<number | ''>('')
  const [summary, setSummary] = useState<FinanceiroSummary | null>(null)
  const [notas, setNotas] = useState<NotaPagamento[] | null>(null)
  const [loading, setLoading] = useState(false)
```

Substituir por:
```typescript
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const { data: franqueados } = useIpc<Franqueado[]>(IPC.FRANQUEADOS_LIST)
  const now = new Date()
  const [mes, setMes] = useState(0)
  const [ano, setAno] = useState(now.getFullYear())
  const [redeId, setRedeId] = useState<number | ''>('')
  const [franqueadoId, setFranqueadoId] = useState<number | ''>('')
  const [summary, setSummary] = useState<FinanceiroSummary | null>(null)
  const [notas, setNotas] = useState<NotaPagamento[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
```

- [ ] **Step 3: Atualizar handleBuscar para passar franqueadoId**

Localizar:
```typescript
  const handleBuscar = async () => {
    setLoading(true)
    const rid = redeId !== '' ? Number(redeId) : undefined
    const [data, notasList] = await Promise.all([
      window.electron.invoke<FinanceiroSummary>(IPC.RELATORIO_FINANCEIRO, mes, ano, rid),
      window.electron.invoke<NotaPagamento[]>(IPC.NOTAS_LIST, mes, ano, rid),
    ])
    setSummary(data)
    setNotas(notasList)
    setLoading(false)
  }
```

Substituir por:
```typescript
  const handleBuscar = async () => {
    setLoading(true)
    const rid = redeId !== '' ? Number(redeId) : undefined
    const fid = franqueadoId !== '' ? Number(franqueadoId) : undefined
    const [data, notasList] = await Promise.all([
      window.electron.invoke<FinanceiroSummary>(IPC.RELATORIO_FINANCEIRO, mes, ano, rid, fid),
      window.electron.invoke<NotaPagamento[]>(IPC.NOTAS_LIST, mes, ano, rid, fid),
    ])
    setSummary(data)
    setNotas(notasList)
    setLoading(false)
  }
```

- [ ] **Step 4: Adicionar handleCompartilhar**

Após `handleStatusChange`, adicionar:

```typescript
  const handleCompartilhar = async () => {
    if (!notas) return
    const abertas = notas.filter(n => n.status_pagamento === 'aberto' || n.status_pagamento === 'atrasada')
    if (abertas.length === 0) { alert('Não há notas em aberto para compartilhar.'); return }
    setShareLoading(true)
    const nomeFornecedor: string = await window.electron.invoke(IPC.CONFIG_GET, 'nome_fornecedor') ?? ''
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtDate = (iso: string) => iso.split('-').reverse().join('/')
    const periodoStr = mes === 0 ? String(ano) : `${String(mes).padStart(2,'0')}/${ano}`
    const byLoja: Record<string, NotaPagamento[]> = {}
    for (const n of abertas) {
      if (!byLoja[n.loja_nome]) byLoja[n.loja_nome] = []
      byLoja[n.loja_nome].push(n)
    }
    const total = abertas.reduce((s, n) => s + n.total_venda, 0)
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; padding: 20px; width: 580px; }
h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
.sub { font-size: 11px; color: #666; margin-bottom: 14px; }
.loja-hdr { background: #f0f0f0; font-weight: bold; padding: 5px 8px; margin-top: 12px; margin-bottom: 3px; font-size: 11px; border-left: 3px solid #2563eb; }
table { width: 100%; border-collapse: collapse; }
th { background: #e8e8e8; font-size: 10px; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ccc; }
td { font-size: 11px; padding: 4px 6px; border-bottom: 1px solid #eee; }
.right { text-align: right; }
.s-aberto { color: #b45309; font-size: 10px; font-weight: bold; }
.s-atrasada { color: #dc2626; font-size: 10px; font-weight: bold; }
.total-row { background: #1e293b; color: white; padding: 10px 14px; margin-top: 16px; display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; border-radius: 4px; }
</style></head><body>
<h1>NOTAS EM ABERTO</h1>
<div class="sub">${nomeFornecedor.toUpperCase()} — ${periodoStr}</div>
${Object.entries(byLoja).map(([loja, ns]) => `
<div class="loja-hdr">${loja}</div>
<table><thead><tr><th>Data</th><th>OC</th><th class="right">Valor</th><th>Status</th></tr></thead>
<tbody>${ns.map(n => `<tr>
  <td>${fmtDate(n.data_pedido)}</td>
  <td>${n.numero_oc ?? '—'}</td>
  <td class="right">R$ ${fmt(n.total_venda)}</td>
  <td class="s-${n.status_pagamento}">${n.status_pagamento === 'atrasada' ? 'Atrasada' : 'Em Aberto'}</td>
</tr>`).join('')}</tbody></table>`).join('')}
<div class="total-row"><span>TOTAL EM ABERTO</span><span>R$ ${fmt(total)}</span></div>
</body></html>`
    const image = await window.electron.invoke<string>(IPC.RENDER_HTML_IMAGE, html, 600)
    setShareImage(image)
    setShareLoading(false)
  }
```

- [ ] **Step 5: Adicionar select Franqueado nos filtros**

Localizar no JSX de `FinanceiroTab`:
```tsx
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rede</label>
          <select className="border rounded px-2 py-1 text-sm" value={redeId} onChange={e => setRedeId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Todas</option>
            {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <button onClick={handleBuscar} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Buscar
        </button>
```

Substituir por:
```tsx
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rede</label>
          <select className="border rounded px-2 py-1 text-sm" value={redeId} onChange={e => setRedeId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Todas</option>
            {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Franqueado</label>
          <select className="border rounded px-2 py-1 text-sm" value={franqueadoId} onChange={e => setFranqueadoId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Todos</option>
            {franqueados?.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <button onClick={handleBuscar} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Buscar
        </button>
```

- [ ] **Step 6: Adicionar botão Compartilhar e RelatorioShareModal no JSX**

Localizar o bloco dos cards (logo após `{summary && (`):
```tsx
          <div className="grid grid-cols-5 gap-3">
```

Antes desse bloco, adicionar o botão. Localizar onde fica o `{notas && notas.length > 0 && (` — adicionar o botão de compartilhar no cabeçalho da seção de notas.

Localizar:
```tsx
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">{mes === 0 ? `Notas de ${ano}` : 'Notas do Mês'}</h3>
```

Substituir por:
```tsx
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-700 text-sm">{mes === 0 ? `Notas de ${ano}` : 'Notas do Mês'}</h3>
                <button
                  onClick={handleCompartilhar}
                  disabled={shareLoading}
                  className="flex items-center gap-1.5 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  <Share2 size={13} />
                  {shareLoading ? 'Gerando...' : 'Compartilhar em Aberto'}
                </button>
              </div>
```

Antes do `return (` da função `FinanceiroTab`, adicionar o modal:

Localizar o `return (` de `FinanceiroTab` e envolver em Fragment, ou adicionar o modal dentro do JSX retornado. O mais simples é adicionar `<RelatorioShareModal>` antes do fechamento do `<div>` raiz:

Localizar a última linha do JSX de `FinanceiroTab`:
```tsx
    </div>
  )
}

function CobrancaTab() {
```

Substituir:
```tsx
      {shareImage && (
        <RelatorioShareModal
          image={shareImage}
          filename="notas-em-aberto.png"
          onClose={() => setShareImage(null)}
        />
      )}
    </div>
  )
}

function CobrancaTab() {
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Relatorios.tsx
git commit -m "feat(financeiro): add franqueado filter and share open notes as image"
```

---

## Chunk 3: Share nas demais abas

### Task 5: QuinzenaTab — botão Compartilhar

**Files:**
- Modify: `src/renderer/src/pages/Relatorios.tsx` (função `QuinzenaTab`, linhas ~20–383)

**Context:**
- `QuinzenaTab` já tem `summary` state e botão "Imprimir Relatório"
- Adicionar `shareImage`, `shareLoading` states
- `handleCompartilhar`: gera HTML com cards (Vendas, Custo, Margem) + tabela simplificada por loja/OC
- O HTML de share mostra um resumo: cabeçalho com rede/loja/período + 3 cards + lista dos pedidos do detalhe agrupados por data

- [ ] **Step 1: Adicionar estados de share em QuinzenaTab**

Localizar dentro de `function QuinzenaTab()`:
```typescript
  const [loading, setLoading] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editingItemValue, setEditingItemValue] = useState('')
```

Substituir por:
```typescript
  const [loading, setLoading] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editingItemValue, setEditingItemValue] = useState('')
  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
```

- [ ] **Step 2: Adicionar handleCompartilhar em QuinzenaTab**

Adicionar após `handleItemPrecoSave`:

```typescript
  const handleCompartilhar = async () => {
    if (!summary) return
    setShareLoading(true)
    const nomeFornecedor: string = await window.electron.invoke(IPC.CONFIG_GET, 'nome_fornecedor') ?? ''
    const redeName = redes?.find(r => r.id === Number(redeId))?.nome?.replace(/_/g,' ')?.toUpperCase() ?? ''
    const lojaObj = lojaId !== '' ? filteredLojas.find(l => l.id === Number(lojaId)) : null
    const lojaName = lojaObj ? lojaObj.nome.replace(/_/g,' ').toUpperCase() : 'TODAS AS LOJAS'
    const qLabel = quinzena === 1 ? '1ª Quinzena (1–15)' : '2ª Quinzena (16–fim)'
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; padding: 20px; width: 580px; }
h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
.sub { font-size: 11px; color: #666; margin-bottom: 14px; }
.cards { display: flex; gap: 10px; margin-bottom: 14px; }
.card { flex: 1; border: 1px solid #ddd; border-radius: 4px; padding: 8px 10px; }
.card-label { font-size: 10px; color: #666; text-transform: uppercase; }
.card-value { font-size: 16px; font-weight: bold; margin-top: 2px; }
.card-green .card-value { color: #16a34a; }
.card-red .card-value { color: #dc2626; }
.card-blue .card-value { color: #2563eb; }
table { width: 100%; border-collapse: collapse; }
th { background: #f0f0f0; font-size: 10px; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ccc; }
td { font-size: 11px; padding: 3px 6px; border-bottom: 1px solid #eee; }
.right { text-align: right; }
.date-row td { background: #dbeafe; font-weight: bold; color: #1e40af; padding: 4px 6px; }
</style></head><body>
<h1>${nomeFornecedor.toUpperCase()}</h1>
<div class="sub">${redeName} ${lojaName} — ${String(mes).padStart(2,'0')}/${ano} ${qLabel}</div>
<div class="cards">
  <div class="card card-green"><div class="card-label">Vendas</div><div class="card-value">R$ ${fmt(summary.total_venda)}</div></div>
  <div class="card card-red"><div class="card-label">Custo</div><div class="card-value">R$ ${fmt(summary.total_custo)}</div></div>
  <div class="card card-blue"><div class="card-label">Margem</div><div class="card-value">${summary.margem.toFixed(1)}%</div></div>
</div>
<table><thead><tr><th>Produto</th><th class="right">Qtd</th><th class="right">Preço</th><th class="right">Total</th></tr></thead>
<tbody>
${(() => {
  const grupos = new Map<string, typeof summary.detalhe>()
  for (const d of summary.detalhe) {
    if (!grupos.has(d.data_pedido)) grupos.set(d.data_pedido, [])
    grupos.get(d.data_pedido)!.push(d)
  }
  return Array.from(grupos.entries()).map(([date, items]) => {
    const [y,m,d] = date.split('-')
    return `<tr class="date-row"><td colspan="4">${d}/${m}/${y}</td></tr>` +
      items.map(i => `<tr><td style="padding-left:14px">${i.produto_nome}</td><td class="right">${i.quantidade.toLocaleString('pt-BR',{maximumFractionDigits:2})}</td><td class="right">R$ ${fmt(i.preco_unit)}</td><td class="right">R$ ${fmt(i.total_venda)}</td></tr>`).join('')
  }).join('')
})()}
</tbody></table>
</body></html>`
    const image = await window.electron.invoke<string>(IPC.RENDER_HTML_IMAGE, html, 600)
    setShareImage(image)
    setShareLoading(false)
  }
```

- [ ] **Step 3: Adicionar botão Compartilhar no JSX de QuinzenaTab**

Localizar o botão de imprimir em QuinzenaTab:
```tsx
          <div className="flex justify-end">
            <button onClick={handlePrintRelatorio} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-medium">
              Imprimir Relatório
            </button>
          </div>
```

Substituir por:
```tsx
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCompartilhar}
              disabled={shareLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Share2 size={13} />
              {shareLoading ? 'Gerando...' : 'Compartilhar'}
            </button>
            <button onClick={handlePrintRelatorio} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-medium">
              Imprimir Relatório
            </button>
          </div>
```

Adicionar `RelatorioShareModal` antes do fechamento do `return` de `QuinzenaTab` (antes do último `</div>` e `)`):

```tsx
      {shareImage && (
        <RelatorioShareModal
          image={shareImage}
          filename="quinzena.png"
          onClose={() => setShareImage(null)}
        />
      )}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/Relatorios.tsx
git commit -m "feat(quinzena): add share report as image button"
```

---

### Task 6: CobrancaTab — botão Compartilhar

**Files:**
- Modify: `src/renderer/src/pages/Relatorios.tsx` (função `CobrancaTab`, linhas ~566–872)

**Context:**
- `CobrancaTab` já tem `results` state e botão "Imprimir Cobrança"
- A lógica de share é similar ao print existente — gera imagem da lista de lojas com valores + total

- [ ] **Step 1: Adicionar estados e handler**

Localizar dentro de `function CobrancaTab()`:
```typescript
  const [results, setResults] = useState<CobrancaLojaResult[] | null>(null)
  const [loading, setLoading] = useState(false)
```

Substituir por:
```typescript
  const [results, setResults] = useState<CobrancaLojaResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
```

Adicionar `handleCompartilhar` após `handlePrint`:

```typescript
  const handleCompartilhar = async () => {
    if (!results) return
    setShareLoading(true)
    const nomeFornecedor: string = await window.electron.invoke(IPC.CONFIG_GET, 'nome_fornecedor') ?? ''
    const franqueadoName = franqueados?.find(f => f.id === Number(franqueadoId))?.nome?.toUpperCase() ?? ''
    const redeName = franqueadoName || (redes?.find(r => r.id === Number(redeId))?.nome?.replace(/_/g,' ')?.toUpperCase() ?? 'LOJAS')
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const total = results.reduce((s, r) => s + r.total_venda, 0)
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; padding: 20px; width: 580px; }
h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
.sub { font-size: 11px; color: #666; margin-bottom: 14px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
th { background: #e8e8e8; font-size: 10px; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ccc; }
td { font-size: 11px; padding: 5px 6px; border-bottom: 1px solid #eee; }
.right { text-align: right; }
.total-row { background: #1e293b; color: white; padding: 10px 14px; display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; border-radius: 4px; margin-top: 4px; }
</style></head><body>
<h1>COBRANÇA — ${periodoLabel}</h1>
<div class="sub">DE: ${nomeFornecedor.toUpperCase()} — PARA: ${redeName}</div>
<table><thead><tr><th>Loja</th><th>Período</th><th class="right">Valor</th></tr></thead>
<tbody>${results.map(r => `<tr><td>${r.loja_nome.replace(/_/g,' ')}</td><td>${r.periodo_str}</td><td class="right">R$ ${fmt(r.total_venda)}</td></tr>`).join('')}</tbody></table>
<div class="total-row"><span>SOMA TOTAL</span><span>R$ ${fmt(total)}</span></div>
</body></html>`
    const image = await window.electron.invoke<string>(IPC.RENDER_HTML_IMAGE, html, 600)
    setShareImage(image)
    setShareLoading(false)
  }
```

- [ ] **Step 2: Adicionar botão Compartilhar no JSX de CobrancaTab**

Localizar:
```tsx
            <button onClick={handlePrint} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-medium">
              Imprimir Cobrança
            </button>
```

Substituir por:
```tsx
            <button
              onClick={handleCompartilhar}
              disabled={shareLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Share2 size={13} />
              {shareLoading ? 'Gerando...' : 'Compartilhar'}
            </button>
            <button onClick={handlePrint} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-medium">
              Imprimir Cobrança
            </button>
```

Adicionar `RelatorioShareModal` antes do último `</div>` do return de `CobrancaTab`:

```tsx
      {shareImage && (
        <RelatorioShareModal
          image={shareImage}
          filename="cobranca.png"
          onClose={() => setShareImage(null)}
        />
      )}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/renderer/src/pages/Relatorios.tsx
git commit -m "feat(cobranca): add share report as image button"
```

---

### Task 7: PorProdutoTab — botão Compartilhar

**Files:**
- Modify: `src/renderer/src/pages/Relatorios.tsx` (função `PorProdutoTab`, linhas ~874–fim)

**Context:**
- `PorProdutoTab` tem `resultado` state e botão "Imprimir"
- Gerar HTML com uma tabela por produto: loja/franqueado | quantidade | valor

- [ ] **Step 1: Adicionar estados e handler**

Localizar dentro de `function PorProdutoTab()`:
```typescript
  const [resultado, setResultado] = useState<ProdutoRelatorioResult[] | null>(null)
  const [loading, setLoading] = useState(false)
```

Substituir por:
```typescript
  const [resultado, setResultado] = useState<ProdutoRelatorioResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
```

Adicionar `handleCompartilhar` após `handlePrint`:

```typescript
  async function handleCompartilhar() {
    if (!resultado) return
    setShareLoading(true)
    const rede = redes?.find(r => r.id === redeId)
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const periodoStr = periodo === '1' ? '1ª Quinzena' : periodo === '2' ? '2ª Quinzena' : 'Mês inteiro'
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtQty = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    const comDados = resultado.filter(r => r.linhas.length > 0)
    const grupoLabel = agruparPor === 'franqueado' ? 'Franqueado' : 'Loja'
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; padding: 20px; width: 580px; }
h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
.sub { font-size: 11px; color: #666; margin-bottom: 14px; }
h2 { font-size: 12px; font-weight: bold; margin: 14px 0 4px; border-left: 3px solid #2563eb; padding-left: 6px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
th { background: #e8e8e8; font-size: 10px; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ccc; }
td { font-size: 11px; padding: 3px 6px; border-bottom: 1px solid #eee; }
.right { text-align: right; }
.total-row td { font-weight: bold; background: #f5f5f5; }
</style></head><body>
<h1>RELATÓRIO POR PRODUTO</h1>
<div class="sub">${rede?.nome ?? ''} — ${meses[mes-1]} ${ano} — ${periodoStr}</div>
${comDados.map(r => `
<h2>${r.produto_nome} (${r.unidade})</h2>
<table><thead><tr><th>${grupoLabel}</th><th class="right">Quantidade</th><th class="right">Valor</th></tr></thead>
<tbody>
${r.linhas.map(l => `<tr><td>${l.nome}</td><td class="right">${fmtQty(l.quantidade)} ${r.unidade}</td><td class="right">R$ ${fmt(l.valor)}</td></tr>`).join('')}
<tr class="total-row"><td>Total</td><td class="right">${fmtQty(r.total_quantidade)} ${r.unidade}</td><td class="right">R$ ${fmt(r.total_valor)}</td></tr>
</tbody></table>`).join('')}
</body></html>`
    const image = await window.electron.invoke<string>(IPC.RENDER_HTML_IMAGE, html, 600)
    setShareImage(image)
    setShareLoading(false)
  }
```

- [ ] **Step 2: Adicionar botão Compartilhar no JSX de PorProdutoTab**

Localizar:
```tsx
          {resultado && resultado.some(r => r.linhas.length > 0) && (
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
              <Printer size={14} /> Imprimir
            </button>
```

Substituir por:
```tsx
          {resultado && resultado.some(r => r.linhas.length > 0) && (
            <>
              <button
                onClick={handleCompartilhar}
                disabled={shareLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Share2 size={14} />
                {shareLoading ? 'Gerando...' : 'Compartilhar'}
              </button>
              <button onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                <Printer size={14} /> Imprimir
              </button>
            </>
```

Fechar o `</>` onde antes havia o `)}` do botão de imprimir. Verificar o JSX ao redor para garantir estrutura correta.

Adicionar `RelatorioShareModal` antes do fechamento do return de `PorProdutoTab`:

```tsx
      {shareImage && (
        <RelatorioShareModal
          image={shareImage}
          filename="por-produto.png"
          onClose={() => setShareImage(null)}
        />
      )}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/renderer/src/pages/Relatorios.tsx
git commit -m "feat(por-produto): add share report as image button"
```

---

### Task 8: PrecoVsCustoTab — botão Compartilhar

**Files:**
- Modify: `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx`

**Context:**
- `PrecoVsCustoTab.tsx` é um arquivo separado. O componente principal `PrecoVsCustoTab` tem `resultados: PrecoVsCustoResult[]` state
- O share gera imagem da seção 2 (comparacao_lojas) de cada produto selecionado: tabela com loja | preço | custo | margem R$ | margem %
- Como pode haver múltiplos produtos, a imagem contém uma seção por produto
- `RelatorioShareModal` fica em `src/renderer/src/components/Relatorios/` — mesmo diretório, import `'./RelatorioShareModal'`

- [ ] **Step 1: Adicionar import em PrecoVsCustoTab.tsx**

No topo do arquivo, adicionar:
```typescript
import { Share2 } from 'lucide-react'
import { RelatorioShareModal } from './RelatorioShareModal'
```

- [ ] **Step 2: Adicionar estado de share no componente PrecoVsCustoTab**

Localizar dentro de `function PrecoVsCustoTab()` o bloco de estados e adicionar:
```typescript
  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
```

- [ ] **Step 3: Adicionar handleCompartilhar em PrecoVsCustoTab**

Adicionar após `handleBuscar`:

```typescript
  const handleCompartilhar = async () => {
    if (resultados.length === 0) return
    setShareLoading(true)
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtPct = (v: number | null) => v == null ? '—' : v.toFixed(1) + '%'
    const margemColor = (pct: number | null) => {
      if (pct == null) return '#6b7280'
      if (pct >= 30) return '#16a34a'
      if (pct >= 15) return '#d97706'
      return '#dc2626'
    }
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; padding: 20px; width: 580px; }
h1 { font-size: 14px; font-weight: bold; margin-bottom: 14px; }
h2 { font-size: 12px; font-weight: bold; margin: 16px 0 6px; border-left: 3px solid #2563eb; padding-left: 6px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
th { background: #e8e8e8; font-size: 10px; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ccc; }
td { font-size: 11px; padding: 4px 6px; border-bottom: 1px solid #eee; }
.right { text-align: right; }
</style></head><body>
<h1>PREÇO × CUSTO — COMPARAÇÃO POR LOJA</h1>
${resultados.map(r => `
<h2>${r.produto_nome}</h2>
<table><thead><tr><th>Loja</th><th class="right">Preço Venda</th><th class="right">Custo</th><th class="right">Margem R$</th><th class="right">Margem %</th></tr></thead>
<tbody>${r.comparacao_lojas.map(l => `<tr>
  <td>${l.loja_nome}</td>
  <td class="right">${l.preco_venda != null ? 'R$ ' + fmt(l.preco_venda) : '—'}</td>
  <td class="right">${l.custo_atual != null ? 'R$ ' + fmt(l.custo_atual) : '—'}</td>
  <td class="right">${l.margem_reais != null ? 'R$ ' + fmt(l.margem_reais) : '—'}</td>
  <td class="right" style="color:${margemColor(l.margem_pct)};font-weight:bold">${fmtPct(l.margem_pct)}</td>
</tr>`).join('')}</tbody></table>`).join('')}
</body></html>`
    const image = await window.electron.invoke<string>(IPC.RENDER_HTML_IMAGE, html, 600)
    setShareImage(image)
    setShareLoading(false)
  }
```

- [ ] **Step 4: Adicionar botão Compartilhar no JSX de PrecoVsCustoTab**

Localizar o botão "Buscar" em `PrecoVsCustoTab` e o bloco de resultados. Adicionar o botão de compartilhar ao lado do título/resultados. Localizar a seção logo após `handleBuscar` button ou antes dos resultados:

No JSX, localizar onde `resultados.length > 0` é verificado para exibir resultados. Adicionar botão "Compartilhar" nessa seção:

```tsx
        {resultados.length > 0 && (
          <button
            onClick={handleCompartilhar}
            disabled={shareLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Share2 size={13} />
            {shareLoading ? 'Gerando...' : 'Compartilhar'}
          </button>
        )}
```

Adicionar ao final do JSX retornado pelo `PrecoVsCustoTab`, antes do `</div>` final:

```tsx
      {shareImage && (
        <RelatorioShareModal
          image={shareImage}
          filename="preco-vs-custo.png"
          onClose={() => setShareImage(null)}
        />
      )}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 6: Commit e push final**

```bash
git add src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx src/renderer/src/pages/Relatorios.tsx
git commit -m "feat(preco-custo): add share comparison table as image button"
git push
```

---

## Verificação Final

Após todos os tasks:

- [ ] `npm run typecheck` passa sem erros
- [ ] FinanceiroTab: select Franqueado aparece nos filtros; ao selecionar + Buscar, cards e notas refletem só o franqueado
- [ ] FinanceiroTab: "Compartilhar em Aberto" gera imagem com notas em aberto/atrasadas + total
- [ ] QuinzenaTab: botão "Compartilhar" aparece quando há `summary`
- [ ] CobrancaTab: botão "Compartilhar" aparece quando há `results`
- [ ] PorProdutoTab: botão "Compartilhar" aparece quando há `resultado`
- [ ] PrecoVsCustoTab: botão "Compartilhar" aparece quando há `resultados`
- [ ] Em todas as abas: modal mostra prévia da imagem, "Copiar imagem" funciona, "Salvar PNG" faz download

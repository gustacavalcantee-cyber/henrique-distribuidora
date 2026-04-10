# Lista de Preços + Busca em Lançamentos — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Lista de Preços" page where the user selects products, edits prices, and generates a branded image (WhatsApp) or print preview; plus a product search bar in Lançamentos.

**Architecture:** New page `ListaPrecos.tsx` loads all products + active prices, lets the user toggle/edit inline, then calls two new IPC channels (`lista-precos:getImage` and `lista-precos:print`) that render HTML in a hidden/visible BrowserWindow. The product filter in Lançamentos is a local state filter over `visibleProdutos`.

**Tech Stack:** Electron + React + Tailwind CSS, better-sqlite3, lucide-react, existing IPC pattern from `print.ts` / `nota:getImage`.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Modify** | `src/shared/ipc-channels.ts` | Add 2 new IPC constants |
| **Create** | `src/main/services/lista-precos.service.ts` | HTML generator for the image/print |
| **Create** | `src/main/handlers/lista-precos.ts` | IPC handler registration |
| **Modify** | `src/main/handlers/index.ts` | Register new handlers |
| **Create** | `src/renderer/src/pages/ListaPrecos.tsx` | Full page component |
| **Modify** | `src/renderer/src/components/Sidebar.tsx` | Add nav item |
| **Modify** | `src/renderer/src/App.tsx` | Add route |
| **Modify** | `src/renderer/src/components/Lancamentos/LancamentosHeader.tsx` | Add prodSearch prop |
| **Modify** | `src/renderer/src/pages/Lancamentos.tsx` | Wire up prodSearch state + filter |

---

## Chunk 1: Backend — Service + IPC Channels + Handler

### Task 1: Add IPC constants

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add two new channels at the end of the IPC object (before `} as const`)**

  Add after `LOTE_GET_QUINZENA`:
  ```typescript
  LISTA_PRECOS_GET_IMAGE: 'lista-precos:getImage',
  LISTA_PRECOS_PRINT: 'lista-precos:print',
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/shared/ipc-channels.ts
  git commit -m "feat: add IPC channels for lista-precos"
  ```

---

### Task 2: Create the HTML generator service

**Files:**
- Create: `src/main/services/lista-precos.service.ts`

- [ ] **Step 1: Create the file with the following content**

  ```typescript
  export interface ListaPrecosItem {
    nome: string
    unidade: string
    preco: number
  }

  export interface ListaPrecosData {
    nomeEmpresa: string
    logoBase64: string   // full data URL — e.g. "data:image/png;base64,..."
    itens: ListaPrecosItem[]
  }

  function fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  export function generateListaPrecosHtml(data: ListaPrecosData): string {
    const rows = data.itens.map((item, i) => `
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
  .watermark {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-25deg);
    font-size: 72px; font-weight: 900; color: #10b981; opacity: 0.04;
    white-space: nowrap; pointer-events: none; z-index: 0; letter-spacing: .05em;
  }
  .container { padding: 20px 22px; position: relative; z-index: 1; }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2.5px solid #10b981;
  }
  .company-name { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -.02em; }
  .list-title { font-size: 10px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-top: 3px; }
  .logo { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
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
  <div class="watermark">${data.nomeEmpresa}</div>
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

  export function generateListaPrecosPrintHtml(data: ListaPrecosData): string {
    const rows = data.itens.map((item) => `
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
  body { font-family: Arial, sans-serif; background: #e5e7eb; }
  .toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #1e293b; }
  .btn-print { padding: 6px 18px; background: #16a34a; color: #fff; border: none; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; }
  .btn-print:hover { background: #15803d; }
  .btn-close { padding: 6px 14px; background: #475569; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
  .page-wrap { padding: 12px; }
  .page { background: #fff; width: 180mm; margin: 0 auto; padding: 14mm 16mm; position: relative; overflow: hidden; }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-25deg);
    font-size: 80px; font-weight: 900; color: #10b981; opacity: 0.04;
    white-space: nowrap; pointer-events: none;
  }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 10mm; padding-bottom: 4mm; border-bottom: 2.5px solid #10b981;
    position: relative;
  }
  .company-name { font-size: 22pt; font-weight: 900; color: #0f172a; }
  .list-title { font-size: 9pt; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-top: 2mm; }
  .logo { width: 14mm; height: 14mm; border-radius: 50%; object-fit: cover; }
  table { width: 100%; border-collapse: collapse; position: relative; }
  thead tr { border-bottom: 1px solid #e2e8f0; }
  th { font-size: 8pt; color: #94a3b8; font-weight: 600; padding: 2mm 3mm;
       text-transform: uppercase; letter-spacing: .05em; }
  th.c-nome { text-align: left; }
  th.c-un { text-align: center; }
  th.c-preco { text-align: right; }
  td { font-size: 10pt; color: #1e293b; padding: 2.5mm 3mm; border-bottom: 1px solid #f1f5f9; }
  tr:nth-child(even) td { background: rgba(16,185,129,.04); }
  .c-nome { text-align: left; }
  .c-un { text-align: center; color: #64748b; }
  .c-preco { text-align: right; font-weight: 700; }
  .footer { margin-top: 6mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    body { background: #fff; }
    .toolbar { display: none; }
    .page-wrap { padding: 0; }
    .page { width: 210mm; margin: 0; padding: 14mm 16mm; min-height: 297mm; }
  }
  </style>
  </head>
  <script>document.addEventListener('keydown', function(e){ if(e.key==='Escape') window.close(); });</script>
  <body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
    <button class="btn-close" onclick="window.close()">✕ Fechar</button>
  </div>
  <div class="page-wrap">
    <div class="page">
      <div class="watermark">${data.nomeEmpresa}</div>
      <div class="header" style="position:relative">
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
  </div>
  </body>
  </html>`
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/main/services/lista-precos.service.ts
  git commit -m "feat: add lista-precos HTML generator service"
  ```

---

### Task 3: Create the IPC handler

**Files:**
- Create: `src/main/handlers/lista-precos.ts`

The handler reuses the BrowserWindow pattern from `src/main/handlers/print.ts` (GET_NOTA_IMAGE).

- [ ] **Step 1: Create the file**

  ```typescript
  import { ipcMain, BrowserWindow } from 'electron'
  import { IPC } from '../../shared/ipc-channels'
  import { generateListaPrecosHtml, generateListaPrecosPrintHtml, ListaPrecosData } from '../services/lista-precos.service'

  export function registerListaPrecosHandlers() {
    // Returns base64 PNG data URL of the price list image
    ipcMain.handle(IPC.LISTA_PRECOS_GET_IMAGE, async (_event, data: ListaPrecosData) => {
      const html = generateListaPrecosHtml(data)
      const win = new BrowserWindow({
        width: 400,
        height: 800,
        show: false,
        frame: false,
        webPreferences: { sandbox: false },
      })
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        await new Promise(r => setTimeout(r, 200))
        const contentHeight: number = await win.webContents.executeJavaScript(
          'document.body.scrollHeight || 0'
        )
        win.setSize(400, Math.min(Math.max(contentHeight + 4, 200), 4000))
        await new Promise(r => setTimeout(r, 80))
        const image = await win.webContents.capturePage()
        return image.toDataURL()
      } finally {
        win.close()
      }
    })

    // Opens a visible print preview window
    ipcMain.handle(IPC.LISTA_PRECOS_PRINT, async (_event, data: ListaPrecosData) => {
      const html = generateListaPrecosPrintHtml(data)
      const win = new BrowserWindow({
        width: 900,
        height: 700,
        title: 'Lista de Preços — Imprimir',
        webPreferences: { sandbox: false },
      })
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    })
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/main/handlers/lista-precos.ts
  git commit -m "feat: add lista-precos IPC handler"
  ```

---

### Task 4: Register the handler in index.ts

**Files:**
- Modify: `src/main/handlers/index.ts`

- [ ] **Step 1: Add import at the top with the other handler imports**
  ```typescript
  import { registerListaPrecosHandlers } from './lista-precos'
  ```

- [ ] **Step 2: Call registration in the same block as the others**
  ```typescript
  registerListaPrecosHandlers()
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/main/handlers/index.ts
  git commit -m "feat: register lista-precos handlers"
  ```

---

## Chunk 2: Frontend — ListaPrecos Page

### Task 5: Create the ListaPrecos page

**Files:**
- Create: `src/renderer/src/pages/ListaPrecos.tsx`

This page:
1. Loads all products (`PRODUTOS_LIST`) and all prices (`PRECOS_LIST`) on mount
2. Builds a map of the latest active price per product (where `vigencia_fim` is null)
3. Renders a table: all products, each row has a toggle checkbox
4. Toggled-on rows (green) show an editable price input
5. Toggled-off rows (gray) show the read-only price
6. Filter input at top filters by product name
7. "Novo produto" button opens a modal
8. Footer: "Gerar Imagem" and "Imprimir" buttons (disabled if no product selected)

The `logoBase64` is fetched once on mount by calling `fetch(logoSrc)` and converting to a data URL.

- [ ] **Step 1: Create the file with the following complete implementation**

  ```typescript
  import { useState, useEffect, useRef } from 'react'
  import { Search, Plus, Image, Printer, X, Check } from 'lucide-react'
  import { IPC } from '../../../shared/ipc-channels'
  import type { Produto } from '../../../shared/types'
  import logoSrc from '../assets/logo.png'

  interface Preco {
    id: number
    produto_id: number | null
    loja_id: number | null
    preco_venda: number
    vigencia_fim: string | null
  }

  interface ItemLista {
    produto: Produto
    preco: number
    ativo: boolean
  }

  interface NovoModal {
    nome: string
    unidade: string
    preco: string
  }

  const UNIDADES = ['KG', 'SC', 'CX', 'UN', 'FD', 'PC', 'LT', 'DZ']

  async function imgToDataUrl(src: string): Promise<string> {
    const res = await fetch(src)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  }

  export function ListaPrecos() {
    const [itens, setItens] = useState<ItemLista[]>([])
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [imageLoading, setImageLoading] = useState(false)
    const [printLoading, setPrintLoading] = useState(false)
    const [sharePreview, setSharePreview] = useState<string | null>(null)
    const [shareCopied, setShareCopied] = useState(false)
    const [novoModal, setNovoModal] = useState<NovoModal | null>(null)
    const [nomeEmpresa, setNomeEmpresa] = useState('HENRIQUE')
    const logoBase64Ref = useRef<string>('')

    useEffect(() => {
      async function load() {
        setLoading(true)
        const [prods, precos, nome] = await Promise.all([
          window.electron.invoke<Produto[]>(IPC.PRODUTOS_LIST),
          window.electron.invoke<Preco[]>(IPC.PRECOS_LIST),
          window.electron.invoke<string | null>(IPC.CONFIG_GET, 'nome_fornecedor'),
          imgToDataUrl(logoSrc).then(b64 => { logoBase64Ref.current = b64 }),
        ])
        if (nome) setNomeEmpresa(nome.toUpperCase())
        // Build price map: produto_id → latest active price
        const priceMap = new Map<number, number>()
        for (const p of precos) {
          if (p.produto_id && !p.vigencia_fim && !priceMap.has(p.produto_id)) {
            priceMap.set(p.produto_id, p.preco_venda)
          }
        }
        const ativos = prods.filter(p => p.ativo !== 0)
        setItens(ativos.map(p => ({
          produto: p,
          preco: priceMap.get(p.id) ?? 0,
          ativo: false,
        })))
        setLoading(false)
      }
      load()
    }, [])

    const toggleItem = (id: number) => {
      setItens(prev => prev.map(it =>
        it.produto.id === id ? { ...it, ativo: !it.ativo } : it
      ))
    }

    const setPreco = (id: number, value: string) => {
      const num = parseFloat(value.replace(',', '.')) || 0
      setItens(prev => prev.map(it =>
        it.produto.id === id ? { ...it, preco: num } : it
      ))
    }

    const selecionados = itens.filter(it => it.ativo)

    const buildData = () => ({
      nomeEmpresa,
      logoBase64: logoBase64Ref.current,
      itens: selecionados.map(it => ({
        nome: it.produto.nome.toUpperCase(),
        unidade: it.produto.unidade,
        preco: it.preco,
      })),
    })

    const handleGerarImagem = async () => {
      if (selecionados.length === 0) return
      setImageLoading(true)
      try {
        const dataUrl = await window.electron.invoke<string>(IPC.LISTA_PRECOS_GET_IMAGE, buildData())
        setSharePreview(dataUrl)
        setShareCopied(false)
      } finally {
        setImageLoading(false)
      }
    }

    const handleImprimir = async () => {
      if (selecionados.length === 0) return
      setPrintLoading(true)
      try {
        await window.electron.invoke(IPC.LISTA_PRECOS_PRINT, buildData())
      } finally {
        setPrintLoading(false)
      }
    }

    const handleCopyImage = async () => {
      if (!sharePreview) return
      await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview)
      setShareCopied(true)
    }

    const handleSalvarNovo = async () => {
      if (!novoModal || !novoModal.nome.trim()) return
      const preco = parseFloat(novoModal.preco.replace(',', '.')) || 0
      const novo = await window.electron.invoke<Produto>(IPC.PRODUTOS_CREATE, {
        nome: novoModal.nome.trim(),
        unidade: novoModal.unidade || 'UN',
      })
      setItens(prev => [...prev, { produto: novo, preco, ativo: true }])
      setNovoModal(null)
    }

    const filtered = search.trim()
      ? itens.filter(it => it.produto.nome.toLowerCase().includes(search.toLowerCase()))
      : itens

    if (loading) {
      return (
        <div className="flex items-center justify-center h-48 text-slate-400">
          Carregando produtos...
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Lista de Preços</h1>
          <span className="text-sm text-slate-500">
            {selecionados.length} produto{selecionados.length !== 1 ? 's' : ''} selecionado{selecionados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Search + Add button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar produtos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={() => setNovoModal({ nome: '', unidade: 'UN', preco: '' })}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Novo produto
          </button>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="w-10 px-3 py-2.5"></th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600">Produto</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">UN</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-right pr-4">Preço</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => {
                const on = it.ativo
                return (
                  <tr
                    key={it.produto.id}
                    onClick={() => toggleItem(it.produto.id)}
                    className={`border-b border-slate-100 cursor-pointer transition-colors ${
                      on ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        on ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                      }`}>
                        {on && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 ${on ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                      {it.produto.nome}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-400 text-xs">
                      {it.produto.unidade}
                    </td>
                    <td className="px-3 py-2.5 text-right pr-4">
                      {on ? (
                        <input
                          type="text"
                          defaultValue={it.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => setPreco(it.produto.id, e.target.value)}
                          className="w-24 text-right text-sm font-semibold text-emerald-700 border border-emerald-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                        />
                      ) : (
                        <span className="text-slate-400 text-xs">
                          {it.preco > 0
                            ? `R$ ${it.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-sm">
                    {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleImprimir}
            disabled={selecionados.length === 0 || printLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            {printLoading ? 'Abrindo...' : 'Imprimir'}
          </button>
          <button
            onClick={handleGerarImagem}
            disabled={selecionados.length === 0 || imageLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Image className="w-4 h-4" />
            {imageLoading ? 'Gerando...' : 'Gerar Imagem'}
          </button>
        </div>

        {/* Share preview modal */}
        {sharePreview && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Imagem gerada</span>
                <button onClick={() => setSharePreview(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <img src={sharePreview} alt="Lista de preços" className="w-full rounded border border-slate-100" />
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={handleCopyImage}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    shareCopied
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {shareCopied ? '✓ Copiado!' : '📋 Copiar imagem'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Novo produto modal */}
        {novoModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-80">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Novo produto</span>
                <button onClick={() => setNovoModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome</label>
                  <input
                    autoFocus
                    type="text"
                    value={novoModal.nome}
                    onChange={e => setNovoModal(m => m ? { ...m, nome: e.target.value } : m)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Nome do produto"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidade</label>
                    <select
                      value={novoModal.unidade}
                      onChange={e => setNovoModal(m => m ? { ...m, unidade: e.target.value } : m)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Preço</label>
                    <input
                      type="text"
                      value={novoModal.preco}
                      onChange={e => setNovoModal(m => m ? { ...m, preco: e.target.value } : m)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSalvarNovo}
                  disabled={!novoModal.nome.trim()}
                  className="w-full py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Salvar produto
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/renderer/src/pages/ListaPrecos.tsx
  git commit -m "feat: add ListaPrecos page component"
  ```

---

## Chunk 3: Navigation + Routing

### Task 6: Add nav item to Sidebar

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Add `Tag` to the lucide-react import**

  The current import line is:
  ```typescript
  import { LayoutDashboard, ClipboardList, History, BarChart2, Wallet, Settings, RefreshCw, RotateCcw, Landmark } from 'lucide-react'
  ```
  Add `Tag` to it:
  ```typescript
  import { LayoutDashboard, ClipboardList, History, BarChart2, Wallet, Settings, RefreshCw, RotateCcw, Landmark, Tag } from 'lucide-react'
  ```

- [ ] **Step 2: Add new nav item after the Histórico entry**

  Current array (relevant section):
  ```typescript
  { to: '/historico', icon: History, label: 'Histórico' },
  { to: '/relatorios', icon: BarChart2, label: 'Relatórios' },
  ```
  Change to:
  ```typescript
  { to: '/historico', icon: History, label: 'Histórico' },
  { to: '/lista-precos', icon: Tag, label: 'Lista de Preços' },
  { to: '/relatorios', icon: BarChart2, label: 'Relatórios' },
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/renderer/src/components/Sidebar.tsx
  git commit -m "feat: add Lista de Preços nav item to sidebar"
  ```

---

### Task 7: Add route in App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add import with the other page imports**
  ```typescript
  import { ListaPrecos } from './pages/ListaPrecos'
  ```

- [ ] **Step 2: Add route after the historico route**

  Current:
  ```typescript
  <Route path="historico" element={<ErrorBoundary><Historico /></ErrorBoundary>} />
  <Route path="relatorios" element={<ErrorBoundary><Relatorios /></ErrorBoundary>} />
  ```
  Change to:
  ```typescript
  <Route path="historico" element={<ErrorBoundary><Historico /></ErrorBoundary>} />
  <Route path="lista-precos" element={<ErrorBoundary><ListaPrecos /></ErrorBoundary>} />
  <Route path="relatorios" element={<ErrorBoundary><Relatorios /></ErrorBoundary>} />
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/renderer/src/App.tsx
  git commit -m "feat: add /lista-precos route"
  ```

---

## Chunk 4: Lançamentos Product Search

### Task 8: Add prodSearch prop to LancamentosHeader

**Files:**
- Modify: `src/renderer/src/components/Lancamentos/LancamentosHeader.tsx`

- [ ] **Step 1: Add two props to the `LancamentosHeaderProps` interface**

  After the existing props, add:
  ```typescript
  prodSearch: string
  onProdSearch: (v: string) => void
  ```

- [ ] **Step 2: Add `Search` to lucide-react import**

  Current:
  ```typescript
  import { Plus, Pencil, Check, Table2, List, LayoutGrid } from 'lucide-react'
  ```
  Change to:
  ```typescript
  import { Plus, Pencil, Check, Table2, List, LayoutGrid, Search } from 'lucide-react'
  ```

- [ ] **Step 3: Destructure the new props in the component function signature**

  Add `prodSearch` and `onProdSearch` to the destructured props.

- [ ] **Step 4: Add the search input to the rendered JSX**

  Add a search field in the header, right before or after the layout mode selector buttons. The exact location in the JSX is wherever there is a logical gap — usually a `div` row with the header controls. Add:
  ```tsx
  <div className="relative">
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    <input
      type="text"
      placeholder="Buscar produto..."
      value={prodSearch}
      onChange={e => onProdSearch(e.target.value)}
      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44"
    />
    {prodSearch && (
      <button
        onClick={() => onProdSearch('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
  ```

  Also add `X` to the lucide-react import.

- [ ] **Step 5: Commit**
  ```bash
  git add src/renderer/src/components/Lancamentos/LancamentosHeader.tsx
  git commit -m "feat: add product search input to LancamentosHeader"
  ```

---

### Task 9: Wire up prodSearch in Lancamentos.tsx

**Files:**
- Modify: `src/renderer/src/pages/Lancamentos.tsx`

- [ ] **Step 1: Add `prodSearch` state near the other state declarations**
  ```typescript
  const [prodSearch, setProdSearch] = useState('')
  ```

- [ ] **Step 2: Filter `visibleProdutos` by the search term**

  The `visibleProdutos` computation ends at line 321 with:
  ```typescript
  colOrderRef.current = visibleProdutos.map(p => p.id)
  ```

  After that line, add a filtered variable (do NOT reassign `visibleProdutos` — `colOrderRef` must stay unfiltered):
  ```typescript
  const displayProdutos = prodSearch.trim()
    ? visibleProdutos.filter(p =>
        p.nome.toLowerCase().includes(prodSearch.toLowerCase())
      )
    : visibleProdutos
  ```

- [ ] **Step 3: Use `displayProdutos` instead of `visibleProdutos` when rendering columns**

  Find where `visibleProdutos` is used to render the table columns (in the JSX, likely passed to a sub-component or mapped directly). Replace that usage with `displayProdutos`.

  Also pass `prodSearch` and `setProdSearch` to `LancamentosHeader`:
  ```tsx
  prodSearch={prodSearch}
  onProdSearch={setProdSearch}
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add src/renderer/src/pages/Lancamentos.tsx
  git commit -m "feat: add product column search filter to Lancamentos"
  ```

---

## Final Step: Push

- [ ] **Push all commits**
  ```bash
  git push origin main
  ```

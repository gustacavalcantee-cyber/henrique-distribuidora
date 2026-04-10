import { useState, useEffect, useRef } from 'react'
import { Search, Plus, ImageIcon, Printer, X, Check } from 'lucide-react'
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
      // Build price map: produto_id → first active price found
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Filtrar produtos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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
          <ImageIcon className="w-4 h-4" />
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
            <div className="p-4 max-h-[60vh] overflow-y-auto">
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
                  onKeyDown={e => { if (e.key === 'Enter') handleSalvarNovo() }}
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
                    onKeyDown={e => { if (e.key === 'Enter') handleSalvarNovo() }}
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

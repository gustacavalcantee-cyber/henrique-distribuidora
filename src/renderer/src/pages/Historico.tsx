import { useState, useEffect } from 'react'
import { Trash2, Pencil, Printer } from 'lucide-react'
import type { Pedido, Rede, Loja, ItemPedido, Produto } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface EditState {
  pedido: Pedido
  itens: ItemPedido[]
  produtos: Produto[]
}

export function Historico() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [redes, setRedes] = useState<Rede[]>([])
  const [lojas, setLojas] = useState<Loja[]>([])
  const [loading, setLoading] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editQtds, setEditQtds] = useState<Record<number, string>>({})
  const [editNumeroOc, setEditNumeroOc] = useState('')
  const [filters, setFilters] = useState({
    data_inicio: '',
    data_fim: '',
    rede_id: '',
    loja_id: '',
    numero_oc: '',
  })

  useEffect(() => {
    window.electron.invoke<Rede[]>(IPC.REDES_LIST).then(setRedes)
    window.electron.invoke<Loja[]>(IPC.LOJAS_LIST).then(setLojas)
  }, [])

  const loadPedidos = async () => {
    setLoading(true)
    const f: Record<string, unknown> = {}
    if (filters.data_inicio) f.data_inicio = filters.data_inicio
    if (filters.data_fim) f.data_fim = filters.data_fim
    if (filters.rede_id) f.rede_id = Number(filters.rede_id)
    if (filters.loja_id) f.loja_id = Number(filters.loja_id)
    if (filters.numero_oc) f.numero_oc = filters.numero_oc
    const data = await window.electron.invoke<Pedido[]>(IPC.PEDIDOS_LIST, f)
    setPedidos(data)
    setLoading(false)
  }

  useEffect(() => { loadPedidos() }, [])

  const handlePrint = (id: number) => {
    window.electron.invoke(IPC.PRINT_PEDIDO, id).catch(console.error)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este pedido? Esta ação não pode ser desfeita.')) return
    await window.electron.invoke(IPC.PEDIDOS_DELETE, id)
    loadPedidos()
  }

  const handleEdit = async (pedido: Pedido) => {
    const [itens, produtos] = await Promise.all([
      window.electron.invoke<ItemPedido[]>(IPC.PEDIDOS_ITENS, pedido.id),
      window.electron.invoke<Produto[]>(IPC.PRODUTOS_LIST),
    ])
    const qtds: Record<number, string> = {}
    for (const item of itens) {
      qtds[item.produto_id] = String(item.quantidade)
    }
    setEditQtds(qtds)
    setEditNumeroOc(pedido.numero_oc)
    setEditState({ pedido, itens, produtos: produtos.filter(p => itens.some(i => i.produto_id === p.id)) })
  }

  const handleSaveEdit = async () => {
    if (!editState) return
    const { pedido, itens } = editState
    const updatedItens = itens.map(item => ({
      produto_id: item.produto_id,
      quantidade: parseFloat(editQtds[item.produto_id] ?? String(item.quantidade)) || item.quantidade,
      preco_unit: item.preco_unit,
      custo_unit: item.custo_unit,
    }))
    await window.electron.invoke(IPC.PEDIDOS_UPDATE_BY_ID, pedido.id, {
      numero_oc: editNumeroOc,
      itens: updatedItens,
    })
    setEditState(null)
    loadPedidos()
  }

  const getRedeName = (id: number) => redes.find(r => r.id === id)?.nome ?? String(id)
  const getLojaName = (id: number) => lojas.find(l => l.id === id)?.nome ?? String(id)
  const formatDate = (iso: string) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}` }

  return (
    <div className="flex flex-col gap-4 h-full">
      <h2 className="text-2xl font-bold text-gray-900">Histórico</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end bg-white border rounded p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">De</label>
          <input type="date" className="border rounded px-2 py-1 text-sm"
            value={filters.data_inicio} onChange={e => setFilters(f => ({...f, data_inicio: e.target.value}))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Até</label>
          <input type="date" className="border rounded px-2 py-1 text-sm"
            value={filters.data_fim} onChange={e => setFilters(f => ({...f, data_fim: e.target.value}))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rede</label>
          <select className="border rounded px-2 py-1 text-sm"
            value={filters.rede_id} onChange={e => setFilters(f => ({...f, rede_id: e.target.value}))}>
            <option value="">Todas</option>
            {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Loja</label>
          <select className="border rounded px-2 py-1 text-sm"
            value={filters.loja_id} onChange={e => setFilters(f => ({...f, loja_id: e.target.value}))}>
            <option value="">Todas</option>
            {lojas.filter(l => !filters.rede_id || l.rede_id === Number(filters.rede_id))
              .map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">OC</label>
          <input className="border rounded px-2 py-1 text-sm w-24"
            placeholder="ex: 00402"
            value={filters.numero_oc} onChange={e => setFilters(f => ({...f, numero_oc: e.target.value}))} />
        </div>
        <button onClick={loadPedidos}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Filtrar
        </button>
      </div>

      {/* Table */}
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-left">DATA</th>
                <th className="border px-3 py-2 text-left">REDE</th>
                <th className="border px-3 py-2 text-left">LOJA</th>
                <th className="border px-3 py-2 text-left">OC</th>
                <th className="border px-3 py-2 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-1.5">{formatDate(p.data_pedido)}</td>
                  <td className="border px-3 py-1.5">{getRedeName(p.rede_id)}</td>
                  <td className="border px-3 py-1.5">{getLojaName(p.loja_id)}</td>
                  <td className="border px-3 py-1.5 font-mono">{p.numero_oc}</td>
                  <td className="border px-3 py-1.5 text-right flex gap-1 justify-end">
                    <button onClick={() => handlePrint(p.id)}
                      className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50">
                      <Printer size={14} />
                    </button>
                    <button onClick={() => handleEdit(p)}
                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {pedidos.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">Nenhum pedido encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-bold text-lg">Editar Pedido</h3>
              <div className="text-sm text-gray-500">
                {formatDate(editState.pedido.data_pedido)} — {getLojaName(editState.pedido.loja_id)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Nº OC:</label>
                <input
                  className="border rounded px-2 py-1 text-sm font-mono w-32"
                  value={editNumeroOc}
                  onChange={e => setEditNumeroOc(e.target.value)}
                />
              </div>
            </div>
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-2 py-1 text-left">Produto</th>
                  <th className="border px-2 py-1 text-center">Unidade</th>
                  <th className="border px-2 py-1 text-center">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {[...editState.itens].sort((a, b) => {
                  const pa = editState.produtos.find(p => p.id === a.produto_id)?.nome ?? ''
                  const pb = editState.produtos.find(p => p.id === b.produto_id)?.nome ?? ''
                  return pa.localeCompare(pb, 'pt-BR')
                }).map(item => {
                  const prod = editState.produtos.find(p => p.id === item.produto_id)
                  return (
                    <tr key={item.id}>
                      <td className="border px-2 py-1">{prod?.nome ?? item.produto_id}</td>
                      <td className="border px-2 py-1 text-center text-gray-500">{prod?.unidade}</td>
                      <td className="border px-2 py-1 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          className="w-20 border rounded px-1 py-0.5 text-center text-sm"
                          value={editQtds[item.produto_id] ?? ''}
                          onChange={e => setEditQtds(q => ({ ...q, [item.produto_id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditState(null)}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSaveEdit}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

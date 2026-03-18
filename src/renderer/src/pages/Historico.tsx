import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import type { Pedido, Rede, Loja } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

export function Historico() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [redes, setRedes] = useState<Rede[]>([])
  const [lojas, setLojas] = useState<Loja[]>([])
  const [loading, setLoading] = useState(false)
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

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este pedido? Esta ação não pode ser desfeita.')) return
    await window.electron.invoke(IPC.PEDIDOS_DELETE, id)
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
                  <td className="border px-3 py-1.5 text-right">
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
    </div>
  )
}

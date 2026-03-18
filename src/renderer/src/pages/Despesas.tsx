import { useState, useEffect, useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type { ColDef, CellValueChangedEvent } from 'ag-grid-community'
import type { Despesa, Rede, Loja } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

const CATEGORIAS = ['Combustível', 'Embalagem', 'Mão de obra', 'Manutenção', 'Outros']

export function Despesas() {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [redes, setRedes] = useState<Rede[]>([])
  const [lojas, setLojas] = useState<Loja[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ data_inicio: '', data_fim: '', rede_id: '' })

  // New row form
  const [newRow, setNewRow] = useState({ data: '', categoria: CATEGORIAS[0], descricao: '', rede_id: '', loja_id: '', valor: '' })

  useEffect(() => {
    window.electron.invoke<Rede[]>(IPC.REDES_LIST).then(setRedes)
    window.electron.invoke<Loja[]>(IPC.LOJAS_LIST).then(setLojas)
  }, [])

  const loadDespesas = useCallback(async () => {
    setLoading(true)
    const f: Record<string, unknown> = {}
    if (filters.data_inicio) f.data_inicio = filters.data_inicio
    if (filters.data_fim) f.data_fim = filters.data_fim
    if (filters.rede_id) f.rede_id = Number(filters.rede_id)
    const data = await window.electron.invoke<Despesa[]>(IPC.DESPESAS_LIST, f)
    setDespesas(data)
    setLoading(false)
  }, [filters])

  useEffect(() => { loadDespesas() }, [loadDespesas])

  const handleAdd = async () => {
    if (!newRow.data || !newRow.categoria || !newRow.valor) {
      alert('Preencha data, categoria e valor')
      return
    }
    await window.electron.invoke(IPC.DESPESAS_CREATE, {
      data: newRow.data,
      categoria: newRow.categoria,
      descricao: newRow.descricao || undefined,
      rede_id: newRow.rede_id ? Number(newRow.rede_id) : undefined,
      loja_id: newRow.loja_id ? Number(newRow.loja_id) : undefined,
      valor: Number(newRow.valor),
    })
    setNewRow({ data: '', categoria: CATEGORIAS[0], descricao: '', rede_id: '', loja_id: '', valor: '' })
    loadDespesas()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir esta despesa?')) return
    await window.electron.invoke(IPC.DESPESAS_DELETE, id)
    loadDespesas()
  }

  const onCellValueChanged = async (e: CellValueChangedEvent<Despesa>) => {
    if (!e.data) return
    await window.electron.invoke(IPC.DESPESAS_UPDATE, { id: e.data.id, [e.colDef.field!]: e.newValue })
    loadDespesas()
  }

  const getRedeName = (id: number | null) => id ? (redes.find(r => r.id === id)?.nome ?? String(id)) : '-'
  const getLojaName = (id: number | null) => id ? (lojas.find(l => l.id === id)?.nome ?? String(id)) : '-'
  const formatDate = (iso: string) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}` }

  const total = despesas.reduce((s, d) => s + d.valor, 0)

  const colDefs: ColDef<Despesa>[] = [
    { field: 'data', headerName: 'Data', width: 110, editable: true, valueFormatter: p => p.value ? formatDate(p.value) : '' },
    { field: 'categoria', headerName: 'Categoria', width: 150, editable: true },
    { field: 'descricao', headerName: 'Descrição', flex: 1, editable: true },
    { field: 'rede_id', headerName: 'Rede', width: 120, editable: false, valueFormatter: p => getRedeName(p.value) },
    { field: 'loja_id', headerName: 'Loja', width: 140, editable: false, valueFormatter: p => getLojaName(p.value) },
    { field: 'valor', headerName: 'Valor (R$)', width: 120, editable: true, type: 'numericColumn',
      valueFormatter: p => p.value != null ? Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '' },
    {
      headerName: 'Excluir', width: 90, editable: false,
      cellRenderer: (p: { data?: Despesa }) => {
        if (!p.data) return null
        return `<button style="color:red;cursor:pointer;background:none;border:none;font-size:12px"
          onclick="window._deleteDespesa(${p.data.id})">✕ Excluir</button>`
      }
    },
  ]

  // Expose delete to window for the cell renderer (simple approach)
  ;(window as any)._deleteDespesa = handleDelete

  const filteredLojas = lojas.filter(l => !newRow.rede_id || l.rede_id === Number(newRow.rede_id))

  return (
    <div className="flex flex-col gap-4 h-full">
      <h2 className="text-2xl font-bold text-gray-900">Despesas</h2>

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
        <button onClick={loadDespesas}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Filtrar
        </button>
      </div>

      {/* Add new row form */}
      <div className="flex flex-wrap gap-2 items-end bg-blue-50 border border-blue-200 rounded p-3">
        <input type="date" className="border rounded px-2 py-1 text-sm"
          value={newRow.data} onChange={e => setNewRow(r => ({...r, data: e.target.value}))} />
        <select className="border rounded px-2 py-1 text-sm"
          value={newRow.categoria} onChange={e => setNewRow(r => ({...r, categoria: e.target.value}))}>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
        <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Descrição"
          value={newRow.descricao} onChange={e => setNewRow(r => ({...r, descricao: e.target.value}))} />
        <select className="border rounded px-2 py-1 text-sm"
          value={newRow.rede_id} onChange={e => setNewRow(r => ({...r, rede_id: e.target.value, loja_id: ''}))}>
          <option value="">Rede (opcional)</option>
          {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm"
          value={newRow.loja_id} onChange={e => setNewRow(r => ({...r, loja_id: e.target.value}))}>
          <option value="">Loja (opcional)</option>
          {filteredLojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <input type="number" step="0.01" className="border rounded px-2 py-1 text-sm w-28" placeholder="Valor"
          value={newRow.valor} onChange={e => setNewRow(r => ({...r, valor: e.target.value}))} />
        <button onClick={handleAdd}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>

      {/* Grid */}
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <>
          <div className="ag-theme-alpine flex-1" style={{ height: 400 }}>
            <AgGridReact
              rowData={despesas}
              columnDefs={colDefs}
              onCellValueChanged={onCellValueChanged}
            />
          </div>
          <div className="bg-gray-100 border rounded p-2 text-sm font-semibold text-right">
            TOTAL: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </>
      )}
    </div>
  )
}

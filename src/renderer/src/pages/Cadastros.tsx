import { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type { ColDef, CellValueChangedEvent } from 'ag-grid-community'
import type { Rede, Loja, Produto, Preco, Custo } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useIpc } from '../hooks/useIpc'

type Tab = 'redes' | 'lojas' | 'produtos' | 'precos' | 'custos'

// ---- Redes Tab ----
function RedesTab() {
  const { data: redes, loading, reload } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [newNome, setNewNome] = useState('')
  const [newCor, setNewCor] = useState('#000000')

  const colDefs: ColDef<Rede>[] = [
    { field: 'id', headerName: 'ID', width: 70, editable: false },
    { field: 'nome', headerName: 'Nome', flex: 1, editable: true },
    { field: 'cor_tema', headerName: 'Cor', width: 120, editable: true },
    { field: 'ativo', headerName: 'Ativo', width: 90, editable: true },
  ]

  const onCellValueChanged = async (e: CellValueChangedEvent<Rede>) => {
    await window.electron.invoke(IPC.REDES_UPDATE, { id: e.data!.id, [e.colDef.field!]: e.newValue })
    reload()
  }

  const handleAdd = async () => {
    if (!newNome.trim()) return
    await window.electron.invoke(IPC.REDES_CREATE, { nome: newNome.trim(), cor_tema: newCor })
    setNewNome('')
    reload()
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Nome da rede"
          value={newNome}
          onChange={e => setNewNome(e.target.value)}
        />
        <input type="color" value={newCor} onChange={e => setNewCor(e.target.value)} className="h-8 w-12 cursor-pointer" />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="ag-theme-alpine flex-1" style={{ height: 400 }}>
          <AgGridReact rowData={redes ?? []} columnDefs={colDefs} onCellValueChanged={onCellValueChanged} />
        </div>
      )}
    </div>
  )
}

// ---- Lojas Tab ----
function LojasTab() {
  const { data: lojas, loading, reload } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [newNome, setNewNome] = useState('')
  const [newRedeId, setNewRedeId] = useState<number | ''>('')

  const colDefs: ColDef<Loja>[] = [
    { field: 'id', headerName: 'ID', width: 70, editable: false },
    { field: 'rede_id', headerName: 'Rede ID', width: 100, editable: true },
    { field: 'nome', headerName: 'Nome', flex: 1, editable: true },
    { field: 'codigo', headerName: 'Código', width: 120, editable: true },
    { field: 'ativo', headerName: 'Ativo', width: 90, editable: true },
  ]

  const onCellValueChanged = async (e: CellValueChangedEvent<Loja>) => {
    await window.electron.invoke(IPC.LOJAS_UPDATE, { id: e.data!.id, [e.colDef.field!]: e.newValue })
    reload()
  }

  const handleAdd = async () => {
    if (!newNome.trim() || newRedeId === '') return
    await window.electron.invoke(IPC.LOJAS_CREATE, { nome: newNome.trim(), rede_id: Number(newRedeId) })
    setNewNome('')
    reload()
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        <select className="border rounded px-2 py-1 text-sm" value={newRedeId} onChange={e => setNewRedeId(Number(e.target.value))}>
          <option value="">Selecione a rede</option>
          {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Nome da loja"
          value={newNome}
          onChange={e => setNewNome(e.target.value)}
        />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="ag-theme-alpine flex-1" style={{ height: 400 }}>
          <AgGridReact rowData={lojas ?? []} columnDefs={colDefs} onCellValueChanged={onCellValueChanged} />
        </div>
      )}
    </div>
  )
}

// ---- Produtos Tab ----
function ProdutosTab() {
  const { data: produtos, loading, reload } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [newNome, setNewNome] = useState('')
  const [newUnidade, setNewUnidade] = useState<'UN' | 'KG'>('UN')
  const [newRedeId, setNewRedeId] = useState<number | ''>('')

  const colDefs: ColDef<Produto>[] = [
    { field: 'id', headerName: 'ID', width: 70, editable: false },
    { field: 'rede_id', headerName: 'Rede ID', width: 100, editable: true },
    { field: 'nome', headerName: 'Nome', flex: 1, editable: true },
    { field: 'unidade', headerName: 'Unidade', width: 100, editable: true },
    { field: 'ordem_exibicao', headerName: 'Ordem', width: 90, editable: true },
    { field: 'ativo', headerName: 'Ativo', width: 90, editable: true },
  ]

  const onCellValueChanged = async (e: CellValueChangedEvent<Produto>) => {
    await window.electron.invoke(IPC.PRODUTOS_UPDATE, { id: e.data!.id, [e.colDef.field!]: e.newValue })
    reload()
  }

  const handleAdd = async () => {
    if (!newNome.trim()) return
    await window.electron.invoke(IPC.PRODUTOS_CREATE, {
      nome: newNome.trim(),
      unidade: newUnidade,
      rede_id: newRedeId !== '' ? Number(newRedeId) : undefined,
    })
    setNewNome('')
    reload()
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        <select className="border rounded px-2 py-1 text-sm" value={newRedeId} onChange={e => setNewRedeId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Global (todas as redes)</option>
          {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Nome do produto"
          value={newNome}
          onChange={e => setNewNome(e.target.value)}
        />
        <select className="border rounded px-2 py-1 text-sm" value={newUnidade} onChange={e => setNewUnidade(e.target.value as 'UN' | 'KG')}>
          <option value="UN">UN</option>
          <option value="KG">KG</option>
        </select>
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="ag-theme-alpine flex-1" style={{ height: 400 }}>
          <AgGridReact rowData={produtos ?? []} columnDefs={colDefs} onCellValueChanged={onCellValueChanged} />
        </div>
      )}
    </div>
  )
}

// ---- Preços Tab ----
function PrecosTab() {
  const { data: precos, loading, reload } = useIpc<Preco[]>(IPC.PRECOS_LIST)
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const [newProdId, setNewProdId] = useState<number | ''>('')
  const [newLojaId, setNewLojaId] = useState<number | ''>('')
  const [newPreco, setNewPreco] = useState('')

  const colDefs: ColDef<Preco>[] = [
    { field: 'id', headerName: 'ID', width: 70, editable: false },
    { field: 'produto_id', headerName: 'Produto ID', width: 110, editable: false },
    { field: 'loja_id', headerName: 'Loja ID', width: 100, editable: false },
    { field: 'preco_venda', headerName: 'Preço', width: 110, editable: false },
    { field: 'vigencia_inicio', headerName: 'Vigência Início', flex: 1, editable: false },
    { field: 'vigencia_fim', headerName: 'Vigência Fim', flex: 1, editable: false },
  ]

  const handleAdd = async () => {
    if (newProdId === '' || newLojaId === '' || !newPreco) return
    await window.electron.invoke(IPC.PRECOS_UPSERT, {
      produto_id: Number(newProdId),
      loja_id: Number(newLojaId),
      preco_venda: Number(newPreco),
    })
    setNewPreco('')
    reload()
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        <select className="border rounded px-2 py-1 text-sm" value={newProdId} onChange={e => setNewProdId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Produto</option>
          {produtos?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm" value={newLojaId} onChange={e => setNewLojaId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Loja</option>
          {lojas?.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm w-28"
          type="number"
          step="0.01"
          placeholder="Preço"
          value={newPreco}
          onChange={e => setNewPreco(e.target.value)}
        />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Definir Preço
        </button>
      </div>
      <p className="text-xs text-gray-500">O preço antigo é fechado automaticamente ao definir um novo preço para o mesmo produto/loja.</p>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="ag-theme-alpine flex-1" style={{ height: 400 }}>
          <AgGridReact rowData={precos ?? []} columnDefs={colDefs} />
        </div>
      )}
    </div>
  )
}

// ---- Custos Tab ----
function CustosTab() {
  const { data: custos, loading, reload } = useIpc<Custo[]>(IPC.CUSTOS_LIST)
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const [newProdId, setNewProdId] = useState<number | ''>('')
  const [newCusto, setNewCusto] = useState('')

  const colDefs: ColDef<Custo>[] = [
    { field: 'id', headerName: 'ID', width: 70, editable: false },
    { field: 'produto_id', headerName: 'Produto ID', width: 110, editable: false },
    { field: 'custo_compra', headerName: 'Custo', width: 110, editable: false },
    { field: 'vigencia_inicio', headerName: 'Vigência Início', flex: 1, editable: false },
    { field: 'vigencia_fim', headerName: 'Vigência Fim', flex: 1, editable: false },
  ]

  const handleAdd = async () => {
    if (newProdId === '' || !newCusto) return
    await window.electron.invoke(IPC.CUSTOS_UPSERT, {
      produto_id: Number(newProdId),
      custo_compra: Number(newCusto),
    })
    setNewCusto('')
    reload()
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        <select className="border rounded px-2 py-1 text-sm" value={newProdId} onChange={e => setNewProdId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Produto</option>
          {produtos?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm w-28"
          type="number"
          step="0.01"
          placeholder="Custo"
          value={newCusto}
          onChange={e => setNewCusto(e.target.value)}
        />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Definir Custo
        </button>
      </div>
      <p className="text-xs text-gray-500">O custo antigo é fechado automaticamente ao definir um novo custo para o mesmo produto.</p>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="ag-theme-alpine flex-1" style={{ height: 400 }}>
          <AgGridReact rowData={custos ?? []} columnDefs={colDefs} />
        </div>
      )}
    </div>
  )
}

// ---- Main Cadastros Page ----
const TABS: { id: Tab; label: string }[] = [
  { id: 'redes', label: 'Redes' },
  { id: 'lojas', label: 'Lojas' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'precos', label: 'Preços' },
  { id: 'custos', label: 'Custos' },
]

export function Cadastros() {
  const [activeTab, setActiveTab] = useState<Tab>('redes')

  return (
    <div className="flex flex-col h-full gap-4">
      <h2 className="text-2xl font-bold text-gray-900">Cadastros</h2>
      <div className="border-b border-gray-200">
        <nav className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1">
        {activeTab === 'redes' && <RedesTab />}
        {activeTab === 'lojas' && <LojasTab />}
        {activeTab === 'produtos' && <ProdutosTab />}
        {activeTab === 'precos' && <PrecosTab />}
        {activeTab === 'custos' && <CustosTab />}
      </div>
    </div>
  )
}

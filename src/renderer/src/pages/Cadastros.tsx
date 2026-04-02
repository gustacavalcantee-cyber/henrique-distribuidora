import { useState, useEffect, Fragment } from 'react'
import type { Rede, Loja, Produto, Preco, Custo, Franqueado } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useIpc } from '../hooks/useIpc'

type Tab = 'redes' | 'lojas' | 'produtos' | 'precos' | 'custos' | 'franqueados'

// ---- Redes Tab ----
function RedesTab() {
  const { data: redes, loading, reload } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [newNome, setNewNome] = useState('')
  const [newCor, setNewCor] = useState('#09a373')
  const [editId, setEditId] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor, setEditCor] = useState('')

  const handleAdd = async () => {
    if (!newNome.trim()) return
    await window.electron.invoke(IPC.REDES_CREATE, { nome: newNome.trim(), cor_tema: newCor })
    setNewNome('')
    reload()
  }

  const startEdit = (r: Rede) => {
    setEditId(r.id)
    setEditNome(r.nome)
    setEditCor(r.cor_tema ?? '#09a373')
  }

  const handleSaveEdit = async (id: number) => {
    await window.electron.invoke(IPC.REDES_UPDATE, { id, nome: editNome.trim(), cor_tema: editCor })
    setEditId(null)
    reload()
  }

  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Excluir a rede "${nome}"? Esta ação não pode ser desfeita.`)) return
    await window.electron.invoke(IPC.REDES_DELETE, id)
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
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <input type="color" value={newCor} onChange={e => setNewCor(e.target.value)} className="h-8 w-12 cursor-pointer rounded" title="Cor da rede" />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full max-w-xl">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-left text-xs text-gray-600">NOME</th>
                <th className="border px-3 py-2 text-center text-xs text-gray-600 w-24">COR</th>
                <th className="border px-3 py-2 text-right text-xs text-gray-600 w-36">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {(redes ?? []).map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  {editId === r.id ? (
                    <>
                      <td className="border px-2 py-1">
                        <input
                          autoFocus
                          className="w-full px-2 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={editNome}
                          onChange={e => setEditNome(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(r.id); if (e.key === 'Escape') setEditId(null) }}
                        />
                      </td>
                      <td className="border px-2 py-1 text-center">
                        <input type="color" value={editCor} onChange={e => setEditCor(e.target.value)} className="h-7 w-10 cursor-pointer rounded mx-auto block" />
                      </td>
                      <td className="border px-2 py-1 text-right">
                        <button onClick={() => handleSaveEdit(r.id)} className="text-green-600 hover:text-green-800 px-2 py-0.5 text-xs font-medium">Salvar</button>
                        <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 px-2 py-0.5 text-xs">Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="border px-3 py-1.5 font-medium text-gray-800">{r.nome}</td>
                      <td className="border px-3 py-1.5 text-center">
                        <span
                          className="inline-block w-6 h-6 rounded-full border border-gray-200"
                          style={{ background: r.cor_tema ?? '#ccc' }}
                          title={r.cor_tema ?? ''}
                        />
                      </td>
                      <td className="border px-3 py-1.5 text-right">
                        <button onClick={() => startEdit(r)} className="text-blue-600 hover:text-blue-800 px-2 py-0.5 text-xs rounded hover:bg-blue-50">Editar</button>
                        <button onClick={() => handleDelete(r.id, r.nome)} className="text-red-600 hover:text-red-800 px-2 py-0.5 text-xs rounded hover:bg-red-50">Excluir</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {(redes ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="border px-3 py-6 text-center text-gray-400 text-sm">Nenhuma rede cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
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
  const [editId, setEditId] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCnpj, setEditCnpj] = useState('')

  const handleAdd = async () => {
    if (!newNome.trim() || newRedeId === '') return
    await window.electron.invoke(IPC.LOJAS_CREATE, { nome: newNome.trim(), rede_id: Number(newRedeId) })
    setNewNome('')
    reload()
  }

  const startEdit = (l: Loja) => {
    setEditId(l.id)
    setEditNome(l.nome)
    setEditCnpj(l.cnpj ?? '')
  }

  const handleSaveEdit = async (id: number) => {
    await window.electron.invoke(IPC.LOJAS_UPDATE, { id, nome: editNome.trim(), cnpj: editCnpj.trim() || null })
    setEditId(null)
    reload()
  }

  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Excluir "${nome}"? Se houver pedidos vinculados, a loja será desativada.`)) return
    await window.electron.invoke(IPC.LOJAS_DELETE, id)
    reload()
  }

  const getRedeName = (id: number) => redes?.find(r => r.id === id)?.nome ?? String(id)

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
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>
      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-left text-xs text-gray-600">REDE</th>
                <th className="border px-3 py-2 text-left text-xs text-gray-600">NOME</th>
                <th className="border px-3 py-2 text-left text-xs text-gray-600">CNPJ</th>
                <th className="border px-3 py-2 text-xs text-gray-600 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {(lojas ?? []).map(l => (
                <tr key={l.id} className={`hover:bg-gray-50 ${l.ativo === 0 ? 'opacity-40' : ''}`}>
                  {editId === l.id ? (
                    <>
                      <td className="border px-3 py-1 text-gray-500">{getRedeName(l.rede_id)}</td>
                      <td className="border px-2 py-1">
                        <input className="border rounded px-2 py-0.5 text-sm w-full" value={editNome} onChange={e => setEditNome(e.target.value)} />
                      </td>
                      <td className="border px-2 py-1">
                        <input className="border rounded px-2 py-0.5 text-sm w-full" placeholder="00.000.000/0000-00" value={editCnpj} onChange={e => setEditCnpj(e.target.value)} />
                      </td>
                      <td className="border px-2 py-1 text-right">
                        <button onClick={() => handleSaveEdit(l.id)} className="text-green-600 hover:text-green-800 px-2 py-0.5 text-xs font-medium">Salvar</button>
                        <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 px-2 py-0.5 text-xs">Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="border px-3 py-1.5 text-gray-500">{getRedeName(l.rede_id)}</td>
                      <td className="border px-3 py-1.5">{l.nome}</td>
                      <td className="border px-3 py-1.5 text-gray-500">{l.cnpj ?? '—'}</td>
                      <td className="border px-3 py-1.5 text-right flex gap-1 justify-end">
                        <button onClick={() => startEdit(l)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 text-xs">Editar</button>
                        <button onClick={() => handleDelete(l.id, l.nome)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 text-xs">Excluir</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const UNIDADES = ['UN', 'KG', 'CART'] as const
type Unidade = typeof UNIDADES[number]

// ---- NCM lookup table for hortifruti products ----
const NCM_LOOKUP: Record<string, { ncm: string; descricao: string }> = {
  'abacate': { ncm: '08044000', descricao: 'Abacates' },
  'abacaxi': { ncm: '08043000', descricao: 'Abacaxis' },
  'abobrinha': { ncm: '07099300', descricao: 'Abobrinhas' },
  'acelga': { ncm: '07049000', descricao: 'Acelga' },
  'agriao': { ncm: '07099900', descricao: 'Agrião' },
  'agrião': { ncm: '07099900', descricao: 'Agrião' },
  'alface': { ncm: '07051900', descricao: 'Alfaces' },
  'alho': { ncm: '07032000', descricao: 'Alho' },
  'alho poro': { ncm: '07039000', descricao: 'Alho-porró' },
  'alho-poro': { ncm: '07039000', descricao: 'Alho-porró' },
  'ameixa': { ncm: '08094000', descricao: 'Ameixas' },
  'amendoim': { ncm: '12024200', descricao: 'Amendoim' },
  'banana': { ncm: '08030090', descricao: 'Bananas' },
  'banana da terra': { ncm: '08030090', descricao: 'Bananas' },
  'batata': { ncm: '07019000', descricao: 'Batatas' },
  'batata doce': { ncm: '07142000', descricao: 'Batata-doce' },
  'batata-doce': { ncm: '07142000', descricao: 'Batata-doce' },
  'berinjela': { ncm: '07099300', descricao: 'Berinjelas' },
  'beterraba': { ncm: '07061000', descricao: 'Beterraba' },
  'brocolis': { ncm: '07041000', descricao: 'Brócolis' },
  'brócolis': { ncm: '07041000', descricao: 'Brócolis' },
  'caju': { ncm: '08045090', descricao: 'Cajus' },
  'caqui': { ncm: '08109000', descricao: 'Caquis' },
  'cebola': { ncm: '07031000', descricao: 'Cebolas' },
  'cebolinha': { ncm: '07039000', descricao: 'Cebolinha' },
  'cenoura': { ncm: '07061000', descricao: 'Cenouras' },
  'cheiro verde': { ncm: '07099900', descricao: 'Cheiro-verde' },
  'chuchu': { ncm: '07099300', descricao: 'Chuchus' },
  'coentro': { ncm: '07099900', descricao: 'Coentro' },
  'couve': { ncm: '07049000', descricao: 'Couves' },
  'couve flor': { ncm: '07042000', descricao: 'Couves-flores' },
  'couve-flor': { ncm: '07042000', descricao: 'Couves-flores' },
  'coxinha': { ncm: '07099900', descricao: 'Outros' },
  'endívia': { ncm: '07051900', descricao: 'Endívias' },
  'endivia': { ncm: '07051900', descricao: 'Endívias' },
  'ervilha': { ncm: '07081000', descricao: 'Ervilhas' },
  'escarola': { ncm: '07051100', descricao: 'Escarolas' },
  'espinafre': { ncm: '07099900', descricao: 'Espinafre' },
  'feijao': { ncm: '07082000', descricao: 'Feijões' },
  'feijão': { ncm: '07082000', descricao: 'Feijões' },
  'figo': { ncm: '08040090', descricao: 'Figos' },
  'framboesa': { ncm: '08102000', descricao: 'Framboesas' },
  'goiaba': { ncm: '08045020', descricao: 'Goiabas' },
  'inhame': { ncm: '07149090', descricao: 'Inhame' },
  'jiló': { ncm: '07099300', descricao: 'Jiló' },
  'jilo': { ncm: '07099300', descricao: 'Jiló' },
  'kiwi': { ncm: '08109010', descricao: 'Kiwis' },
  'laranja': { ncm: '08051000', descricao: 'Laranjas' },
  'limao': { ncm: '08055000', descricao: 'Limões' },
  'limão': { ncm: '08055000', descricao: 'Limões' },
  'maça': { ncm: '08081000', descricao: 'Maçãs' },
  'maca': { ncm: '08081000', descricao: 'Maçãs' },
  'maçã': { ncm: '08081000', descricao: 'Maçãs' },
  'mamao': { ncm: '08072000', descricao: 'Mamões (papaias)' },
  'mamão': { ncm: '08072000', descricao: 'Mamões (papaias)' },
  'manga': { ncm: '08045010', descricao: 'Mangas' },
  'mandioca': { ncm: '07141000', descricao: 'Mandiocas' },
  'maracuja': { ncm: '08109090', descricao: 'Maracujás' },
  'maracujá': { ncm: '08109090', descricao: 'Maracujás' },
  'melancia': { ncm: '08071100', descricao: 'Melancias' },
  'melao': { ncm: '08071900', descricao: 'Melões' },
  'melão': { ncm: '08071900', descricao: 'Melões' },
  'milho verde': { ncm: '07099200', descricao: 'Milho doce' },
  'milho': { ncm: '07099200', descricao: 'Milho doce' },
  'morango': { ncm: '08101000', descricao: 'Morangos' },
  'nabo': { ncm: '07061000', descricao: 'Nabos' },
  'ovo': { ncm: '04070021', descricao: 'Ovos de galinha' },
  'ovos': { ncm: '04070021', descricao: 'Ovos de galinha' },
  'palmito': { ncm: '07099900', descricao: 'Palmito' },
  'pera': { ncm: '08082000', descricao: 'Peras' },
  'pepino': { ncm: '07070000', descricao: 'Pepinos' },
  'pessego': { ncm: '08092900', descricao: 'Pêssegos' },
  'pêssego': { ncm: '08092900', descricao: 'Pêssegos' },
  'pimentao': { ncm: '07096000', descricao: 'Pimentões' },
  'pimentão': { ncm: '07096000', descricao: 'Pimentões' },
  'pimenta': { ncm: '07096000', descricao: 'Pimentas' },
  'quiabo': { ncm: '07099900', descricao: 'Quiabo' },
  'rabanete': { ncm: '07061000', descricao: 'Rabanetes' },
  'repolho': { ncm: '07049000', descricao: 'Repolhos' },
  'rúcula': { ncm: '07099900', descricao: 'Rúcula' },
  'rucula': { ncm: '07099900', descricao: 'Rúcula' },
  'salsa': { ncm: '07099900', descricao: 'Salsinha' },
  'salsinha': { ncm: '07099900', descricao: 'Salsinha' },
  'tangerina': { ncm: '08052000', descricao: 'Tangerinas' },
  'tomate': { ncm: '07020000', descricao: 'Tomates' },
  'uva': { ncm: '08061000', descricao: 'Uvas' },
  'vagem': { ncm: '07082000', descricao: 'Vagens' },
}

function lookupNcm(nome: string): string {
  const lower = nome.toLowerCase().trim()
  // exact match
  if (NCM_LOOKUP[lower]) return NCM_LOOKUP[lower].ncm
  // partial match
  for (const key of Object.keys(NCM_LOOKUP)) {
    if (lower.includes(key) || key.includes(lower)) return NCM_LOOKUP[key].ncm
  }
  return ''
}

function suggestNcms(nome: string): Array<{ key: string; ncm: string; descricao: string }> {
  const lower = nome.toLowerCase().trim()
  if (lower.length < 2) return []
  return Object.entries(NCM_LOOKUP)
    .filter(([key]) => key.includes(lower) || lower.includes(key))
    .slice(0, 5)
    .map(([key, v]) => ({ key, ...v }))
}

// ---- Produtos Tab ----
function ProdutosTab() {
  const { data: produtos, loading, reload } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [newNome, setNewNome] = useState('')
  const [newUnidade, setNewUnidade] = useState<Unidade>('UN')
  const [newNcm, setNewNcm] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editUnidade, setEditUnidade] = useState<Unidade>('UN')
  const [editNcm, setEditNcm] = useState('')
  const [showEditSuggestions, setShowEditSuggestions] = useState(false)

  const newSuggestions = suggestNcms(newNome)
  const editSuggestions = suggestNcms(editNome)

  const handleAdd = async () => {
    if (!newNome.trim()) return
    const ncmToUse = newNcm.trim() || lookupNcm(newNome)
    await window.electron.invoke(IPC.PRODUTOS_CREATE, { nome: newNome.trim(), unidade: newUnidade })
    // If NCM found, save it right after create
    const created = await window.electron.invoke(IPC.PRODUTOS_LIST) as Produto[]
    const justCreated = created?.find(p => p.nome === newNome.trim())
    if (justCreated && ncmToUse) {
      await window.electron.invoke(IPC.PRODUTOS_UPDATE, { id: justCreated.id, ncm: ncmToUse })
    }
    setNewNome('')
    setNewNcm('')
    reload()
  }

  const startEdit = (p: Produto) => {
    setEditId(p.id)
    setEditNome(p.nome)
    setEditUnidade((UNIDADES.includes(p.unidade as Unidade) ? p.unidade : 'UN') as Unidade)
    setEditNcm(p.ncm ?? '')
    setShowEditSuggestions(false)
  }

  const handleSaveEdit = async (id: number) => {
    await window.electron.invoke(IPC.PRODUTOS_UPDATE, { id, nome: editNome.trim(), unidade: editUnidade, ncm: editNcm.trim() || null })
    setEditId(null)
    reload()
  }

  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      await window.electron.invoke(IPC.PRODUTOS_DELETE, id)
      reload()
    } catch {
      if (confirm(`"${nome}" tem pedidos ou preços vinculados e não pode ser excluído.\n\nDeseja desativá-lo em vez disso? (ficará oculto mas os dados são preservados)`)) {
        await window.electron.invoke(IPC.PRODUTOS_UPDATE, { id, ativo: 0 })
        reload()
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <input
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Nome do produto"
            value={newNome}
            onChange={e => {
              setNewNome(e.target.value)
              const auto = lookupNcm(e.target.value)
              if (auto && !newNcm) setNewNcm(auto)
              setShowSuggestions(true)
            }}
            onKeyDown={e => { if (e.key === 'Enter') { setShowSuggestions(false); handleAdd() } if (e.key === 'Escape') setShowSuggestions(false) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && newSuggestions.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg mt-0.5 text-xs">
              {newSuggestions.map(s => (
                <button
                  key={s.key}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex justify-between"
                  onMouseDown={() => { setNewNcm(s.ncm); setShowSuggestions(false) }}
                >
                  <span className="text-gray-700">{s.key}</span>
                  <span className="text-blue-600 font-mono">{s.ncm}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select className="border rounded px-2 py-1 text-sm" value={newUnidade} onChange={e => setNewUnidade(e.target.value as Unidade)}>
          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm w-32 font-mono"
          placeholder="NCM (auto)"
          value={newNcm}
          onChange={e => setNewNcm(e.target.value)}
          maxLength={10}
        />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>

      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-left text-xs text-gray-600">NOME</th>
                <th className="border px-2 py-2 text-left text-xs text-gray-600 w-28">REDE</th>
                <th className="border px-2 py-2 text-center text-xs text-gray-600 w-20">UNIDADE</th>
                <th className="border px-2 py-2 text-center text-xs text-gray-600 w-28">NCM</th>
                <th className="border px-2 py-2 text-center text-xs text-gray-600 w-32">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {[...(produtos ?? [])].sort((a, b) => {
                const ra = redes?.find(r => r.id === a.rede_id)?.nome ?? ''
                const rb = redes?.find(r => r.id === b.rede_id)?.nome ?? ''
                return ra.localeCompare(rb, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')
              }).map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    {editId === p.id ? (
                      <div className="relative">
                        <input
                          autoFocus
                          className="w-full px-1 py-0.5 text-sm text-slate-800 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={editNome}
                          onChange={e => {
                            setEditNome(e.target.value)
                            setShowEditSuggestions(true)
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') { setShowEditSuggestions(false); handleSaveEdit(p.id) } if (e.key === 'Escape') setEditId(null) }}
                          onBlur={() => setTimeout(() => setShowEditSuggestions(false), 150)}
                        />
                        {showEditSuggestions && editSuggestions.length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg mt-0.5 text-xs">
                            {editSuggestions.map(s => (
                              <button
                                key={s.key}
                                className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex justify-between"
                                onMouseDown={() => { setEditNcm(s.ncm); setShowEditSuggestions(false) }}
                              >
                                <span className="text-gray-700">{s.key}</span>
                                <span className="text-blue-600 font-mono">{s.ncm}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-700">{p.nome}</span>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-sm text-gray-500">
                    {p.rede_id ? (redes?.find(r => r.id === p.rede_id)?.nome ?? String(p.rede_id)) : <span className="italic text-gray-400">Global</span>}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {editId === p.id ? (
                      <select className="border rounded px-1 py-0.5 text-sm" value={editUnidade} onChange={e => setEditUnidade(e.target.value as Unidade)}>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <span className="text-gray-600">{p.unidade}</span>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {editId === p.id ? (
                      <input
                        className="w-full px-1 py-0.5 text-xs font-mono border border-gray-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={editNcm}
                        onChange={e => setEditNcm(e.target.value)}
                        placeholder="00000000"
                        maxLength={10}
                      />
                    ) : (
                      <span className={`font-mono text-xs ${p.ncm ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                        {p.ncm || '—'}
                      </span>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {editId === p.id ? (
                        <>
                          <button onClick={() => handleSaveEdit(p.id)} className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Salvar</button>
                          <button onClick={() => setEditId(null)} className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(p)} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Editar</button>
                          <button onClick={() => handleDelete(p.id, p.nome)} className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Excluir</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Preços Tab ----
function PrecosTab() {
  const { data: precos, reload } = useIpc<Preco[]>(IPC.PRECOS_LIST)
  const { data: produtos } = useIpc<Produto[]>(IPC.PRODUTOS_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [selectedProdId, setSelectedProdId] = useState<number | ''>('')
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [bulkPrice, setBulkPrice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft({})
    setCheckedIds(new Set())
    setBulkPrice('')
  }, [selectedProdId])

  const currentPrices: Record<number, number> = {}
  if (precos && selectedProdId !== '') {
    for (const p of precos) {
      if (p.produto_id === selectedProdId && p.vigencia_fim === null) {
        currentPrices[p.loja_id] = p.preco_venda
      }
    }
  }

  const redeMap = new Map((redes ?? []).map(r => [r.id, r.nome]))
  const activeLojas = lojas?.filter(l => l.ativo) ?? []
  const uniqueProdutos = [...(produtos ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
  const lojaLabel = (l: Loja) => redeMap.has(l.rede_id) ? `${redeMap.get(l.rede_id)} ${l.nome}` : l.nome
  const allChecked = activeLojas.length > 0 && checkedIds.size === activeLojas.length

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(activeLojas.map(l => l.id)))
    }
  }

  const toggleOne = (id: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleApplyToSelected = () => {
    if (!bulkPrice || checkedIds.size === 0) return
    const next = { ...draft }
    for (const id of checkedIds) next[id] = bulkPrice
    setDraft(next)
  }

  const handleSave = async () => {
    if (selectedProdId === '') return
    const entries = Object.entries(draft).filter(([, v]) => v !== '' && !isNaN(Number(v)))
    if (entries.length === 0) return
    setSaving(true)
    try {
      for (const [lojaId, val] of entries) {
        await window.electron.invoke(IPC.PRECOS_UPSERT, {
          produto_id: Number(selectedProdId),
          loja_id: Number(lojaId),
          preco_venda: Number(val),
        })
      }
      setDraft({})
      setCheckedIds(new Set())
      setBulkPrice('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = Object.values(draft).some(v => v !== '')

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Product + save */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 font-medium">Produto:</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={selectedProdId}
          onChange={e => setSelectedProdId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Selecione um produto</option>
          {uniqueProdutos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
        </select>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Preços'}
          </button>
        )}
      </div>

      {selectedProdId === '' ? (
        <p className="text-sm text-gray-400">Selecione um produto para definir os preços por loja.</p>
      ) : (
        <>
          {/* Bulk apply bar */}
          <div className="flex items-center gap-2 bg-gray-50 border rounded px-3 py-2">
            <span className="text-xs text-gray-500">
              {checkedIds.size === 0
                ? 'Selecione lojas na tabela para aplicar um preço em massa'
                : `${checkedIds.size} loja(s) selecionada(s)`}
            </span>
            <input
              className="border rounded px-2 py-1 text-sm w-32 ml-auto"
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço"
              value={bulkPrice}
              onChange={e => setBulkPrice(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleApplyToSelected() }}
              disabled={checkedIds.size === 0}
            />
            <button
              onClick={handleApplyToSelected}
              disabled={checkedIds.size === 0 || !bulkPrice}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Aplicar às selecionadas
            </button>
          </div>

          <div className="overflow-auto flex-1">
            <table className="text-sm border-collapse w-full max-w-lg">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-2 py-2 w-8">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th className="border px-3 py-2 text-left text-xs text-gray-600">LOJA</th>
                  <th className="border px-2 py-2 text-center text-xs text-gray-600 w-32">PREÇO ATUAL</th>
                  <th className="border px-2 py-2 text-center text-xs text-gray-600 w-36">NOVO PREÇO</th>
                </tr>
              </thead>
              <tbody>
                {activeLojas.map(loja => (
                  <tr
                    key={loja.id}
                    className={checkedIds.has(loja.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}
                    onClick={() => toggleOne(loja.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="border px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={checkedIds.has(loja.id)}
                        onChange={() => toggleOne(loja.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="border px-3 py-1 text-gray-700">{lojaLabel(loja)}</td>
                    <td className="border px-2 py-1 text-center text-gray-500">
                      {currentPrices[loja.id] != null
                        ? `R$ ${currentPrices[loja.id].toFixed(2)}`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="border px-1 py-0.5" onClick={e => e.stopPropagation()}>
                      <input
                        className="w-full px-1 py-0.5 text-sm text-center text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={currentPrices[loja.id] != null ? String(currentPrices[loja.id]) : '—'}
                        value={draft[loja.id] ?? ''}
                        onChange={e => setDraft(prev => ({ ...prev, [loja.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">O preço antigo é fechado automaticamente ao salvar.</p>
          </div>
        </>
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  function toggleExpand(produtoId: number) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(produtoId) ? next.delete(produtoId) : next.add(produtoId)
      return next
    })
  }

  function formatMoney(v: number) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatDate(iso: string) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  const handleAdd = async () => {
    if (newProdId === '' || !newCusto) return
    await window.electron.invoke(IPC.CUSTOS_UPSERT, {
      produto_id: Number(newProdId),
      custo_compra: Number(newCusto),
    })
    setNewCusto('')
    reload()
  }

  // Agrupar por produto_id
  const produtosOrdenados = [...(produtos ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
  const custosMap = new Map<number, Custo[]>()
  for (const custo of custos ?? []) {
    const list = custosMap.get(custo.produto_id) ?? []
    list.push(custo)
    custosMap.set(custo.produto_id, list)
  }

  // Produtos que têm ao menos um custo cadastrado
  const produtosComCusto = produtosOrdenados.filter(p => custosMap.has(p.id))

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Formulário de cadastro */}
      <div className="flex gap-2">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={newProdId}
          onChange={e => setNewProdId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Produto</option>
          {produtosOrdenados.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <input
          className="border rounded px-2 py-1 text-sm w-28"
          type="number"
          step="0.01"
          placeholder="Custo"
          value={newCusto}
          onChange={e => setNewCusto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
        >
          Definir Custo
        </button>
      </div>
      <p className="text-xs text-gray-500">
        O custo antigo é fechado automaticamente ao definir um novo custo para o mesmo produto.
      </p>

      {loading ? (
        <div className="text-gray-500">Carregando...</div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-left text-xs text-gray-600 w-8"></th>
                <th className="border px-3 py-2 text-left text-xs text-gray-600">PRODUTO</th>
                <th className="border px-3 py-2 text-right text-xs text-gray-600 w-32">CUSTO VIGENTE</th>
                <th className="border px-3 py-2 text-left text-xs text-gray-600 w-32">DESDE</th>
              </tr>
            </thead>
            <tbody>
              {produtosComCusto.map(prod => {
                const registros = [...(custosMap.get(prod.id) ?? [])].sort(
                  (a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio)
                )
                const vigente = registros.find(c => c.vigencia_fim === null)
                const historico = registros.filter(c => c.vigencia_fim !== null)
                const expanded = expandedIds.has(prod.id)

                return (
                  <Fragment key={prod.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="border px-2 py-2 text-center">
                        {historico.length > 0 && (
                          <button
                            onClick={() => toggleExpand(prod.id)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title={expanded ? 'Recolher histórico' : 'Ver histórico'}
                          >
                            {expanded ? '▼' : '▶'}
                          </button>
                        )}
                      </td>
                      <td className="border px-3 py-2 font-medium text-gray-800">{prod.nome}</td>
                      <td className="border px-3 py-2 text-right font-mono text-gray-800">
                        {vigente ? `R$ ${formatMoney(vigente.custo_compra)}` : <span className="text-gray-400 text-xs">Sem custo</span>}
                      </td>
                      <td className="border px-3 py-2 text-gray-500 text-xs">
                        {vigente ? formatDate(vigente.vigencia_inicio) : '—'}
                      </td>
                    </tr>
                    {expanded && historico.map(h => (
                      <tr key={h.id} className="bg-gray-50 text-xs text-gray-500">
                        <td className="border px-2 py-1"></td>
                        <td className="border px-3 py-1 pl-6 text-gray-400">↳ histórico</td>
                        <td className="border px-3 py-1 text-right font-mono">R$ {formatMoney(h.custo_compra)}</td>
                        <td className="border px-3 py-1">
                          {formatDate(h.vigencia_inicio)} → {h.vigencia_fim ? formatDate(h.vigencia_fim) : '—'}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {produtosComCusto.length === 0 && (
                <tr>
                  <td colSpan={4} className="border px-3 py-4 text-center text-gray-400 text-xs">
                    Nenhum custo cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Franqueados Tab ----
function FranqueadosTab() {
  const { data: franqueados, reload: reloadFranqueados } = useIpc<Franqueado[]>(IPC.FRANQUEADOS_LIST)
  const { data: lojas, reload: reloadLojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const [newNome, setNewNome] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const getRedeName = (rede_id: number) => redes?.find(r => r.id === rede_id)?.nome?.replace(/_/g,' ') ?? ''

  const reload = () => { reloadFranqueados(); reloadLojas() }

  const handleAdd = async () => {
    if (!newNome.trim()) return
    await window.electron.invoke(IPC.FRANQUEADOS_CREATE, { nome: newNome.trim() })
    setNewNome('')
    reload()
  }

  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Excluir franqueado "${nome}"? As lojas serão desvinculadas.`)) return
    await window.electron.invoke(IPC.FRANQUEADOS_DELETE, id)
    reload()
  }

  const handleSaveEdit = async (id: number) => {
    await window.electron.invoke(IPC.FRANQUEADOS_UPDATE, { id, nome: editNome.trim() })
    setEditId(null)
    reload()
  }

  const toggleLoja = async (lojaId: number, franqueadoId: number, isAssigned: boolean) => {
    await window.electron.invoke(IPC.LOJAS_SET_FRANQUEADO, lojaId, isAssigned ? null : franqueadoId)
    reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Nome do franqueado"
          value={newNome}
          onChange={e => setNewNome(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Adicionar
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {(franqueados ?? []).map(f => {
          const fLojas = (lojas ?? []).filter(l => l.franqueado_id === f.id)
          const otherLojas = (lojas ?? []).filter(l => l.franqueado_id !== f.id && l.ativo !== 0)
          const expanded = expandedId === f.id

          return (
            <div key={f.id} className="border rounded bg-white">
              <div className="flex items-center gap-2 px-3 py-2">
                {editId === f.id ? (
                  <>
                    <input className="border rounded px-2 py-0.5 text-sm flex-1" value={editNome} onChange={e => setEditNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(f.id) }} autoFocus />
                    <button onClick={() => handleSaveEdit(f.id)} className="text-green-600 hover:text-green-800 text-xs px-2">Salvar</button>
                    <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 text-xs px-2">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setExpandedId(expanded ? null : f.id)} className="text-gray-400 hover:text-gray-600 text-xs w-4">{expanded ? '▼' : '▶'}</button>
                    <span className="font-medium text-sm flex-1">{f.nome}</span>
                    <span className="text-xs text-gray-400">{fLojas.length} loja{fLojas.length !== 1 ? 's' : ''}</span>
                    <button onClick={() => { setEditId(f.id); setEditNome(f.nome) }} className="text-blue-600 hover:text-blue-800 text-xs px-2">Editar</button>
                    <button onClick={() => handleDelete(f.id, f.nome)} className="text-red-600 hover:text-red-800 text-xs px-2">Excluir</button>
                  </>
                )}
              </div>

              {expanded && (
                <div className="border-t px-3 py-2">
                  <div className="text-xs text-gray-500 mb-2 font-medium">LOJAS VINCULADAS</div>
                  {fLojas.length === 0 && <p className="text-xs text-gray-400 mb-2">Nenhuma loja vinculada.</p>}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {fLojas.map(l => (
                      <label key={l.id} className="flex items-center gap-1 text-sm bg-blue-50 border border-blue-200 rounded px-2 py-0.5 cursor-pointer">
                        <input type="checkbox" checked onChange={() => toggleLoja(l.id, f.id, true)} />
                        <span>{getRedeName(l.rede_id)} {l.nome}</span>
                      </label>
                    ))}
                  </div>
                  {otherLojas.length > 0 && (
                    <>
                      <div className="text-xs text-gray-400 mb-1">Adicionar loja:</div>
                      <div className="flex flex-wrap gap-2">
                        {otherLojas.map(l => (
                          <label key={l.id} className="flex items-center gap-1 text-sm text-gray-500 border rounded px-2 py-0.5 cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" checked={false} onChange={() => toggleLoja(l.id, f.id, false)} />
                            <span>{getRedeName(l.rede_id)} {l.nome}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
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
  { id: 'franqueados', label: 'Franqueados' },
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
        {activeTab === 'franqueados' && <FranqueadosTab />}
      </div>
    </div>
  )
}

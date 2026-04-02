import { useState, useEffect } from 'react'
import { FileText, Settings, History, ChevronRight, Printer, Trash2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'
import type { Rede, Loja, NfeConfig, NfeDraft, NfeItem, NotaFiscalSalva, ProdutoFiscalRow } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import { useIpc } from '../hooks/useIpc'

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function numNf(n: number, serie: string) {
  return `${String(n).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')} — Série ${serie}`
}
const MESES = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ── Configuração Tab ─────────────────────────────────────────────────────────

function ConfigTab() {
  const [config, setConfig] = useState<NfeConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { data: produtosFiscais, reload } = useIpc<ProdutoFiscalRow[]>(IPC.NFE_GET_ALL_PRODUTOS_FISCAL)
  const [editingProd, setEditingProd] = useState<number | null>(null)
  const [prodForm, setProdForm] = useState({ ncm: '', cst_icms: '040', cfop: '5102', unidade_nfe: '' })

  useEffect(() => {
    window.electron.invoke<NfeConfig>(IPC.NFE_CONFIG_GET).then(setConfig)
  }, [])

  const handleSaveConfig = async () => {
    if (!config) return
    setSaving(true)
    await window.electron.invoke(IPC.NFE_CONFIG_SET, config)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleEditProd = (p: ProdutoFiscalRow) => {
    setEditingProd(p.id)
    setProdForm({
      ncm: p.ncm ?? '',
      cst_icms: p.cst_icms ?? '040',
      cfop: p.cfop ?? '5102',
      unidade_nfe: p.unidade_nfe ?? (p.unidade === 'UN' ? 'UNID' : 'KG'),
    })
  }

  const handleSaveProd = async (id: number) => {
    await window.electron.invoke(IPC.NFE_SET_PRODUTO_FISCAL, id, prodForm.ncm, prodForm.cst_icms, prodForm.cfop, prodForm.unidade_nfe)
    setEditingProd(null)
    reload()
  }

  if (!config) return <div className="text-gray-400 text-sm p-4">Carregando...</div>

  const field = (label: string, key: keyof NfeConfig, placeholder = '') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        className="border rounded px-2 py-1.5 text-sm"
        value={config[key] as string}
        placeholder={placeholder}
        onChange={e => setConfig({ ...config, [key]: key === 'numero_atual' ? Number(e.target.value) : e.target.value })}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Emitente */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 mb-4 text-sm">Dados do Emitente</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">{field('Nome / Razão Social', 'nome', 'CARLOS HENRIQUE DE SOUZA ME')}</div>
          {field('CNPJ', 'cnpj', '00.000.000/0001-00')}
          {field('Inscrição Estadual', 'ie', '000000000')}
          <div className="col-span-2">{field('Logradouro', 'logradouro', 'Rua Barao de Sao Domingos')}</div>
          {field('Número', 'numero_end', '268')}
          {field('Complemento', 'complemento', 'Box Nro.15, Setor Amarelo')}
          {field('Bairro', 'bairro', 'Feira Manaus Moderna')}
          {field('Município', 'municipio', 'MANAUS')}
          {field('UF', 'uf', 'AM')}
          {field('CEP', 'cep', '69005-010')}
          {field('Telefone', 'telefone', '')}
        </div>
        <div className="border-t mt-4 pt-4 grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Série NF-e</label>
            <input className="border rounded px-2 py-1.5 text-sm" value={config.serie}
              onChange={e => setConfig({ ...config, serie: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Próximo Número</label>
            <input type="number" className="border rounded px-2 py-1.5 text-sm" value={config.numero_atual}
              onChange={e => setConfig({ ...config, numero_atual: Number(e.target.value) })} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Natureza da Operação</label>
            <input className="border rounded px-2 py-1.5 text-sm" value={config.natureza_operacao}
              onChange={e => setConfig({ ...config, natureza_operacao: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          {saved && <span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle size={14}/>Salvo!</span>}
          <button onClick={handleSaveConfig} disabled={saving}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>

      {/* Dados fiscais dos produtos */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Dados Fiscais dos Produtos</h3>
        <p className="text-xs text-gray-500 mb-3">Configure NCM, CST e CFOP de cada produto para geração correta da NF-e.</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-1.5 text-left">Produto</th>
              <th className="border px-2 py-1.5">Un.</th>
              <th className="border px-2 py-1.5 w-28">NCM/SH</th>
              <th className="border px-2 py-1.5 w-16">CST</th>
              <th className="border px-2 py-1.5 w-16">CFOP</th>
              <th className="border px-2 py-1.5 w-20">Unid. NF-e</th>
              <th className="border px-2 py-1.5 w-20">Ação</th>
            </tr>
          </thead>
          <tbody>
            {produtosFiscais?.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="border px-2 py-1">{p.nome}</td>
                <td className="border px-2 py-1 text-center">{p.unidade}</td>
                {editingProd === p.id ? (
                  <>
                    <td className="border px-1 py-0.5"><input className="w-full border rounded px-1 py-0.5 text-xs" value={prodForm.ncm} onChange={e => setProdForm({...prodForm, ncm: e.target.value})} placeholder="00000000"/></td>
                    <td className="border px-1 py-0.5"><input className="w-full border rounded px-1 py-0.5 text-xs" value={prodForm.cst_icms} onChange={e => setProdForm({...prodForm, cst_icms: e.target.value})} /></td>
                    <td className="border px-1 py-0.5"><input className="w-full border rounded px-1 py-0.5 text-xs" value={prodForm.cfop} onChange={e => setProdForm({...prodForm, cfop: e.target.value})} /></td>
                    <td className="border px-1 py-0.5"><input className="w-full border rounded px-1 py-0.5 text-xs" value={prodForm.unidade_nfe} onChange={e => setProdForm({...prodForm, unidade_nfe: e.target.value})} placeholder="UNID/KG"/></td>
                    <td className="border px-1 py-0.5 text-center">
                      <button onClick={() => handleSaveProd(p.id)} className="text-green-600 hover:text-green-800 font-bold mr-1">✓</button>
                      <button onClick={() => setEditingProd(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border px-2 py-1 text-center font-mono">{p.ncm || <span className="text-red-400">—</span>}</td>
                    <td className="border px-2 py-1 text-center">{p.cst_icms || '040'}</td>
                    <td className="border px-2 py-1 text-center">{p.cfop || '5102'}</td>
                    <td className="border px-2 py-1 text-center">{p.unidade_nfe || (p.unidade === 'UN' ? 'UNID' : 'KG')}</td>
                    <td className="border px-2 py-1 text-center">
                      <button onClick={() => handleEditProd(p)} className="text-blue-500 hover:text-blue-700 text-xs">Editar</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Emitir Tab ───────────────────────────────────────────────────────────────

function EmitirTab() {
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const now = new Date()
  const [redeId, setRedeId] = useState<number | ''>('')
  const [lojaId, setLojaId] = useState<number | ''>('')
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [quinzena, setQuinzena] = useState<1 | 2>(1)
  const [draft, setDraft] = useState<NfeDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lojaFiscal, setLojaFiscal] = useState<Record<string, string>>({})
  const [editingLoja, setEditingLojaState] = useState(false)
  const [savedNfe, setSavedNfe] = useState<NotaFiscalSalva | null>(null)

  const filteredLojas = lojas?.filter(l => !redeId || l.rede_id === Number(redeId)) ?? []

  const handleCarregar = async () => {
    if (!lojaId) { alert('Selecione uma loja'); return }
    setLoading(true)
    setSavedNfe(null)
    try {
      const data = await window.electron.invoke<NfeDraft>(IPC.NFE_GERAR_PREVIEW, Number(lojaId), mes, ano, quinzena as 1 | 2)
      setDraft(data)
      // Load loja fiscal info
      const fiscal = await window.electron.invoke<Record<string, string>>(IPC.NFE_GET_LOJA_FISCAL, Number(lojaId))
      setLojaFiscal((fiscal as any) ?? {})
    } catch(e: any) {
      alert('Erro ao carregar dados: ' + e.message)
    }
    setLoading(false)
  }

  const handleSaveLojaFiscal = async () => {
    if (!lojaId) return
    await window.electron.invoke(IPC.NFE_SET_LOJA_FISCAL, Number(lojaId), lojaFiscal)
    // Reload draft to get updated loja data
    const data = await window.electron.invoke<NfeDraft>(IPC.NFE_GERAR_PREVIEW, Number(lojaId), mes, ano, quinzena as 1 | 2)
    setDraft(data)
    setEditingLojaState(false)
  }

  const handleItemChange = (idx: number, field: keyof NfeItem, value: string | number) => {
    if (!draft) return
    const items = [...draft.items]
    const item = { ...items[idx], [field]: typeof value === 'string' && field !== 'descricao' && field !== 'ncm' && field !== 'cst' && field !== 'cfop' && field !== 'unidade' && field !== 'codigo' ? Number(value) : value }
    if (field === 'quantidade' || field === 'valor_unitario') {
      item.valor_total = Math.round((item.quantidade * item.valor_unitario) * 100) / 100
    }
    items[idx] = item
    const valor_total = Math.round(items.reduce((s, i) => s + i.valor_total, 0) * 100) / 100
    setDraft({ ...draft, items, valor_total })
  }

  const handleGerar = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const saved = await window.electron.invoke<NotaFiscalSalva>(IPC.NFE_SALVAR, draft)
      setSavedNfe(saved)
      setDraft(null)
    } catch(e: any) {
      alert('Erro ao gerar NF-e: ' + e.message)
    }
    setSaving(false)
  }

  const handlePrint = async (id: number) => {
    const html = await window.electron.invoke<string>(IPC.NFE_PRINT_DANFE, id)
    if (html) await window.electron.invoke(IPC.PRINT_HTML, html, `NF-e`)
  }

  // Warnings about incomplete fiscal data
  const warnings: string[] = []
  if (draft) {
    if (!draft.loja_razao_social || draft.loja_razao_social === draft.loja_nome) warnings.push('Razão social da loja não preenchida')
    if (!draft.loja_cnpj) warnings.push('CNPJ da loja não preenchido')
    if (!draft.loja_endereco) warnings.push('Endereço da loja não preenchido')
    draft.items.forEach(i => { if (!i.ncm) warnings.push(`NCM não preenchido para: ${i.descricao}`) })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Selecionar Período</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Rede</label>
            <select className="border rounded px-2 py-1.5 text-sm" value={redeId} onChange={e => { setRedeId(e.target.value === '' ? '' : Number(e.target.value)); setLojaId('') }}>
              <option value="">Todas</option>
              {redes?.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Loja *</label>
            <select className="border rounded px-2 py-1.5 text-sm" value={lojaId} onChange={e => setLojaId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Selecione</option>
              {filteredLojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Mês</label>
            <select className="border rounded px-2 py-1.5 text-sm" value={mes} onChange={e => setMes(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Ano</label>
            <input type="number" className="border rounded px-2 py-1.5 text-sm w-20" value={ano} onChange={e => setAno(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Quinzena</label>
            <select className="border rounded px-2 py-1.5 text-sm" value={quinzena} onChange={e => setQuinzena(Number(e.target.value) as 1|2)}>
              <option value={1}>1ª (1–15)</option>
              <option value={2}>2ª (16–fim)</option>
            </select>
          </div>
          <button onClick={handleCarregar} disabled={loading}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <><RefreshCw size={13} className="animate-spin"/>Carregando...</> : <>Carregar Dados<ChevronRight size={14}/></>}
          </button>
        </div>
      </div>

      {/* Success state */}
      {savedNfe && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600"/>
            <div>
              <div className="font-semibold text-green-800">NF-e gerada com sucesso!</div>
              <div className="text-sm text-green-700">Nº {numNf(savedNfe.numero, savedNfe.serie)} — {savedNfe.loja_nome} — R$ {fmtMoney(savedNfe.valor_total)}</div>
            </div>
          </div>
          <button onClick={() => handlePrint(savedNfe.id)}
            className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">
            <Printer size={14}/> Imprimir DANFE
          </button>
        </div>
      )}

      {/* Draft Preview */}
      {draft && (
        <>
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-1"><AlertCircle size={15}/>Dados incompletos — preencha antes de gerar:</div>
              <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Loja fiscal data */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-700 text-sm">Destinatário — {draft.loja_nome}</h3>
              <button onClick={() => setEditingLojaState(!editingLoja)}
                className="text-xs text-blue-500 hover:text-blue-700">{editingLoja ? 'Cancelar' : 'Editar'}</button>
            </div>
            {editingLoja ? (
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Razão Social', 'razao_social'],['CNPJ', 'cnpj'],['IE', 'ie'],
                  ['Endereço', 'endereco'],['Bairro', 'bairro'],['CEP', 'cep'],
                  ['Município', 'municipio'],['UF', 'uf'],['Telefone', 'telefone'],
                ].map(([label, key]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">{label}</label>
                    <input className="border rounded px-2 py-1 text-xs"
                      value={(lojaFiscal as any)[key] ?? ''}
                      onChange={e => setLojaFiscal({ ...lojaFiscal, [key]: e.target.value })}/>
                  </div>
                ))}
                <div className="col-span-2 flex justify-end">
                  <button onClick={handleSaveLojaFiscal} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Salvar</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs text-gray-600">
                <div><span className="text-gray-400">Razão Social:</span> {draft.loja_razao_social || <span className="text-red-400">—</span>}</div>
                <div><span className="text-gray-400">CNPJ:</span> {draft.loja_cnpj || <span className="text-red-400">—</span>}</div>
                <div><span className="text-gray-400">IE:</span> {draft.loja_ie || '—'}</div>
                <div><span className="text-gray-400">Endereço:</span> {draft.loja_endereco || <span className="text-red-400">—</span>}</div>
                <div><span className="text-gray-400">Bairro:</span> {draft.loja_bairro || '—'}</div>
                <div><span className="text-gray-400">CEP:</span> {draft.loja_cep || '—'}</div>
                <div><span className="text-gray-400">Município:</span> {draft.loja_municipio}</div>
                <div><span className="text-gray-400">UF:</span> {draft.loja_uf}</div>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">
              Produtos — {MESES[draft.mes]}/{draft.ano} {draft.quinzena === 1 ? '1ª Quinzena' : '2ª Quinzena'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-2 py-1.5 text-left">Descrição</th>
                    <th className="border px-2 py-1.5 w-28">NCM/SH</th>
                    <th className="border px-2 py-1.5 w-14">CST</th>
                    <th className="border px-2 py-1.5 w-14">CFOP</th>
                    <th className="border px-2 py-1.5 w-16">Unid.</th>
                    <th className="border px-2 py-1.5 w-20">Quantidade</th>
                    <th className="border px-2 py-1.5 w-20">Vlr. Unit.</th>
                    <th className="border px-2 py-1.5 w-22">Vlr. Total</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                      <td className="border px-2 py-1 font-medium">{item.descricao}</td>
                      <td className="border px-1 py-0.5">
                        <input className={`w-full border rounded px-1 py-0.5 text-xs font-mono ${!item.ncm ? 'border-red-300 bg-red-50' : ''}`}
                          value={item.ncm} onChange={e => handleItemChange(idx, 'ncm', e.target.value)} placeholder="00000000"/>
                      </td>
                      <td className="border px-1 py-0.5">
                        <input className="w-full border rounded px-1 py-0.5 text-xs text-center" value={item.cst} onChange={e => handleItemChange(idx, 'cst', e.target.value)}/>
                      </td>
                      <td className="border px-1 py-0.5">
                        <input className="w-full border rounded px-1 py-0.5 text-xs text-center" value={item.cfop} onChange={e => handleItemChange(idx, 'cfop', e.target.value)}/>
                      </td>
                      <td className="border px-1 py-0.5">
                        <input className="w-full border rounded px-1 py-0.5 text-xs text-center" value={item.unidade} onChange={e => handleItemChange(idx, 'unidade', e.target.value)}/>
                      </td>
                      <td className="border px-1 py-0.5">
                        <input type="number" className="w-full border rounded px-1 py-0.5 text-xs text-right"
                          value={item.quantidade} onChange={e => handleItemChange(idx, 'quantidade', e.target.value)}/>
                      </td>
                      <td className="border px-1 py-0.5">
                        <input type="number" className="w-full border rounded px-1 py-0.5 text-xs text-right"
                          value={item.valor_unitario} onChange={e => handleItemChange(idx, 'valor_unitario', e.target.value)}/>
                      </td>
                      <td className="border px-2 py-1 text-right font-medium">R$ {fmtMoney(item.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                    <td colSpan={7} className="border px-2 py-1.5 text-right">TOTAL DA NOTA</td>
                    <td className="border px-2 py-1.5 text-right text-green-700">R$ {fmtMoney(draft.valor_total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Generate button */}
          <div className="flex justify-end">
            <button onClick={handleGerar} disabled={saving}
              className="bg-green-600 text-white px-6 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 font-medium flex items-center gap-2">
              <FileText size={15}/>
              {saving ? 'Gerando...' : 'Confirmar e Gerar NF-e'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Histórico Tab ─────────────────────────────────────────────────────────────

function HistoricoTab() {
  const [notas, setNotas] = useState<NotaFiscalSalva[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await window.electron.invoke<NotaFiscalSalva[]>(IPC.NFE_LIST)
    setNotas(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handlePrint = async (id: number) => {
    const html = await window.electron.invoke<string>(IPC.NFE_PRINT_DANFE, id)
    if (html) await window.electron.invoke(IPC.PRINT_HTML, html, 'NF-e DANFE')
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir esta NF-e?')) return
    await window.electron.invoke(IPC.NFE_DELETE, id)
    load()
  }

  const statusBadge = (s: string) => {
    if (s === 'autorizada') return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Autorizada</span>
    if (s === 'cancelada') return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Cancelada</span>
    return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Rascunho</span>
  }

  if (loading) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {notas.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Nenhuma NF-e emitida ainda.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Nº / Série</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Loja</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Período</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Emissão</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">Total</th>
              <th className="px-4 py-2.5 text-center font-medium text-gray-600">Status</th>
              <th className="px-4 py-2.5 text-center font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {notas.map(n => (
              <tr key={n.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs">{numNf(n.numero, n.serie)}</td>
                <td className="px-4 py-2.5">{n.loja_nome}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{MESES[n.mes]}/{n.ano} — {n.quinzena === 1 ? '1ª Quinzena' : '2ª Quinzena'}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{n.data_emissao.split('-').reverse().join('/')}</td>
                <td className="px-4 py-2.5 text-right font-medium text-green-700">R$ {fmtMoney(n.valor_total)}</td>
                <td className="px-4 py-2.5 text-center">{statusBadge(n.status)}</td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => handlePrint(n.id)} title="Imprimir DANFE"
                      className="text-gray-500 hover:text-blue-600"><Printer size={15}/></button>
                    <button onClick={() => handleDelete(n.id)} title="Excluir"
                      className="text-gray-400 hover:text-red-600"><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'emitir' | 'historico' | 'config'

export function NotaFiscal() {
  const [tab, setTab] = useState<Tab>('emitir')

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'emitir', label: 'Emitir NF-e', icon: <FileText size={15}/> },
    { id: 'historico', label: 'Histórico', icon: <History size={15}/> },
    { id: 'config', label: 'Configuração', icon: <Settings size={15}/> },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-800">Nota Fiscal</h1>
        <p className="text-sm text-gray-500 mt-0.5">Emissão de NF-e baseada nos pedidos da quinzena</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'emitir' && <EmitirTab />}
        {tab === 'historico' && <HistoricoTab />}
        {tab === 'config' && <ConfigTab />}
      </div>
    </div>
  )
}

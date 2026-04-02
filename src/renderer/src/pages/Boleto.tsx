import { useState, useEffect } from 'react'
import { IPC } from '../../../shared/ipc-channels'
import type { Banco, BoletoDraft, BoletoSalvo, BoletoSacado, Loja, Rede } from '../../../shared/types'
import { useIpc } from '../hooks/useIpc'

type Tab = 'emitir' | 'historico' | 'bancos'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(s: string) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function today() {
  return new Date().toISOString().slice(0, 10)
}
function addDays(date: string, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── EmitirTab ───────────────────────────────────────────────────────────────

function EmitirTab({ bancos }: { bancos: Banco[] }) {
  const { data: lojas } = useIpc<Loja[]>(IPC.LOJAS_LIST)
  const { data: redes } = useIpc<Rede[]>(IPC.REDES_LIST)

  const emptyS: BoletoSacado = { nome: '', cpf_cnpj: '', endereco: '', cidade: '', uf: '', cep: '' }
  const [bancoId, setBancoId] = useState<number | ''>(bancos[0]?.id ?? '')
  const [lojaId, setLojaId] = useState<number | ''>('')
  const [sacado, setSacado] = useState<BoletoSacado>(emptyS)
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(addDays(today(), 3))
  const [descricao, setDescricao] = useState('')
  const [numDoc, setNumDoc] = useState('')
  const [juros, setJuros] = useState('')
  const [multa, setMulta] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BoletoSalvo | null>(null)
  const [error, setError] = useState('')

  // Auto-fill sacado from loja
  useEffect(() => {
    if (!lojaId || !lojas) return
    const l = lojas.find(x => x.id === lojaId)
    if (!l) return
    setSacado({
      nome: l.razao_social ?? l.nome ?? '',
      cpf_cnpj: l.cnpj ?? '',
      endereco: l.endereco ?? '',
      cidade: l.municipio ?? '',
      uf: l.uf ?? '',
      cep: l.cep ?? '',
    })
  }, [lojaId, lojas])

  const handleEmitir = async () => {
    if (!bancoId) { setError('Selecione um banco'); return }
    if (!sacado.nome || !sacado.cpf_cnpj) { setError('Informe nome e CPF/CNPJ do sacado'); return }
    if (!valor || isNaN(parseFloat(valor))) { setError('Informe o valor'); return }

    setLoading(true)
    setError('')
    setResult(null)
    try {
      const draft: BoletoDraft = {
        banco_id: bancoId as number,
        sacado,
        valor: parseFloat(valor.replace(',', '.')),
        vencimento,
        descricao,
        numero_documento: (numDoc || Date.now().toString().slice(-15)).substring(0, 15),
        loja_id: lojaId || undefined,
        juros_mensal: juros ? parseFloat(juros.replace(',', '.')) : undefined,
        dias_multa: multa ? parseFloat(multa.replace(',', '.')) : undefined,
      }
      const res = await window.electron.invoke(IPC.BOLETOS_EMITIR, draft) as BoletoSalvo
      setResult(res)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao emitir boleto')
    } finally {
      setLoading(false)
    }
  }

  const activeBancos = bancos.filter(b => b.ativo)
  if (activeBancos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500 space-y-2">
          <p className="text-sm">Nenhum banco cadastrado.</p>
          <p className="text-xs">Vá até a aba <strong>Bancos</strong> para cadastrar um banco e configurar as credenciais.</p>
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="max-w-xl mx-auto space-y-4 py-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-1">✓ Boleto emitido com sucesso!</h3>
          <p className="text-sm text-green-700">Para: {result.sacado_nome} — {fmtMoeda(result.valor)}</p>
          <p className="text-sm text-green-700">Vencimento: {fmtData(result.vencimento)}</p>
          {result.linha_digitavel && (
            <div className="mt-2 p-2 bg-white rounded border text-xs font-mono break-all text-gray-700">
              {result.linha_digitavel}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {result.pdf_path && (
            <button
              onClick={() => window.electron.invoke(IPC.BOLETOS_PDF, result.id)}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Imprimir / Abrir PDF
            </button>
          )}
          <button
            onClick={() => { setResult(null); setValor(''); setSacado(emptyS); setDescricao(''); setNumDoc('') }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
          >
            Novo Boleto
          </button>
        </div>
      </div>
    )
  }

  const setSacadoField = (k: keyof BoletoSacado, v: string) => setSacado(prev => ({ ...prev, [k]: v }))

  return (
    <div className="max-w-2xl space-y-4 py-2">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Banco */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Banco *</label>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={bancoId}
            onChange={e => setBancoId(Number(e.target.value))}
          >
            {activeBancos.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </div>

        {/* Loja (opcional) */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Loja (opcional)</label>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm text-gray-700"
            value={lojaId}
            onChange={e => setLojaId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">— Nenhuma —</option>
            {(lojas ?? []).map(l => {
              const rede = redes?.find(r => r.id === l.rede_id)
              return <option key={l.id} value={l.id}>{rede?.nome ? `${rede.nome} / ` : ''}{l.nome}</option>
            })}
          </select>
        </div>
      </div>

      {/* Sacado */}
      <fieldset className="border border-gray-200 rounded-lg p-3 space-y-2">
        <legend className="text-xs font-semibold text-gray-500 px-1">Dados do Sacado (Pagador)</legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Nome / Razão Social *</label>
            <input className="w-full border rounded px-2 py-1 text-sm" value={sacado.nome} onChange={e => setSacadoField('nome', e.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">CPF / CNPJ *</label>
            <input className="w-full border rounded px-2 py-1 text-sm" value={sacado.cpf_cnpj} onChange={e => setSacadoField('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-0.5">Endereço</label>
            <input className="w-full border rounded px-2 py-1 text-sm" value={sacado.endereco} onChange={e => setSacadoField('endereco', e.target.value)} placeholder="Rua, número, complemento" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Cidade</label>
            <input className="w-full border rounded px-2 py-1 text-sm" value={sacado.cidade} onChange={e => setSacadoField('cidade', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">UF</label>
              <input className="w-full border rounded px-2 py-1 text-sm uppercase" value={sacado.uf} onChange={e => setSacadoField('uf', e.target.value.toUpperCase())} maxLength={2} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">CEP</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={sacado.cep} onChange={e => setSacadoField('cep', e.target.value)} placeholder="00000-000" />
            </div>
          </div>
        </div>
      </fieldset>

      {/* Cobrança */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$) *</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Vencimento *</label>
          <input
            type="date"
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={vencimento}
            onChange={e => setVencimento(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nº Documento</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={numDoc}
            onChange={e => setNumDoc(e.target.value)}
            placeholder="Ex: NF-0001"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Descrição / Mensagem</label>
        <input
          className="w-full border rounded px-2 py-1.5 text-sm"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Referente a..."
          maxLength={77}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Juros ao mês (%)</label>
          <input className="w-full border rounded px-2 py-1.5 text-sm" value={juros} onChange={e => setJuros(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Multa (%)</label>
          <input className="w-full border rounded px-2 py-1.5 text-sm" value={multa} onChange={e => setMulta(e.target.value)} placeholder="0,00" />
        </div>
      </div>

      <button
        onClick={handleEmitir}
        disabled={loading}
        className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Emitindo...' : 'Emitir Boleto'}
      </button>
    </div>
  )
}

// ─── HistoricoTab ────────────────────────────────────────────────────────────

function HistoricoTab() {
  const [statusFiltro, setStatusFiltro] = useState<string>('')
  const [boletos, setBoletos] = useState<BoletoSalvo[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await window.electron.invoke(IPC.BOLETOS_LIST, statusFiltro ? { status: statusFiltro } : undefined) as BoletoSalvo[]
      setBoletos(res ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFiltro])

  const STATUS_COLORS: Record<string, string> = {
    emitido: 'bg-blue-100 text-blue-700',
    pago: 'bg-green-100 text-green-700',
    cancelado: 'bg-gray-100 text-gray-500',
    vencido: 'bg-red-100 text-red-700',
  }

  const handleCancelar = async (id: number) => {
    if (!confirm('Cancelar este boleto no banco? Esta ação não pode ser desfeita.')) return
    try {
      await window.electron.invoke(IPC.BOLETOS_CANCELAR, id)
      load()
    } catch (e: any) {
      alert(`Erro ao cancelar: ${e?.message ?? e}`)
    }
  }

  const handleConsultar = async (id: number) => {
    try {
      const res = await window.electron.invoke(IPC.BOLETOS_CONSULTAR, id) as { status: string; situacao?: string }
      load()
      alert(`Status Inter: ${res.situacao ?? res.status}`)
    } catch (e: any) {
      alert(`Erro: ${e?.message ?? e}`)
    }
  }

  // Consulta o Inter para todos os boletos "emitido" e atualiza o status local
  const handleSincronizarTodos = async () => {
    // Load all emitido boletos (ignores current filter)
    const todos = await window.electron.invoke(IPC.BOLETOS_LIST, { status: 'emitido' }) as BoletoSalvo[]
    if (!todos || todos.length === 0) { alert('Nenhum boleto emitido para sincronizar.'); return }
    setSyncing(true)
    setSyncProgress({ done: 0, total: todos.length })
    let atualizados = 0
    for (let i = 0; i < todos.length; i++) {
      try {
        await window.electron.invoke(IPC.BOLETOS_CONSULTAR, todos[i].id)
        atualizados++
      } catch { /* ignora erros individuais */ }
      setSyncProgress({ done: i + 1, total: todos.length })
      await new Promise(r => setTimeout(r, 200))
    }
    setSyncing(false)
    setSyncProgress(null)
    load()
    alert(`Sincronização concluída! ${atualizados} de ${todos.length} boletos consultados.`)
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-2 items-center flex-wrap">
        <select className="border rounded px-2 py-1 text-sm" value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="emitido">Emitido</option>
          <option value="pago">Pago</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button onClick={load} disabled={syncing} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 text-gray-600 disabled:opacity-40">↻ Atualizar lista</button>
        <button
          onClick={handleSincronizarTodos}
          disabled={syncing || loading}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5"
          title="Consulta o status de todos os boletos emitidos no banco Inter"
        >
          {syncing
            ? <>⏳ Sincronizando {syncProgress?.done}/{syncProgress?.total}...</>
            : <>🔄 Sincronizar status com Inter</>
          }
        </button>
      </div>
      {loading ? <div className="text-gray-500 text-sm">Carregando...</div> : (
        <div className="overflow-auto flex-1">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                <th className="border px-3 py-2 text-left">SACADO</th>
                <th className="border px-2 py-2 text-left">BANCO</th>
                <th className="border px-2 py-2 text-right">VALOR</th>
                <th className="border px-2 py-2 text-center">VENCTO</th>
                <th className="border px-2 py-2 text-center">STATUS</th>
                <th className="border px-2 py-2 text-center w-36">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {boletos.length === 0 && (
                <tr><td colSpan={6} className="border px-3 py-6 text-center text-gray-400 text-sm">Nenhum boleto encontrado.</td></tr>
              )}
              {boletos.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-1.5">
                    <div className="font-medium text-gray-800">{b.sacado_nome}</div>
                    <div className="text-xs text-gray-400">{b.sacado_cpf_cnpj}</div>
                  </td>
                  <td className="border px-2 py-1.5 text-gray-600">{b.banco_nome}</td>
                  <td className="border px-2 py-1.5 text-right font-mono text-gray-800">{fmtMoeda(b.valor)}</td>
                  <td className="border px-2 py-1.5 text-center text-gray-600">{fmtData(b.vencimento)}</td>
                  <td className="border px-2 py-1.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="border px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => window.electron.invoke(IPC.BOLETOS_PDF, b.id)}
                        className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                        title="Abrir PDF"
                      >PDF</button>
                      <button
                        onClick={() => handleConsultar(b.id)}
                        className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        title="Consultar status no banco"
                      >↻</button>
                      {b.status === 'emitido' && (
                        <button
                          onClick={() => handleCancelar(b.id)}
                          className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                        >Cancelar</button>
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

// ─── BancosTab ───────────────────────────────────────────────────────────────

function BancosTab({ onBancosChange }: { onBancosChange: () => void }) {
  const [bancos, setBancos] = useState<Banco[]>([])
  const [editId, setEditId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<Partial<Banco>>({})
  const [configBancoId, setConfigBancoId] = useState<number | null>(null)
  const [interForm, setInterForm] = useState<Partial<{
    client_id: string; client_secret: string; cert_path: string; key_path: string
    conta: string; agencia: string; ambiente: string
  }>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const res = await window.electron.invoke(IPC.BANCOS_LIST) as Banco[]
      setBancos(res ?? [])
    } catch (e: any) {
      setMsg(`Erro ao carregar bancos: ${e?.message ?? e}`)
    }
  }

  useEffect(() => { load() }, [])

  const startNew = () => {
    setMsg('')
    setEditId('new')
    setForm({ nome: '', codigo: '', provedor: 'manual', ativo: 1 })
  }

  const startEdit = (b: Banco) => {
    setMsg('')
    setEditId(b.id)
    setForm({ ...b })
  }

  const handleSave = async () => {
    if (!form.nome?.trim()) return
    setMsg('')
    setSaving(true)
    try {
      if (editId === 'new') {
        await window.electron.invoke(IPC.BANCOS_CREATE, form)
      } else {
        await window.electron.invoke(IPC.BANCOS_UPDATE, { ...form, id: editId })
      }
      setEditId(null)
      await load()
      onBancosChange()
    } catch (e: any) {
      setMsg(`Erro ao salvar: ${e?.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remover este banco?')) return
    try {
      await window.electron.invoke(IPC.BANCOS_DELETE, id)
      await load()
      onBancosChange()
    } catch (e: any) {
      setMsg(`Erro ao excluir: ${e?.message ?? e}`)
    }
  }

  const openInterConfig = async (b: Banco) => {
    setConfigBancoId(b.id)
    const cfg = await window.electron.invoke(IPC.INTER_CONFIG_GET, b.id) as any
    setInterForm(cfg ?? {
      client_id: '', client_secret: '', cert_path: '', key_path: '',
      conta: b.conta ?? '', agencia: b.agencia ?? '', ambiente: 'producao',
    })
    setMsg('')
  }

  const saveInterConfig = async () => {
    if (!configBancoId) return
    setSaving(true)
    try {
      await window.electron.invoke(IPC.INTER_CONFIG_SET, configBancoId, {
        client_id: interForm.client_id ?? '',
        client_secret: interForm.client_secret ?? '',
        cert_path: interForm.cert_path ?? '',
        key_path: interForm.key_path ?? '',
        conta: interForm.conta ?? '',
        agencia: interForm.agencia ?? '',
        ambiente: interForm.ambiente ?? 'producao',
      })
      setMsg('Configuração salva!')
      await load()
    } catch (e: any) {
      setMsg(`Erro: ${e?.message}`)
    } finally {
      setSaving(false)
    }
  }

  const setIF = (k: string, v: string) => setInterForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2 items-center">
        <button onClick={startNew} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          + Adicionar Banco
        </button>
      </div>
      {msg && !configBancoId && (
        <div className={`px-3 py-2 rounded text-sm ${msg.startsWith('Erro') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      {/* New / Edit form */}
      {editId !== null && (
        <div className="bg-gray-50 border rounded-lg p-4 space-y-3 max-w-lg">
          <h4 className="text-sm font-semibold text-gray-700">{editId === 'new' ? 'Novo banco' : 'Editar banco'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Nome *</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={form.nome ?? ''} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Banco Inter" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Código bancário</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={form.codigo ?? ''} onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))} placeholder="077" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Provedor</label>
              <select className="w-full border rounded px-2 py-1 text-sm" value={form.provedor ?? 'manual'} onChange={e => setForm(p => ({ ...p, provedor: e.target.value }))}>
                <option value="manual">Manual (sem API)</option>
                <option value="inter">Banco Inter (API)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Conta corrente</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={form.conta ?? ''} onChange={e => setForm(p => ({ ...p, conta: e.target.value }))} placeholder="0000000-0" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Cancelar</button>
          </div>
        </div>
      )}

      {/* Bancos list */}
      <div className="overflow-auto flex-1">
        <table className="text-sm border-collapse w-full max-w-2xl">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-600">
              <th className="border px-3 py-2 text-left">BANCO</th>
              <th className="border px-2 py-2 text-center w-16">CÓD</th>
              <th className="border px-2 py-2 text-left w-28">PROVEDOR</th>
              <th className="border px-2 py-2 text-left w-32">CONTA</th>
              <th className="border px-2 py-2 text-center w-44">AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {bancos.length === 0 && (
              <tr><td colSpan={5} className="border px-3 py-6 text-center text-gray-400">Nenhum banco cadastrado.</td></tr>
            )}
            {bancos.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="border px-3 py-1.5 font-medium text-gray-800">{b.nome}</td>
                <td className="border px-2 py-1.5 text-center text-gray-500 font-mono">{b.codigo || '—'}</td>
                <td className="border px-2 py-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.provedor === 'inter' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {b.provedor === 'inter' ? 'Inter API' : 'Manual'}
                  </span>
                </td>
                <td className="border px-2 py-1.5 text-gray-500 font-mono text-xs">{b.conta || '—'}</td>
                <td className="border px-2 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {b.provedor === 'inter' && (
                      <button
                        onClick={() => openInterConfig(b)}
                        className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100"
                      >Configurar API</button>
                    )}
                    <button onClick={() => startEdit(b)} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Editar</button>
                    <button onClick={() => handleDelete(b.id)} className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inter API config modal */}
      {configBancoId !== null && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <h3 className="text-base font-semibold text-gray-800">Configuração API Banco Inter</h3>
            <p className="text-xs text-gray-500">
              Acesse <strong>developers.inter.co</strong> → Soluções para sua empresa → criar integração → baixar certificado (.crt e .key) e copiar Client ID / Secret.
            </p>

            {msg && <div className={`px-3 py-2 rounded text-sm ${msg.startsWith('Erro') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Client ID</label>
                <input className="w-full border rounded px-2 py-1 text-sm font-mono" value={interForm.client_id ?? ''} onChange={e => setIF('client_id', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Client Secret</label>
                <input type="password" className="w-full border rounded px-2 py-1 text-sm font-mono" value={interForm.client_secret ?? ''} onChange={e => setIF('client_secret', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Conta Corrente</label>
                <input className="w-full border rounded px-2 py-1 text-sm" value={interForm.conta ?? ''} onChange={e => setIF('conta', e.target.value)} placeholder="0000000-0" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Agência</label>
                <input className="w-full border rounded px-2 py-1 text-sm" value={interForm.agencia ?? ''} onChange={e => setIF('agencia', e.target.value)} placeholder="0001" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-0.5">Certificado (.crt)</label>
                <div className="flex gap-2">
                  <input className="flex-1 border rounded px-2 py-1 text-sm font-mono text-xs" value={interForm.cert_path ?? ''} onChange={e => setIF('cert_path', e.target.value)} placeholder="/Users/voce/inter/certificate.crt" />
                  <button
                    type="button"
                    onClick={async () => {
                      const path = await window.electron.invoke(IPC.PICK_FILE, [{ name: 'Certificado', extensions: ['crt', 'pem'] }]) as string | null
                      if (path) setIF('cert_path', path)
                    }}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 whitespace-nowrap"
                  >Escolher</button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-0.5">Chave Privada (.key)</label>
                <div className="flex gap-2">
                  <input className="flex-1 border rounded px-2 py-1 text-sm font-mono text-xs" value={interForm.key_path ?? ''} onChange={e => setIF('key_path', e.target.value)} placeholder="/Users/voce/inter/certificate.key" />
                  <button
                    type="button"
                    onClick={async () => {
                      const path = await window.electron.invoke(IPC.PICK_FILE, [{ name: 'Chave Privada', extensions: ['key', 'pem'] }]) as string | null
                      if (path) setIF('key_path', path)
                    }}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 whitespace-nowrap rounded hover:bg-gray-200"
                  >Escolher</button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Ambiente</label>
                <select className="w-full border rounded px-2 py-1 text-sm" value={interForm.ambiente ?? 'producao'} onChange={e => setIF('ambiente', e.target.value)}>
                  <option value="producao">Produção</option>
                  <option value="sandbox">Sandbox (teste)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={saveInterConfig} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar Configuração'}
              </button>
              <button onClick={() => setConfigBancoId(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function Boleto() {
  const [activeTab, setActiveTab] = useState<Tab>('emitir')
  const [bancos, setBancos] = useState<Banco[]>([])

  const loadBancos = async () => {
    const res = await window.electron.invoke(IPC.BANCOS_LIST) as Banco[]
    setBancos(res ?? [])
  }

  useEffect(() => { loadBancos() }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'emitir', label: 'Emitir Boleto' },
    { id: 'historico', label: 'Histórico' },
    { id: 'bancos', label: 'Bancos' },
  ]

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Boleto Bancário</h1>
        <p className="text-sm text-slate-500 mt-0.5">Emissão e controle de boletos via API Banco Inter</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              activeTab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-emerald-700 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'emitir' && <EmitirTab bancos={bancos.filter(b => b.ativo)} />}
        {activeTab === 'historico' && <HistoricoTab />}
        {activeTab === 'bancos' && <BancosTab onBancosChange={loadBancos} />}
      </div>
    </div>
  )
}

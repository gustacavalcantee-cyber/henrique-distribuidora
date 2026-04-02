// src/renderer/src/pages/Lote.tsx
// Emissão em Lote — boletos e NF-e para todas as franquias de uma quinzena

import { useState, useEffect } from 'react'
import { IPC } from '../../../shared/ipc-channels'
import type { LoteItem, LoteResultItem, Banco, BoletoDraft, NfeDraft, BoletoSalvo, NotaFiscalSalva, NfeConfig } from '../../../shared/types'
import { useIpc } from '../hooks/useIpc'

// ── Helpers ────────────────────────────────────────────────────────────────

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function today() { return new Date().toISOString().slice(0, 10) }
function addDays(d: string, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10)
}
function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function calcFinal(total: number, descPct: number) {
  return total * (1 - Math.max(0, Math.min(100, descPct)) / 100)
}
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

// Group items by franqueado
function groupByFranquia(items: LoteItem[]): { key: string; nome: string; franqueado_id: number | null; lojas: LoteItem[] }[] {
  const map = new Map<string, { nome: string; franqueado_id: number | null; lojas: LoteItem[] }>()
  for (const item of items) {
    const key = item.franqueado_id != null ? String(item.franqueado_id) : '__sem_franquia__'
    if (!map.has(key)) map.set(key, { nome: item.franqueado_nome ?? '— Sem Franquia —', franqueado_id: item.franqueado_id, lojas: [] })
    map.get(key)!.lojas.push(item)
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
}

// ── Histórico ──────────────────────────────────────────────────────────────

function HistoricoSection() {
  const [tab, setTab] = useState<'boletos' | 'nfes'>('boletos')
  const [search, setSearch] = useState('')
  const [printing, setPrinting] = useState<number | null>(null)

  const { data: boletos, loading: loadingB } = useIpc<BoletoSalvo[]>(IPC.BOLETOS_LIST)
  const { data: nfes, loading: loadingN } = useIpc<NotaFiscalSalva[]>(IPC.NFE_LIST)

  const q = search.trim().toLowerCase()

  const filteredBoletos = (boletos ?? []).filter(b =>
    !q || b.sacado_nome.toLowerCase().includes(q)
  ).sort((a, b) => b.id - a.id)

  const filteredNfes = (nfes ?? []).filter(n =>
    !q || n.loja_nome.toLowerCase().includes(q)
  ).sort((a, b) => b.id - a.id)

  const handlePrintBoleto = async (id: number) => {
    setPrinting(id)
    try {
      await window.electron.invoke(IPC.BOLETOS_PDF, id)
    } catch (e: any) {
      alert('Erro ao abrir PDF: ' + (e?.message ?? e))
    } finally {
      setPrinting(null)
    }
  }

  const handlePrintNfe = async (id: number) => {
    setPrinting(id)
    try {
      await window.electron.invoke(IPC.NFE_PRINT_DANFE, id)
    } catch (e: any) {
      alert('Erro ao imprimir NF-e: ' + (e?.message ?? e))
    } finally {
      setPrinting(null)
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      emitido: 'bg-blue-100 text-blue-700',
      pago: 'bg-green-100 text-green-700',
      cancelado: 'bg-gray-100 text-gray-500',
      vencido: 'bg-red-100 text-red-700',
      rascunho: 'bg-yellow-100 text-yellow-700',
    }
    return map[status] ?? 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-700">Histórico</span>
        <div className="flex rounded border overflow-hidden text-xs">
          <button
            onClick={() => setTab('boletos')}
            className={`px-3 py-1.5 font-medium transition-colors ${tab === 'boletos' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Boletos
          </button>
          <button
            onClick={() => setTab('nfes')}
            className={`px-3 py-1.5 font-medium transition-colors ${tab === 'nfes' ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            NF-e
          </button>
        </div>
        <input
          className="border rounded px-2 py-1 text-sm ml-auto w-48"
          placeholder="Buscar por loja..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {tab === 'boletos' && (
        <div className="max-h-72 overflow-auto">
          {loadingB ? (
            <div className="py-6 text-center text-sm text-gray-400">Carregando...</div>
          ) : filteredBoletos.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">Nenhum boleto encontrado.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b sticky top-0">
                  <th className="px-3 py-2 text-left">SACADO</th>
                  <th className="px-3 py-2 text-center w-24">VENCIMENTO</th>
                  <th className="px-3 py-2 text-right w-28">VALOR</th>
                  <th className="px-3 py-2 text-center w-20">STATUS</th>
                  <th className="px-3 py-2 text-center w-24">AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoletos.map(b => (
                  <tr key={b.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{b.sacado_nome}</div>
                      {b.sacado_cpf_cnpj && <div className="text-xs text-gray-400 font-mono">{b.sacado_cpf_cnpj}</div>}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{fmtDate(b.vencimento)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtMoeda(b.valor)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(b.status)}`}>{b.status}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handlePrintBoleto(b.id)}
                        disabled={printing === b.id}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
                      >
                        {printing === b.id ? '...' : '📄 PDF'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'nfes' && (
        <div className="max-h-72 overflow-auto">
          {loadingN ? (
            <div className="py-6 text-center text-sm text-gray-400">Carregando...</div>
          ) : filteredNfes.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">Nenhuma NF-e encontrada.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b sticky top-0">
                  <th className="px-3 py-2 text-left">LOJA</th>
                  <th className="px-3 py-2 text-center w-32">PERÍODO</th>
                  <th className="px-3 py-2 text-right w-28">VALOR</th>
                  <th className="px-3 py-2 text-center w-20">STATUS</th>
                  <th className="px-3 py-2 text-center w-24">AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {filteredNfes.map(n => (
                  <tr key={n.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{n.loja_nome}</div>
                      <div className="text-xs text-gray-400">Nº {n.numero} · Série {n.serie}</div>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">
                      {n.quinzena}ª Qnz · {MESES[n.mes]?.slice(0, 3)}/{n.ano}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtMoeda(n.valor_total)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(n.status)}`}>{n.status}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handlePrintNfe(n.id)}
                        disabled={printing === n.id}
                        className="text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded hover:bg-teal-100 disabled:opacity-50"
                      >
                        {printing === n.id ? '...' : '🖨️ DANFE'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function Lote() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [quinzena, setQuinzena] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2)

  const [items, setItems] = useState<LoteItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [discounts, setDiscounts] = useState<Record<number, string>>({})
  const [globalDiscount, setGlobalDiscount] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  // Collapsed franquia groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const { data: bancos } = useIpc<Banco[]>(IPC.BANCOS_LIST)
  const [bancoId, setBancoId] = useState<number | ''>('')
  const [vencimento, setVencimento] = useState(addDays(today(), 3))

  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<LoteResultItem[]>([])
  const [printingId, setPrintingId] = useState<number | null>(null)

  // NF-e number control (mirrors NfeConfig.numero_atual)
  const [nfeConfig, setNfeConfigState] = useState<NfeConfig | null>(null)
  const [nfeNumero, setNfeNumero] = useState<string>('')

  useEffect(() => {
    window.electron.invoke(IPC.NFE_CONFIG_GET).then((raw: unknown) => { const cfg = raw as NfeConfig;
      if (cfg) {
        setNfeConfigState(cfg)
        setNfeNumero(String(cfg.numero_atual))
      }
    }).catch(() => {})
  }, [])

  const handleNfeNumeroBlur = async () => {
    const n = parseInt(nfeNumero, 10)
    if (!nfeConfig || isNaN(n) || n < 1) return
    const updated = { ...nfeConfig, numero_atual: n }
    try {
      await window.electron.invoke(IPC.NFE_CONFIG_SET, updated)
      setNfeConfigState(updated)
    } catch { /* ignore */ }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const getDesc = (id: number) => parseFloat(discounts[id] ?? '0') || 0
  const getFinal = (item: LoteItem) => calcFinal(item.total_venda, getDesc(item.loja_id))

  const selectedItems = items.filter(i => selected.has(i.loja_id))
  const totalFinal = selectedItems.reduce((s, i) => s + getFinal(i), 0)
  const groups = groupByFranquia(items)

  // ── Seleção ────────────────────────────────────────────────────────────────

  const toggleItem = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const isGroupSelected = (lojas: LoteItem[]) => lojas.every(l => selected.has(l.loja_id))
  const isGroupPartial = (lojas: LoteItem[]) => !isGroupSelected(lojas) && lojas.some(l => selected.has(l.loja_id))

  const toggleGroup = (lojas: LoteItem[]) => {
    const allSelected = isGroupSelected(lojas)
    setSelected(prev => {
      const s = new Set(prev)
      lojas.forEach(l => allSelected ? s.delete(l.loja_id) : s.add(l.loja_id))
      return s
    })
  }

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.loja_id)))
  }

  const toggleGroupCollapse = (key: string) =>
    setCollapsedGroups(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })

  // ── Desconto ───────────────────────────────────────────────────────────────

  const setDiscount = (id: number, val: string) =>
    setDiscounts(prev => ({ ...prev, [id]: val }))

  const applyGlobalDiscount = () => {
    const newD: Record<number, string> = {}
    items.forEach(i => { newD[i.loja_id] = globalDiscount })
    setDiscounts(newD)
  }

  // ── Carregar ───────────────────────────────────────────────────────────────

  const handleCarregar = async () => {
    setLoading(true)
    setResults([])
    try {
      const data = await window.electron.invoke(IPC.LOTE_GET_QUINZENA, mes, ano, quinzena) as LoteItem[]
      setItems(data)
      setSelected(new Set(data.map(i => i.loja_id)))
      setDiscounts({})
      setCollapsedGroups(new Set())
      setLoaded(true)
    } catch (e: any) {
      alert('Erro ao carregar: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  // ── Emitir Boletos ─────────────────────────────────────────────────────────

  const handleEmitirBoletos = async () => {
    if (!bancoId) { alert('Selecione um banco para os boletos'); return }
    if (selectedItems.length === 0) { alert('Nenhuma franquia selecionada'); return }
    setProcessing(true)
    setResults([])
    for (const item of selectedItems) {
      const valor = getFinal(item)
      const draft: BoletoDraft = {
        banco_id: bancoId as number,
        valor,
        vencimento,
        numero_documento: Date.now().toString().slice(-15),
        descricao: `Quinzena ${quinzena === 1 ? '1ª' : '2ª'} - ${MESES[mes]}/${ano}`,
        loja_id: item.loja_id,
        sacado: {
          nome: item.razao_social ?? item.loja_nome,
          cpf_cnpj: item.cnpj ?? '',
          endereco: item.endereco ?? '',
          cidade: item.municipio ?? '',
          uf: item.uf ?? '',
          cep: item.cep ?? '',
        },
      }
      try {
        const saved = await window.electron.invoke(IPC.BOLETOS_EMITIR, draft) as BoletoSalvo
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'boleto', status: 'ok', boleto_id: saved.id }])
      } catch (e: any) {
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'boleto', status: 'erro', mensagem: e?.message ?? String(e) }])
      }
      await new Promise(res => setTimeout(res, 300))
    }
    setProcessing(false)
  }

  // ── Gerar NF-e ─────────────────────────────────────────────────────────────

  const handleGerarNfes = async () => {
    if (selectedItems.length === 0) { alert('Nenhuma franquia selecionada'); return }
    setProcessing(true)
    setResults([])
    for (const item of selectedItems) {
      try {
        const draft = await window.electron.invoke(IPC.NFE_GERAR_PREVIEW, item.loja_id, mes, ano, quinzena) as NfeDraft
        const desc = getDesc(item.loja_id)
        const factor = 1 - desc / 100
        const adjustedDraft: NfeDraft = {
          ...draft,
          valor_total: Math.round(draft.valor_total * factor * 100) / 100,
          items: draft.items.map(it => ({
            ...it,
            valor_unitario: Math.round(it.valor_unitario * factor * 100) / 100,
            valor_total: Math.round(it.valor_total * factor * 100) / 100,
          })),
        }
        const saved = await window.electron.invoke(IPC.NFE_SALVAR, adjustedDraft) as NotaFiscalSalva
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'nfe', status: 'ok', nfe_id: saved?.id }])
      } catch (e: any) {
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'nfe', status: 'erro', mensagem: e?.message ?? String(e) }])
      }
    }
    setProcessing(false)
    // Refresh displayed NF-e number (it was auto-incremented for each note saved)
    window.electron.invoke(IPC.NFE_CONFIG_GET).then((raw: unknown) => { const cfg = raw as NfeConfig;
      if (cfg) { setNfeConfigState(cfg); setNfeNumero(String(cfg.numero_atual)) }
    }).catch(() => {})
  }

  // ── Emitir Tudo ────────────────────────────────────────────────────────────

  const handleEmitirTudo = async () => {
    if (!bancoId) { alert('Selecione um banco para os boletos'); return }
    if (selectedItems.length === 0) { alert('Nenhuma franquia selecionada'); return }
    setProcessing(true)
    setResults([])
    for (const item of selectedItems) {
      const valor = getFinal(item)
      const draft: BoletoDraft = {
        banco_id: bancoId as number,
        valor,
        vencimento,
        numero_documento: Date.now().toString().slice(-15),
        descricao: `Quinzena ${quinzena === 1 ? '1ª' : '2ª'} - ${MESES[mes]}/${ano}`,
        loja_id: item.loja_id,
        sacado: {
          nome: item.razao_social ?? item.loja_nome,
          cpf_cnpj: item.cnpj ?? '',
          endereco: item.endereco ?? '',
          cidade: item.municipio ?? '',
          uf: item.uf ?? '',
          cep: item.cep ?? '',
        },
      }
      try {
        const saved = await window.electron.invoke(IPC.BOLETOS_EMITIR, draft) as BoletoSalvo
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'boleto', status: 'ok', boleto_id: saved.id }])
      } catch (e: any) {
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'boleto', status: 'erro', mensagem: e?.message ?? String(e) }])
      }
      await new Promise(res => setTimeout(res, 300))
      try {
        const nfeDraft = await window.electron.invoke(IPC.NFE_GERAR_PREVIEW, item.loja_id, mes, ano, quinzena) as NfeDraft
        const desc = getDesc(item.loja_id)
        const factor = 1 - desc / 100
        const adjustedDraft: NfeDraft = {
          ...nfeDraft,
          valor_total: Math.round(nfeDraft.valor_total * factor * 100) / 100,
          items: nfeDraft.items.map(it => ({
            ...it,
            valor_unitario: Math.round(it.valor_unitario * factor * 100) / 100,
            valor_total: Math.round(it.valor_total * factor * 100) / 100,
          })),
        }
        const savedNfe = await window.electron.invoke(IPC.NFE_SALVAR, adjustedDraft) as NotaFiscalSalva
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'nfe', status: 'ok', nfe_id: savedNfe?.id }])
      } catch (e: any) {
        setResults(r => [...r, { loja_id: item.loja_id, loja_nome: item.loja_nome, tipo: 'nfe', status: 'erro', mensagem: e?.message ?? String(e) }])
      }
    }
    setProcessing(false)
    // Refresh displayed NF-e number
    window.electron.invoke(IPC.NFE_CONFIG_GET).then((raw: unknown) => { const cfg = raw as NfeConfig;
      if (cfg) { setNfeConfigState(cfg); setNfeNumero(String(cfg.numero_atual)) }
    }).catch(() => {})
  }

  // ── Print handlers ─────────────────────────────────────────────────────────

  const handlePrintBoleto = async (boleto_id: number) => {
    setPrintingId(boleto_id)
    try {
      await window.electron.invoke(IPC.BOLETOS_PDF, boleto_id)
    } catch (e: any) {
      alert('Erro ao abrir PDF: ' + (e?.message ?? e))
    } finally {
      setPrintingId(null)
    }
  }

  const handlePrintNfe = async (nfe_id: number) => {
    setPrintingId(nfe_id)
    try {
      await window.electron.invoke(IPC.NFE_PRINT_DANFE, nfe_id)
    } catch (e: any) {
      alert('Erro ao imprimir NF-e: ' + (e?.message ?? e))
    } finally {
      setPrintingId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeBancos = (bancos ?? []).filter(b => b.ativo)
  const okCount = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'erro').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-800">Emissão em Lote</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gere boletos e NF-e para todas as franquias de uma quinzena</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* ── Período ── */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Período</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Mês</label>
              <select className="border rounded px-2 py-1.5 text-sm" value={mes} onChange={e => setMes(Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                  <option key={m} value={m}>{MESES[m]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Ano</label>
              <input type="number" className="border rounded px-2 py-1.5 text-sm w-20" value={ano}
                onChange={e => setAno(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Quinzena</label>
              <select className="border rounded px-2 py-1.5 text-sm" value={quinzena}
                onChange={e => setQuinzena(Number(e.target.value) as 1|2)}>
                <option value={1}>1ª Quinzena (1–15)</option>
                <option value={2}>2ª Quinzena (16–fim)</option>
              </select>
            </div>
            <button
              onClick={handleCarregar}
              disabled={loading}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Carregando...' : 'Carregar'}
            </button>
          </div>
        </div>

        {loaded && items.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            Nenhuma franquia com pedidos neste período.
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* ── Configurações ── */}
            <div className="bg-white border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Configurações de Emissão</h2>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Banco (Boleto)</label>
                  <select className="border rounded px-2 py-1.5 text-sm min-w-40"
                    value={bancoId} onChange={e => setBancoId(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Selecione</option>
                    {activeBancos.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Vencimento</label>
                  <input type="date" className="border rounded px-2 py-1.5 text-sm"
                    value={vencimento} onChange={e => setVencimento(e.target.value)} />
                </div>
                {nfeConfig && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">
                      Próximo Nº NF-e
                      <span className="ml-1 text-gray-400">(auto-incrementa)</span>
                    </label>
                    <input
                      type="number" min="1" step="1"
                      className="border rounded px-2 py-1.5 text-sm w-28"
                      value={nfeNumero}
                      onChange={e => setNfeNumero(e.target.value)}
                      onBlur={handleNfeNumeroBlur}
                      title="Número da próxima NF-e a ser gerada. Incrementa automaticamente a cada emissão."
                    />
                  </div>
                )}
                <div className="h-px w-px flex-1" />
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Desconto global (%)</label>
                    <input type="number" min="0" max="100" step="0.1"
                      className="border rounded px-2 py-1.5 text-sm w-28"
                      placeholder="0"
                      value={globalDiscount}
                      onChange={e => setGlobalDiscount(e.target.value)} />
                  </div>
                  <button onClick={applyGlobalDiscount}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 whitespace-nowrap">
                    Aplicar a todos
                  </button>
                </div>
              </div>
            </div>

            {/* ── Tabela de franquias ── */}
            <div className="bg-white border rounded-lg overflow-hidden">
              {/* Header da tabela */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-gray-50">
                <input type="checkbox"
                  checked={selected.size === items.length && items.length > 0}
                  ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < items.length }}
                  onChange={toggleAll}
                  className="w-4 h-4 cursor-pointer" />
                <span className="text-sm font-medium text-gray-700">
                  {selected.size} de {items.length} selecionadas
                </span>
                <span className="ml-auto text-sm font-semibold text-emerald-700">
                  Total: {fmtMoeda(totalFinal)}
                </span>
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left">FRANQUIA / LOJA</th>
                    <th className="px-3 py-2 text-right w-32">VALOR BRUTO</th>
                    <th className="px-3 py-2 text-center w-28">DESCONTO %</th>
                    <th className="px-3 py-2 text-right w-36">VALOR FINAL</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => {
                    const collapsed = collapsedGroups.has(group.key)
                    return (
                      <>
                        {/* Linha da franquia */}
                        <tr key={`g-${group.key}`} className="bg-slate-50 border-b">
                          <td className="px-3 py-2">
                            <input type="checkbox"
                              checked={isGroupSelected(group.lojas)}
                              ref={el => { if (el) el.indeterminate = isGroupPartial(group.lojas) }}
                              onChange={() => toggleGroup(group.lojas)}
                              className="w-4 h-4 cursor-pointer" />
                          </td>
                          <td className="px-3 py-2 font-semibold text-gray-700" colSpan={4}>
                            <div className="flex items-center gap-2">
                              {/* Collapse toggle */}
                              <button
                                onClick={() => toggleGroupCollapse(group.key)}
                                className="text-gray-400 hover:text-gray-600 transition-transform w-4 h-4 flex items-center justify-center shrink-0"
                                title={collapsed ? 'Expandir' : 'Minimizar'}
                              >
                                <svg className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <span>{group.nome}</span>
                              <span className="text-xs font-normal text-gray-400">
                                ({group.lojas.length} {group.lojas.length === 1 ? 'loja' : 'lojas'})
                              </span>
                            </div>
                          </td>
                        </tr>
                        {/* Linhas das lojas — ocultadas quando collapsed */}
                        {!collapsed && group.lojas.map(item => {
                          const isSelected = selected.has(item.loja_id)
                          const desc = getDesc(item.loja_id)
                          const final = getFinal(item)
                          return (
                            <tr key={item.loja_id}
                              className={`border-b transition-colors ${isSelected ? 'hover:bg-emerald-50/40' : 'opacity-50 bg-gray-50/50'}`}>
                              <td className="px-3 py-2 pl-7">
                                <input type="checkbox" checked={isSelected}
                                  onChange={() => toggleItem(item.loja_id)}
                                  className="w-4 h-4 cursor-pointer" />
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-800">{item.loja_nome}</div>
                                {item.cnpj && <div className="text-xs text-gray-400 font-mono">{item.cnpj}</div>}
                                {!item.cnpj && <div className="text-xs text-amber-500">⚠ CNPJ não cadastrado</div>}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-gray-600">
                                {fmtMoeda(item.total_venda)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number" min="0" max="100" step="0.1"
                                    className="border rounded px-1.5 py-1 text-xs w-16 text-center"
                                    value={discounts[item.loja_id] ?? ''}
                                    placeholder="0"
                                    onChange={e => setDiscount(item.loja_id, e.target.value)}
                                  />
                                  <span className="text-xs text-gray-400">%</span>
                                </div>
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold ${desc > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                                {fmtMoeda(final)}
                                {desc > 0 && (
                                  <div className="text-xs font-normal text-emerald-500">-{desc}%</div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Botões de ação ── */}
            <div className="flex gap-3 flex-wrap items-center">
              <button
                onClick={handleEmitirBoletos}
                disabled={processing || selected.size === 0}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? '⏳' : '📄'} Emitir Boletos ({selected.size})
              </button>
              <button
                onClick={handleGerarNfes}
                disabled={processing || selected.size === 0}
                className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? '⏳' : '📋'} Gerar NF-e ({selected.size})
              </button>
              <button
                onClick={handleEmitirTudo}
                disabled={processing || selected.size === 0}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? '⏳ Processando...' : '🚀 Emitir Tudo (Boleto + NF-e)'}
              </button>
              {processing && (
                <span className="text-sm text-gray-500 animate-pulse">
                  Processando {results.length}/{selected.size * (results.some(r => r.tipo === 'nfe') ? 2 : 1)}...
                </span>
              )}
            </div>

            {/* ── Resultados ── */}
            {results.length > 0 && (
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">Resultados</span>
                  {okCount > 0 && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{okCount} ✓ sucesso</span>}
                  {errCount > 0 && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{errCount} ✗ erro</span>}
                </div>
                <div className="divide-y max-h-72 overflow-auto">
                  {results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${r.status === 'ok' ? '' : 'bg-red-50'}`}>
                      <span className={r.status === 'ok' ? 'text-green-600' : 'text-red-500'}>
                        {r.status === 'ok' ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{r.loja_nome}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${r.tipo === 'boleto' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
                            {r.tipo === 'boleto' ? 'Boleto' : 'NF-e'}
                          </span>
                        </div>
                        {r.mensagem && <div className="text-xs text-red-600 mt-0.5 truncate">{r.mensagem}</div>}
                      </div>
                      {/* Print button — only for successful emissions */}
                      {r.status === 'ok' && r.tipo === 'boleto' && r.boleto_id != null && (
                        <button
                          onClick={() => handlePrintBoleto(r.boleto_id!)}
                          disabled={printingId === r.boleto_id}
                          className="shrink-0 text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 border border-blue-200"
                        >
                          {printingId === r.boleto_id ? '...' : '📄 Imprimir'}
                        </button>
                      )}
                      {r.status === 'ok' && r.tipo === 'nfe' && r.nfe_id != null && (
                        <button
                          onClick={() => handlePrintNfe(r.nfe_id!)}
                          disabled={printingId === r.nfe_id}
                          className="shrink-0 text-xs px-2.5 py-1 bg-teal-50 text-teal-700 rounded hover:bg-teal-100 disabled:opacity-50 border border-teal-200"
                        >
                          {printingId === r.nfe_id ? '...' : '🖨️ DANFE'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Histórico ── */}
        <HistoricoSection />

      </div>
    </div>
  )
}

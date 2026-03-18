import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ShoppingCart, TrendingUp, Wallet, Percent } from 'lucide-react'
import type { Pedido, FinanceiroSummary } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  gradient: string
}

function StatCard({ label, value, sub, icon: Icon, gradient }: StatCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-2">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
          {sub && <p className="text-xs text-white/60 mt-1">{sub}</p>}
        </div>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white/20 shadow-lg">
          <Icon size={20} className="text-white" />
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
    </div>
  )
}

export function Dashboard() {
  const [pedidosHoje, setPedidosHoje] = useState<Pedido[]>([])
  const [financeiro, setFinanceiro] = useState<FinanceiroSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    Promise.all([
      window.electron.invoke<Pedido[]>(IPC.PEDIDOS_LIST, { data_inicio: today, data_fim: today }),
      window.electron.invoke<FinanceiroSummary>(IPC.RELATORIO_FINANCEIRO, mes, ano),
    ]).then(([pedidos, fin]) => {
      setPedidosHoje(pedidos)
      setFinanceiro(fin)
      setLoading(false)
    }).catch((err: Error) => {
      setError(err.message)
      setLoading(false)
    })
  }, [])

  const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const formatDate = (iso: string) => { const [,m,d] = iso.split('-'); return `${d}/${m}` }
  const nomeMes = now.toLocaleDateString('pt-BR', { month: 'long' })

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          {formatDate(today)} — {nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} {ano}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-mono">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
          Carregando...
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-5">
            <StatCard
              label="Pedidos Hoje"
              value={String(pedidosHoje.length)}
              sub="entregas realizadas"
              icon={ShoppingCart}
              gradient="bg-gradient-to-br from-slate-700 to-slate-900"
            />
            <StatCard
              label="Receita do Mês"
              value={formatMoney(financeiro?.receita_bruta ?? 0)}
              sub={nomeMes}
              icon={TrendingUp}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-700"
            />
            <StatCard
              label="Margem Bruta"
              value={`${(financeiro?.margem_bruta ?? 0).toFixed(1)}%`}
              sub="sobre receita"
              icon={Percent}
              gradient="bg-gradient-to-br from-blue-500 to-blue-700"
            />
            <StatCard
              label="Lucro Líquido"
              value={`${(financeiro?.lucro_liquido ?? 0).toFixed(1)}%`}
              sub="após despesas"
              icon={Wallet}
              gradient="bg-gradient-to-br from-violet-500 to-violet-700"
            />
          </div>

          <div className="grid grid-cols-3 gap-5">
            {/* Top lojas */}
            {financeiro && financeiro.top_lojas.length > 0 && (
              <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h3 className="font-semibold text-slate-700 mb-5">
                  Top 5 Lojas —{' '}
                  <span className="text-emerald-600">{String(mes).padStart(2,'0')}/{ano}</span>
                </h3>
                <div className="space-y-4">
                  {financeiro.top_lojas.map((loja, i) => {
                    const maxReceita = financeiro.top_lojas[0].receita
                    const pct = maxReceita > 0 ? (loja.receita / maxReceita) * 100 : 0
                    const colors = ['bg-emerald-500','bg-teal-500','bg-blue-500','bg-orange-400','bg-slate-300']
                    return (
                      <div key={i} className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-300 w-4">{i+1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-slate-700 truncate">{loja.loja_nome}</span>
                            <span className="text-sm font-semibold text-slate-600 ml-4 shrink-0">
                              {formatMoney(loja.receita)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${colors[i]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pedidos hoje */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                Hoje
                <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                  {pedidosHoje.length}
                </span>
              </h3>
              {pedidosHoje.length === 0 ? (
                <p className="text-slate-400 text-sm">Nenhum pedido ainda.</p>
              ) : (
                <div className="space-y-2">
                  {pedidosHoje.slice(0, 6).map(p => (
                    <div key={p.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-mono text-xs text-slate-500">{p.numero_oc}</span>
                      <span className="text-xs text-slate-400">Loja {p.loja_id}</span>
                    </div>
                  ))}
                  {pedidosHoje.length > 6 && (
                    <p className="text-xs text-slate-400 pt-1">+{pedidosHoje.length - 6} mais</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

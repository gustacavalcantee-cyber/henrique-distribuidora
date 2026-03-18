import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ShoppingCart, TrendingUp, Wallet, Store } from 'lucide-react'
import type { Pedido, FinanceiroSummary } from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className={`border rounded-lg p-4 flex items-center gap-4 ${colorMap[color]}`}>
      <Icon size={32} className="opacity-70" />
      <div>
        <div className="text-xs opacity-70 uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
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

  const formatMoney = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  const formatDate = (iso: string) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}` }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm">{formatDate(today)}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700 font-mono">{error}</div>
      )}

      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Pedidos Hoje"
              value={String(pedidosHoje.length)}
              icon={ShoppingCart}
              color="blue"
            />
            <StatCard
              label="Receita do Mês"
              value={`R$ ${formatMoney(financeiro?.receita_bruta ?? 0)}`}
              icon={TrendingUp}
              color="green"
            />
            <StatCard
              label="Margem Bruta"
              value={`${(financeiro?.margem_bruta ?? 0).toFixed(1)}%`}
              icon={Wallet}
              color="orange"
            />
            <StatCard
              label="Lucro Líquido"
              value={`${(financeiro?.lucro_liquido ?? 0).toFixed(1)}%`}
              icon={Store}
              color="purple"
            />
          </div>

          {/* Top 5 lojas */}
          {financeiro && financeiro.top_lojas.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Top 5 Lojas — {String(mes).padStart(2,'0')}/{ano}</h3>
              <div className="space-y-2">
                {financeiro.top_lojas.map((loja, i) => {
                  const maxReceita = financeiro.top_lojas[0].receita
                  const pct = maxReceita > 0 ? (loja.receita / maxReceita) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-sm text-gray-600 w-32 truncate">{loja.loja_nome}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-sm font-medium text-gray-700 w-28 text-right">
                        R$ {formatMoney(loja.receita)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent orders today */}
          {pedidosHoje.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Pedidos de Hoje ({pedidosHoje.length})</h3>
              <div className="text-sm text-gray-500">
                {pedidosHoje.slice(0, 5).map(p => (
                  <div key={p.id} className="flex gap-4 py-1 border-b last:border-0">
                    <span className="font-mono">{p.numero_oc}</span>
                    <span>Loja {p.loja_id}</span>
                  </div>
                ))}
                {pedidosHoje.length > 5 && (
                  <div className="text-gray-400 mt-1">... e mais {pedidosHoje.length - 5} pedidos</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

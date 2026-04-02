import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, History, BarChart2, Wallet, Settings, RefreshCw, RotateCcw, FileText, Landmark } from 'lucide-react'
import logoImg from '../assets/logo.png'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/lancamentos', icon: ClipboardList, label: 'Lançamentos' },
  { to: '/historico', icon: History, label: 'Histórico' },
  { to: '/relatorios', icon: BarChart2, label: 'Relatórios' },
  { to: '/despesas', icon: Wallet, label: 'Despesas' },
  { to: '/nota-fiscal', icon: FileText, label: 'Nota Fiscal' },
  { to: '/boleto', icon: Landmark, label: 'Boleto' },
  { to: '/cadastros', icon: Settings, label: 'Cadastros' },
  { to: '/atualizacao', icon: RefreshCw, label: 'Atualização' },
]

export function Sidebar() {
  const [confirm, setConfirm] = useState(false)
  const appVersion = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ ?? '—'

  function handleReload() {
    if (!confirm) { setConfirm(true); return }
    setConfirm(false)
    window.location.reload()
  }

  return (
    <aside className="w-56 min-h-screen bg-white text-slate-700 flex flex-col shadow-[1px_0_0_0_#e2e8f0]">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 flex justify-center">
        <img
          src={logoImg}
          alt="Henrique Hortifruti"
          className="w-36 h-auto object-contain"
        />
      </div>

      <div className="mx-4 h-px bg-slate-100" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={17}
                  className={isActive ? 'text-emerald-600' : 'text-slate-400'}
                />
                {label}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-100 space-y-2">
        <button
          onClick={handleReload}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            confirm
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <RotateCcw size={13} />
          {confirm ? 'Confirmar recarga?' : 'Recarregar dados'}
        </button>
        {confirm && (
          <button
            onClick={() => setConfirm(false)}
            className="w-full text-xs text-slate-300 hover:text-slate-500 text-center"
          >
            Cancelar
          </button>
        )}
        <p className="text-xs text-slate-300 text-center">v{appVersion}</p>
      </div>
    </aside>
  )
}

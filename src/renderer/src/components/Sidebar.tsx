import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, History, BarChart2, Wallet, Settings } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/lancamentos', icon: ClipboardList, label: 'Lançamentos' },
  { to: '/historico', icon: History, label: 'Histórico' },
  { to: '/relatorios', icon: BarChart2, label: 'Relatórios' },
  { to: '/despesas', icon: Wallet, label: 'Despesas' },
  { to: '/cadastros', icon: Settings, label: 'Cadastros' },
]

export function Sidebar() {
  return (
    <aside className="w-52 min-h-screen bg-gray-800 text-white flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold">Henrique</h1>
        <p className="text-xs text-gray-400">Distribuidor</p>
      </div>
      <nav className="flex-1 py-4">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white font-medium'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

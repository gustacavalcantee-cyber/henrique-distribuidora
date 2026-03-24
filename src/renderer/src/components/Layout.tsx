import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SyncIndicator } from './SyncIndicator'

export function Layout() {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto p-8">
        <Outlet />
      </main>
      <SyncIndicator />
    </div>
  )
}

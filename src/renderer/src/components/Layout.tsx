import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SyncIndicator } from './SyncIndicator'

export function Layout() {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top bar: white area, holds sync indicator on the right */}
        <div className="shrink-0 flex justify-end items-center px-8 pt-7 pb-0 bg-slate-50">
          <SyncIndicator />
        </div>
        <main className="flex-1 overflow-auto px-8 pb-8 pt-3">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

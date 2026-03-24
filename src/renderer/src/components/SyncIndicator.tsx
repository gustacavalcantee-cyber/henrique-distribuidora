import { useState, useEffect } from 'react'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { IPC } from '../../../shared/ipc-channels'

export function SyncIndicator() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => setHasUpdate(true))
  }, [])

  async function handleSync() {
    if (hasUpdate) {
      window.location.reload()
      return
    }
    // Manual sync: reload to pull latest from Supabase
    setSyncing(true)
    await new Promise(r => setTimeout(r, 500))
    window.location.reload()
  }

  if (hasUpdate) {
    return (
      <button
        onClick={handleSync}
        className="fixed top-3 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-amber-300 text-amber-600 text-xs font-medium shadow-sm hover:bg-amber-50 transition-colors"
        title="Clique para carregar os dados atualizados"
      >
        <RefreshCw size={12} className="shrink-0" />
        Atualizar dados
      </button>
    )
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="fixed top-3 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-emerald-300 text-emerald-600 text-xs font-medium shadow-sm hover:bg-emerald-50 transition-colors disabled:opacity-60"
      title="Clique para sincronizar agora"
    >
      <CheckCircle2 size={12} className="shrink-0" />
      {syncing ? 'Sincronizando...' : 'Sincronizado'}
    </button>
  )
}

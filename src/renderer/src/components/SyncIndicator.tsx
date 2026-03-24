import { useState, useEffect } from 'react'
import { Cloud, CloudDownload } from 'lucide-react'
import { IPC } from '../../../shared/ipc-channels'

export function SyncIndicator() {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => setHasUpdate(true))
  }, [])

  if (!hasUpdate) {
    return (
      <div
        className="fixed top-3 right-4 z-50 flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-300 select-none"
        title="Sincronizado"
      >
        <Cloud size={13} />
        <span className="text-xs">Sincronizado</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed top-3 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 text-white text-xs font-medium shadow-md hover:bg-emerald-600 transition-colors"
      title="Clique para carregar os dados atualizados"
    >
      <CloudDownload size={13} className="shrink-0" />
      Atualizar dados
    </button>
  )
}

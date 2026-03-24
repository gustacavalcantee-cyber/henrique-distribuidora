import { useState, useEffect } from 'react'
import { Cloud, CloudDownload, Check } from 'lucide-react'
import { IPC } from '../../../shared/ipc-channels'

export function SyncIndicator() {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => setHasUpdate(true))
  }, [])

  if (hasUpdate) {
    return (
      <button
        onClick={() => window.location.reload()}
        className="fixed top-3 right-4 z-50 p-1.5 rounded-md bg-white shadow-sm border border-orange-200 hover:bg-orange-50 transition-colors"
        title="Dados atualizados — clique para recarregar"
      >
        <CloudDownload size={18} className="text-orange-500" />
      </button>
    )
  }

  return (
    <div
      className="fixed top-3 right-4 z-50 p-1.5 rounded-md bg-white shadow-sm border border-emerald-200"
      title="Sincronizado"
    >
      <div className="relative">
        <Cloud size={18} className="text-emerald-500" />
        <Check
          size={9}
          strokeWidth={3}
          className="absolute bottom-0 right-0 text-emerald-600"
        />
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { Cloud, CloudDownload, Check } from 'lucide-react'
import { IPC } from '../../../shared/ipc-channels'

export function SyncIndicator() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => {
      // Debounce: collapse rapid back-to-back events into one state change
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setHasUpdate(true), 300)
    })
  }, [])

  if (hasUpdate) {
    return (
      <button
        onClick={() => window.location.reload()}
        className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-orange-200 shadow-sm hover:bg-orange-50 transition-colors cursor-pointer"
        title="Dados atualizados — clique para recarregar"
      >
        <CloudDownload size={17} className="text-orange-500" />
      </button>
    )
  }

  return (
    <button
      onClick={() => window.location.reload()}
      className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-emerald-200 shadow-sm hover:bg-emerald-50 transition-colors cursor-pointer"
      title="Sincronizado — clique para recarregar"
    >
      <div className="relative w-[17px] h-[17px]">
        <Cloud size={17} className="text-emerald-500" />
        <Check
          size={8}
          strokeWidth={3.5}
          className="absolute bottom-0 right-0 text-emerald-600"
        />
      </div>
    </button>
  )
}

import { useState, useEffect, useRef } from 'react'
import { Cloud, CloudDownload, Check } from 'lucide-react'
import { IPC } from '../../../shared/ipc-channels'

export function SyncIndicator() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => {
      setHasUpdate(true)
      // Auto-dismiss after 3s — data is already silently reloaded in the background
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setHasUpdate(false), 3_000)
    })
  }, [])

  if (hasUpdate) {
    return (
      <div
        className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-orange-200 shadow-sm"
        title="Sincronizando dados..."
      >
        <CloudDownload size={17} className="text-orange-500" />
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-emerald-200 shadow-sm"
      title="Sincronizado"
    >
      <div className="relative w-[17px] h-[17px]">
        <Cloud size={17} className="text-emerald-500" />
        <Check
          size={8}
          strokeWidth={3.5}
          className="absolute bottom-0 right-0 text-emerald-600"
        />
      </div>
    </div>
  )
}

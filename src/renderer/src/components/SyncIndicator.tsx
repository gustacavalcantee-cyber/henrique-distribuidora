import { useState, useEffect, useRef } from 'react'
import { Cloud, CloudDownload, Check, CloudOff, RefreshCw, UploadCloud } from 'lucide-react'
import { IPC } from '../../../shared/ipc-channels'

export function SyncIndicator() {
  const [state, setState] = useState<'ok' | 'syncing' | 'error'>('ok')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [resyncing, setResyncing] = useState(false)
  const [repushing, setRepushing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electron.on(IPC.DB_SYNCED, () => {
      setState('syncing')
      setErrorMsg('')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setState('ok'), 3_000)
    })

    window.electron.on(IPC.SYNC_ERROR, (...args: unknown[]) => {
      const msg = (args[1] ?? args[0] ?? 'Erro de sincronização') as string
      setState('error')
      setErrorMsg(msg)
      // Keep error visible until next successful sync
    })

    window.electron.on(IPC.DB_READY, () => {
      setState('ok')
      setErrorMsg('')
    })
  }, [])

  const handleForceResync = async () => {
    if (resyncing) return
    setResyncing(true)
    try {
      await window.electron.invoke(IPC.SYNC_FORCE_PULL)
      setState('ok')
      setErrorMsg('')
    } catch {
      // error will be reported via SYNC_ERROR event
    } finally {
      setResyncing(false)
    }
  }

  const handleForceRepush = async () => {
    if (repushing) return
    const ok = window.confirm(
      'Reenviar todos os pedidos para a nuvem?\n\n' +
      'Use esta opção para recuperar dados perdidos: marca todos os pedidos locais ' +
      'como não-sincronizados e os reenvia ao Supabase.\n\n' +
      'Execute apenas na máquina que tem os dados corretos.'
    )
    if (!ok) return
    setRepushing(true)
    try {
      await window.electron.invoke(IPC.SYNC_FORCE_REPUSH)
    } catch {
      // error will be reported via SYNC_ERROR event
    } finally {
      setRepushing(false)
    }
  }

  const repushBtn = (
    <button
      onClick={handleForceRepush}
      disabled={repushing}
      className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-gray-200 shadow-sm hover:bg-amber-50 hover:border-amber-300 transition-colors"
      title="Reenviar todos os pedidos locais para a nuvem (recuperação de dados)"
    >
      {repushing
        ? <RefreshCw size={15} className="text-amber-500 animate-spin" />
        : <UploadCloud size={15} className="text-gray-400 hover:text-amber-500" />}
    </button>
  )

  if (state === 'error') {
    return (
      <div className="flex items-center gap-1">
        {repushBtn}
        <button
          onClick={handleForceResync}
          disabled={resyncing}
          className="flex items-center gap-1.5 px-2 h-8 rounded-md bg-white border border-red-300 shadow-sm hover:bg-red-50 transition-colors"
          title={`Erro de sincronização: ${errorMsg}\nClique para tentar novamente`}
        >
          {resyncing
            ? <RefreshCw size={15} className="text-red-500 animate-spin" />
            : <CloudOff size={15} className="text-red-500" />}
          <span className="text-xs text-red-600 font-medium">Sync erro</span>
        </button>
      </div>
    )
  }

  if (state === 'syncing') {
    return (
      <div className="flex items-center gap-1">
        {repushBtn}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-orange-200 shadow-sm"
          title="Sincronizando dados..."
        >
          <CloudDownload size={17} className="text-orange-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {repushBtn}
      <button
        onClick={handleForceResync}
        disabled={resyncing}
        className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-emerald-200 shadow-sm hover:bg-emerald-50 transition-colors"
        title="Sincronizado — clique para forçar ressincronização"
      >
        {resyncing
          ? <RefreshCw size={17} className="text-emerald-500 animate-spin" />
          : (
            <div className="relative w-[17px] h-[17px]">
              <Cloud size={17} className="text-emerald-500" />
              <Check size={8} strokeWidth={3.5} className="absolute bottom-0 right-0 text-emerald-600" />
            </div>
          )}
      </button>
    </div>
  )
}

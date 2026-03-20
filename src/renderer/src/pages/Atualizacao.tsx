import { useState, useEffect } from 'react'
import { IPC } from '../../../shared/ipc-channels'
import { RefreshCw, CheckCircle, Download, AlertCircle, Clock, RotateCcw } from 'lucide-react'

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

export function Atualizacao() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [installing, setInstalling] = useState(false)
  const isMac = navigator.platform.toLowerCase().includes('mac')

  useEffect(() => {
    // Listen to main-process push events
    window.electron.on(IPC.UPDATE_AVAILABLE, (data: unknown) => {
      const { version } = data as { version: string }
      setState({ status: 'available', version })
      setLastCheck(new Date())
    })

    window.electron.on(IPC.UPDATE_PROGRESS, (data: unknown) => {
      const { percent } = data as { percent: number }
      setState(prev => {
        if (prev.status === 'available' || prev.status === 'downloading') {
          return { status: 'downloading', version: (prev as { version: string }).version, percent }
        }
        return prev
      })
    })

    window.electron.on(IPC.UPDATE_DOWNLOADED, (data: unknown) => {
      const { version } = data as { version: string }
      setState({ status: 'downloaded', version })
    })

    window.electron.on(IPC.UPDATE_ERROR, (data: unknown) => {
      const { message } = data as { message: string }
      setState({ status: 'error', message })
    })

    // Trigger a manual check on page open to get current state
    handleCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCheck() {
    setState({ status: 'checking' })
    setLastCheck(new Date())
    try {
      await window.electron.invoke(IPC.UPDATE_CHECK)
      // If no UPDATE_AVAILABLE event fires within 3s, we're up to date
      setTimeout(() => {
        setState(prev => (prev.status === 'checking' ? { status: 'up-to-date' } : prev))
      }, 3000)
    } catch {
      setState({ status: 'error', message: 'Erro ao verificar atualização' })
    }
  }

  async function handleInstall() {
    setInstalling(true)
    try {
      await window.electron.invoke(IPC.UPDATE_INSTALL)
    } finally {
      setInstalling(false)
    }
  }

  const currentVersion = (window as unknown as Record<string, unknown>)['__APP_VERSION__'] as string | undefined

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Atualização</h1>
      <p className="text-sm text-slate-500 mb-8">Verifique se há uma nova versão disponível</p>

      {/* Current version card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Versão instalada</p>
            <p className="text-2xl font-bold text-slate-800">v{currentVersion ?? '—'}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
            <CheckCircle size={22} className="text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Status card */}
      {state.status !== 'idle' && (
        <div className={`border rounded-xl p-5 mb-4 ${
          state.status === 'downloaded' ? 'bg-blue-50 border-blue-200' :
          state.status === 'error' ? 'bg-red-50 border-red-200' :
          state.status === 'up-to-date' ? 'bg-emerald-50 border-emerald-200' :
          'bg-slate-50 border-slate-200'
        }`}>

          {state.status === 'checking' && (
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin text-slate-400" />
              <p className="text-sm text-slate-600">Verificando atualizações...</p>
            </div>
          )}

          {state.status === 'up-to-date' && (
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-600" />
              <p className="text-sm text-emerald-700 font-medium">O programa está atualizado.</p>
            </div>
          )}

          {state.status === 'available' && (
            <div className="flex items-center gap-2">
              <Download size={16} className="text-slate-500 animate-bounce" />
              <p className="text-sm text-slate-700">
                Nova versão <span className="font-semibold">v{state.version}</span> encontrada — baixando...
              </p>
            </div>
          )}

          {state.status === 'downloading' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-700 font-medium">Baixando v{state.version}</p>
                <p className="text-sm font-bold text-slate-800">{state.percent}%</p>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.percent}%` }}
                />
              </div>
            </div>
          )}

          {state.status === 'downloaded' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={18} className="text-blue-600" />
                <p className="font-semibold text-blue-800">
                  v{state.version} pronta para instalar
                </p>
              </div>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <RotateCcw size={15} />
                {installing ? 'Instalando...' : isMac ? 'Abrir instalador' : 'Reiniciar e instalar'}
              </button>
              {isMac && (
                <p className="text-xs text-blue-500 mt-2 text-center">
                  O instalador vai abrir — arraste o app para a pasta Aplicativos e reabra.
                </p>
              )}
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{state.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Manual check button */}
      <button
        onClick={handleCheck}
        disabled={state.status === 'checking' || state.status === 'downloading'}
        className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
      >
        <RefreshCw size={15} className={state.status === 'checking' ? 'animate-spin' : ''} />
        {state.status === 'checking' ? 'Verificando...' : 'Verificar agora'}
      </button>

      {lastCheck && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Clock size={12} className="text-slate-300" />
          <p className="text-xs text-slate-400">
            Última verificação: {lastCheck.toLocaleTimeString('pt-BR')}
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 bg-slate-50 rounded-xl p-4 border border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Como funciona
        </p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
          <li>O programa verifica automaticamente ao abrir e a cada 4 horas</li>
          <li>Quando há uma versão nova, o download começa em segundo plano</li>
          {isMac
            ? <li>Quando pronto, clique em &quot;Abrir instalador&quot; e arraste para Aplicativos</li>
            : <li>Quando pronto, clique em &quot;Reiniciar e instalar&quot; — o programa reabre atualizado</li>
          }
        </ol>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { IPC } from '../../../shared/ipc-channels'
import { RefreshCw, CheckCircle, Download, AlertCircle, Clock } from 'lucide-react'

interface UpdateInfo {
  disponivel: boolean
  versaoAtual?: string
  versaoNova?: string
  notas?: string
  download_url?: string
  erro?: string
}

export function Atualizacao() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  async function checkUpdate() {
    setLoading(true)
    try {
      const result = (await window.electron.invoke(IPC.UPDATE_CHECK)) as UpdateInfo
      setInfo(result)
      setLastCheck(new Date())
    } catch {
      setInfo({ disponivel: false, erro: 'Erro ao verificar atualizacao' })
    } finally {
      setLoading(false)
    }
  }

  async function openDownload() {
    if (!info?.download_url) return
    setOpening(true)
    try {
      await window.electron.invoke(IPC.UPDATE_INSTALL, info.download_url)
    } finally {
      setOpening(false)
    }
  }

  useEffect(() => {
    checkUpdate()
  }, [])

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Atualizacao</h1>
      <p className="text-sm text-slate-500 mb-8">Verifique se ha uma nova versao disponivel</p>

      {/* Current version card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Versao instalada</p>
            <p className="text-2xl font-bold text-slate-800">{info?.versaoAtual ?? '—'}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
            <CheckCircle size={22} className="text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Update status */}
      {info && !loading && (
        <div
          className={`border rounded-xl p-5 mb-4 ${
            info.disponivel
              ? 'bg-blue-50 border-blue-200'
              : info.erro
                ? 'bg-red-50 border-red-200'
                : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          {info.disponivel ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Download size={18} className="text-blue-600" />
                <p className="font-semibold text-blue-800">
                  Nova versao disponivel: {info.versaoNova}
                </p>
              </div>
              {info.notas && (
                <p className="text-sm text-blue-700 mb-4 leading-relaxed">{info.notas}</p>
              )}
              <button
                onClick={openDownload}
                disabled={opening}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {opening ? 'Abrindo...' : 'Ir para download'}
              </button>
              <p className="text-xs text-blue-500 mt-2 text-center">
                O navegador vai abrir com os arquivos de instalacao. Baixe o instalador correto para o seu sistema e instale.
              </p>
            </>
          ) : info.erro ? (
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-red-500" />
              <p className="text-sm text-red-700">{info.erro}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-600" />
              <p className="text-sm text-emerald-700 font-medium">O programa esta atualizado.</p>
            </div>
          )}
        </div>
      )}

      {/* Check button */}
      <button
        onClick={checkUpdate}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Verificando...' : 'Verificar agora'}
      </button>

      {lastCheck && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Clock size={12} className="text-slate-300" />
          <p className="text-xs text-slate-400">
            Ultima verificacao: {lastCheck.toLocaleTimeString('pt-BR')}
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 bg-slate-50 rounded-xl p-4 border border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Como funciona
        </p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
          <li>O programa verifica automaticamente por novas versoes</li>
          <li>Quando disponivel, clique em "Ir para download"</li>
          <li>Baixe o instalador correto para o seu sistema (Mac ou Windows)</li>
          <li>Execute o instalador e reabra o programa</li>
        </ol>
      </div>
    </div>
  )
}

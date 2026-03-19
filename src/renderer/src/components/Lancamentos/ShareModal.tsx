import { createPortal } from 'react-dom'
import { Share2, X, Check } from 'lucide-react'
import { IPC } from '../../../../shared/ipc-channels'

interface ShareModalProps {
  sharePreview: { image: string; pedidoId: number } | null
  shareCopied: boolean
  onClose: () => void
  onCopy: () => void
}

export function ShareModal({ sharePreview, shareCopied, onClose, onCopy }: ShareModalProps) {
  if (!sharePreview) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl flex flex-col max-h-[90vh] mx-4"
        style={{ width: 580 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <Share2 size={16} />
            Prévia da nota
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 bg-gray-100">
          <img src={sharePreview.image} alt="Nota" className="w-full shadow-md rounded" />
        </div>
        <div className="flex gap-2 justify-end px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            {shareCopied
              ? <><Check size={14} className="text-green-600" /> Copiado!</>
              : 'Copiar imagem'}
          </button>
          <a
            href={sharePreview.image}
            download={`nota-${sharePreview.pedidoId}.png`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            Salvar
          </a>
          <button
            onClick={async () => {
              await window.electron.invoke(IPC.CLIPBOARD_WRITE_IMAGE, sharePreview.image)
              await window.electron.invoke(IPC.SHARE_NOTA, sharePreview.pedidoId)
              onClose()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            <Share2 size={14} />
            Enviar via WhatsApp
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

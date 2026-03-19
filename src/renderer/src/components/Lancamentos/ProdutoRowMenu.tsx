import { createPortal } from 'react-dom'
import type { Produto } from '../../../../shared/types'

interface ProdutoRowMenuProps {
  lojaId: number
  lojaNome: string
  pos: { top: number; left: number }
  produtos: Produto[]
  rowProdIds: Record<number, Set<number>>
  rowProdSearch: string
  rowInlinePriceDraft: Record<number, string>
  onSearch: (v: string) => void
  onToggle: (lojaId: number, prodId: number) => void
  onPriceDraftChange: (prodId: number, v: string) => void
  onPriceBlur: (prodId: number, val: string) => Promise<void>
}

export function ProdutoRowMenu({
  lojaId,
  lojaNome,
  pos,
  produtos,
  rowProdIds,
  rowProdSearch,
  rowInlinePriceDraft,
  onSearch,
  onToggle,
  onPriceDraftChange,
  onPriceBlur,
}: ProdutoRowMenuProps) {
  return createPortal(
    <div
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded shadow-xl w-72"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-600">
        {lojaNome}
      </div>
      <div className="p-1.5 border-b border-gray-100">
        <input
          autoFocus
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Buscar produto..."
          value={rowProdSearch}
          onChange={e => onSearch(e.target.value)}
        />
      </div>
      <div className="px-3 py-1 border-b border-gray-100 grid grid-cols-2 gap-2 text-xs text-gray-400">
        <span>Produto</span><span className="text-right">Preço (R$)</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {[...produtos]
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
          .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
          .filter(p => p.nome.toLowerCase().includes(rowProdSearch.toLowerCase()))
          .map(p => {
            const isActive = rowProdIds[lojaId]?.has(p.id)
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1 px-2 py-1 border-b border-gray-50 ${isActive ? 'bg-white' : 'bg-gray-50'}`}
              >
                <button
                  onClick={() => onToggle(lojaId, p.id)}
                  className={`flex items-center gap-1.5 flex-1 text-left text-sm ${isActive ? 'text-gray-800' : 'text-gray-400'}`}
                >
                  <span className={`w-4 text-center text-xs font-bold ${isActive ? 'text-blue-500' : 'text-gray-300'}`}>
                    {isActive ? '✓' : '+'}
                  </span>
                  <span className="flex-1">{p.nome}</span>
                  <span className="text-xs opacity-40">{p.unidade}</span>
                </button>
                <input
                  className="w-16 px-1 py-0.5 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="—"
                  value={rowInlinePriceDraft[p.id] ?? ''}
                  onChange={e => onPriceDraftChange(p.id, e.target.value)}
                  onBlur={e => onPriceBlur(p.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>
            )
          })}
        {produtos.filter(p => p.nome.toLowerCase().includes(rowProdSearch.toLowerCase())).length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado.</p>
        )}
      </div>
    </div>,
    document.body
  )
}

import { Printer, Share2, X, Plus } from 'lucide-react'
import type { Produto, LancamentoRow } from '../../../../shared/types'

interface LancamentosCardsProps {
  rows: LancamentoRow[]
  visibleProdutos: Produto[]
  rowProdIds: Record<number, Set<number>>
  editMode: boolean
  ocPlaceholders: Record<number, string>
  editingLojaId: number | null
  editingLojaNome: string
  shareLoading: boolean
  onQuantidadeChange: (lojaId: number, prodId: number, value: string) => void
  onOcChange: (lojaId: number, value: string) => void
  onCellBlur: (lojaId: number) => void
  onDeleteRow: (lojaId: number) => void
  onToggleRowProd: (lojaId: number, prodId: number) => void
  onSaveLojaNome: (lojaId: number) => void
  onPrint: (row: LancamentoRow) => void
  onShare: (row: LancamentoRow) => void
  onOpenRowProdMenu: (e: React.MouseEvent, lojaId: number) => void
  onEditLoja: (lojaId: number, nome: string) => void
  onEditLojaNameChange: (v: string) => void
  onEditLojaKeyDown: (e: React.KeyboardEvent, lojaId: number) => void
}

export function LancamentosCards({
  rows, visibleProdutos, rowProdIds, editMode,
  ocPlaceholders, editingLojaId, editingLojaNome, shareLoading,
  onQuantidadeChange, onOcChange, onCellBlur, onDeleteRow, onToggleRowProd,
  onSaveLojaNome, onPrint, onShare, onOpenRowProdMenu,
  onEditLoja, onEditLojaNameChange, onEditLojaKeyDown,
}: LancamentosCardsProps) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-gray-400 py-8">
        Nenhuma loja cadastrada para esta rede.
      </p>
    )
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {rows.map(row => {
        const activeCount = rowProdIds[row.loja_id]?.size ?? 0
        const rowTotal = visibleProdutos.reduce((sum, p) => {
          if (!rowProdIds[row.loja_id]?.has(p.id)) return sum
          const qty = row.quantidades[p.id]
          return sum + (qty ?? 0)
        }, 0)

        return (
          <div
            key={row.loja_id}
            className="border border-gray-200 rounded-xl bg-white shadow-sm flex flex-col"
          >
            {/* Card header */}
            <div className="px-3 pt-3 pb-2 border-b border-gray-100">
              {/* Store name */}
              {editingLojaId === row.loja_id ? (
                <input
                  autoFocus
                  className="w-full px-1 py-0.5 text-sm font-bold text-slate-800 bg-white border border-emerald-400 rounded focus:outline-none mb-1"
                  value={editingLojaNome}
                  onChange={e => onEditLojaNameChange(e.target.value)}
                  onBlur={() => onSaveLojaNome(row.loja_id)}
                  onKeyDown={e => onEditLojaKeyDown(e, row.loja_id)}
                />
              ) : (
                <div
                  className="text-sm font-bold text-gray-800 cursor-pointer truncate mb-1"
                  title="Clique duplo para editar"
                  onDoubleClick={() => onEditLoja(row.loja_id, row.loja_nome)}
                >
                  {row.loja_nome}
                </div>
              )}

              <div className="flex items-center gap-1">
                {/* OC */}
                <input
                  className="flex-1 min-w-0 px-2 py-0.5 text-xs text-slate-700 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                  placeholder={ocPlaceholders[row.loja_id] ?? 'OC'}
                  value={row.numero_oc}
                  onChange={e => onOcChange(row.loja_id, e.target.value)}
                  onBlur={() => onCellBlur(row.loja_id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !row.numero_oc && ocPlaceholders[row.loja_id]) {
                      onOcChange(row.loja_id, ocPlaceholders[row.loja_id])
                    }
                  }}
                />
                {activeCount > 0 && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {activeCount} prod.
                  </span>
                )}
                {editMode && (
                  <button
                    onClick={() => onDeleteRow(row.loja_id)}
                    className="p-0.5 text-red-300 hover:text-red-500 rounded flex-shrink-0"
                    title="Remover loja"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 240 }}>
              {visibleProdutos.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400 text-center">
                  {editMode ? 'Clique em + Produtos' : 'Sem produtos'}
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {visibleProdutos.map(p => {
                    const isActive = rowProdIds[row.loja_id]?.has(p.id)
                    const qty = row.quantidades[p.id]
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-1">
                        <span className="flex-1 text-xs text-gray-700 truncate" title={p.nome}>
                          {p.nome}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{p.unidade}</span>
                        {isActive ? (
                          <input
                            className="w-14 px-1 py-0.5 text-xs text-center text-slate-800 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white flex-shrink-0"
                            type="number"
                            step={p.unidade === 'KG' ? '0.1' : '1'}
                            min="0"
                            value={qty ?? ''}
                            onChange={e => onQuantidadeChange(row.loja_id, p.id, e.target.value)}
                            onBlur={() => onCellBlur(row.loja_id)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          />
                        ) : editMode ? (
                          <button
                            className="w-14 h-5 flex items-center justify-center text-gray-300 hover:text-blue-400 hover:bg-blue-50 rounded border border-dashed border-gray-200 flex-shrink-0"
                            onClick={e => { e.stopPropagation(); onToggleRowProd(row.loja_id, p.id) }}
                            title="Adicionar"
                          >
                            <Plus size={9} />
                          </button>
                        ) : (
                          <span className="w-14 text-center text-gray-300 text-xs flex-shrink-0">—</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Card footer */}
            <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-1 flex-wrap">
              {editMode && (
                <button
                  onClick={e => onOpenRowProdMenu(e, row.loja_id)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded text-blue-600 hover:bg-blue-50 border border-blue-200 mr-auto"
                >
                  <Plus size={11} /> Produtos
                </button>
              )}
              {rowTotal > 0 && !editMode && (
                <span className="text-xs text-gray-500 mr-auto font-medium">
                  Total: {rowTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </span>
              )}
              <button
                onClick={() => onPrint(row)}
                disabled={!row.pedido_id}
                title="Imprimir"
                className="flex items-center gap-0.5 px-2 py-0.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer size={11} />
              </button>
              <button
                onClick={() => onShare(row)}
                disabled={!row.pedido_id || shareLoading}
                title="Enviar"
                className="flex items-center gap-0.5 px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Share2 size={11} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

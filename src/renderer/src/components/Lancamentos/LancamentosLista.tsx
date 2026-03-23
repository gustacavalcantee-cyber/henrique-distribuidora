import { Printer, Share2, X, Plus } from 'lucide-react'
import type { Produto, LancamentoRow } from '../../../../shared/types'

interface LancamentosListaProps {
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

export function LancamentosLista({
  rows, visibleProdutos, rowProdIds, editMode,
  ocPlaceholders, editingLojaId, editingLojaNome, shareLoading,
  onQuantidadeChange, onOcChange, onCellBlur, onDeleteRow, onToggleRowProd,
  onSaveLojaNome, onPrint, onShare, onOpenRowProdMenu,
  onEditLoja, onEditLojaNameChange, onEditLojaKeyDown,
}: LancamentosListaProps) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-gray-400 py-8">
        Nenhuma loja cadastrada para esta rede.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.loja_id} className="border border-gray-200 rounded-lg bg-white shadow-sm">

          {/* Cabeçalho da loja */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-lg border-b flex-wrap">
            {/* OC */}
            <input
              className="w-24 px-2 py-1 text-sm text-slate-800 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
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

            {/* Nome da loja */}
            {editingLojaId === row.loja_id ? (
              <input
                autoFocus
                className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold text-slate-800 bg-white border border-emerald-400 rounded focus:outline-none"
                value={editingLojaNome}
                onChange={e => onEditLojaNameChange(e.target.value)}
                onBlur={() => onSaveLojaNome(row.loja_id)}
                onKeyDown={e => onEditLojaKeyDown(e, row.loja_id)}
              />
            ) : (
              <span
                className="flex-1 min-w-0 text-sm font-semibold text-gray-800 cursor-pointer truncate"
                title="Clique duplo para editar"
                onDoubleClick={() => onEditLoja(row.loja_id, row.loja_nome)}
              >
                {row.loja_nome}
              </span>
            )}

            {/* Botões */}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              {editMode && (
                <button
                  onClick={e => onOpenRowProdMenu(e, row.loja_id)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded text-blue-600 hover:bg-blue-50 border border-blue-200"
                >
                  <Plus size={12} /> Produtos
                </button>
              )}
              <button
                onClick={() => onPrint(row)}
                disabled={!row.pedido_id}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer size={12} /> Imprimir
              </button>
              <button
                onClick={() => onShare(row)}
                disabled={!row.pedido_id || shareLoading}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Share2 size={12} /> {shareLoading ? 'Gerando...' : 'Enviar'}
              </button>
              {editMode && (
                <button
                  onClick={() => onDeleteRow(row.loja_id)}
                  className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Remover loja"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Lista de produtos */}
          {visibleProdutos.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">
              Nenhum produto. {editMode && 'Clique em + Produtos para adicionar.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {visibleProdutos.map(p => {
                const isActive = rowProdIds[row.loja_id]?.has(p.id)
                const qty = row.quantidades[p.id]
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-1.5">
                    <span className="flex-1 text-sm text-gray-700">{p.nome}</span>
                    <span className="text-xs text-gray-400 w-8 text-right">{p.unidade}</span>
                    {isActive ? (
                      <input
                        className="w-20 px-2 py-0.5 text-sm text-center text-slate-800 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
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
                        className="w-20 h-6 flex items-center justify-center text-gray-300 hover:text-blue-400 hover:bg-blue-50 rounded border border-dashed border-gray-200"
                        onClick={e => { e.stopPropagation(); onToggleRowProd(row.loja_id, p.id) }}
                        title="Adicionar para esta loja"
                      >
                        <Plus size={10} />
                      </button>
                    ) : (
                      <span className="w-20 text-center text-gray-300 text-sm">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

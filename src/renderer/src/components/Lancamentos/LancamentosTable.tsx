import { useRef } from 'react'
import { ChevronUp, ChevronDown, X, Plus, Printer, Share2 } from 'lucide-react'
import type { Produto, LancamentoRow } from '../../../../shared/types'

interface LancamentosTableProps {
  rows: LancamentoRow[]
  visibleProdutos: Produto[]
  totals: Record<number, number>
  rowProdIds: Record<number, Set<number>>
  editMode: boolean
  ocPlaceholders: Record<number, string>
  editingLojaId: number | null
  editingLojaNome: string
  shareLoading: boolean
  onQuantidadeChange: (lojaId: number, prodId: number, value: string) => void
  onOcChange: (lojaId: number, value: string) => void
  onCellBlur: (row: LancamentoRow) => void
  onMoveUp: (lojaId: number) => void
  onMoveDown: (lojaId: number) => void
  onDeleteRow: (lojaId: number) => void
  onRemoveColumn: (prodId: number) => void
  onToggleRowProd: (lojaId: number, prodId: number) => void
  onSaveLojaNome: (lojaId: number) => void
  onPrint: (row: LancamentoRow) => void
  onShare: (row: LancamentoRow) => void
  onOpenRowProdMenu: (e: React.MouseEvent, lojaId: number) => void
  onEditLoja: (lojaId: number, nome: string) => void
  onEditLojaNameChange: (v: string) => void
  onEditLojaKeyDown: (e: React.KeyboardEvent, lojaId: number) => void
  onApplyAll: (prodId: number, qty: number | null) => void
}

export function LancamentosTable({
  rows, visibleProdutos, totals, rowProdIds, editMode,
  ocPlaceholders, editingLojaId, editingLojaNome,
  shareLoading,
  onQuantidadeChange, onOcChange, onCellBlur, onMoveUp, onMoveDown,
  onDeleteRow, onRemoveColumn, onToggleRowProd, onSaveLojaNome,
  onPrint, onShare, onOpenRowProdMenu, onEditLoja, onEditLojaNameChange,
  onEditLojaKeyDown, onApplyAll,
}: LancamentosTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={tableRef} style={{ overflowX: 'auto', width: '100%', minWidth: 0 }}>
      <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
        <thead>
          {/* Linha de totais */}
          <tr className="bg-gray-100">
            <th className="border px-2 py-1 text-left text-xs text-gray-500 w-28">TOTAL</th>
            <th className="border px-2 py-1 w-32"></th>
            {visibleProdutos.map(p => (
              <th key={p.id} className="border px-2 py-1 text-center font-bold w-24">
                {totals[p.id] != null
                  ? (Math.round(totals[p.id] * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                  : ''}
              </th>
            ))}
            <th className="border px-2 py-1 w-36"></th>
          </tr>

          {/* Linha TODAS — só em modo edição */}
          {editMode && (
            <tr className="bg-emerald-50">
              <th className="border px-2 py-1 text-left text-xs text-emerald-700 font-semibold w-28">TODAS</th>
              <th className="border px-2 py-1 w-32 text-xs text-emerald-600 font-normal text-left">Aplicar a todas</th>
              {visibleProdutos.map(p => (
                <th key={p.id} className="border px-1 py-0.5 w-24">
                  <input
                    className="w-full px-1 py-0.5 text-sm text-center text-emerald-800 bg-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded placeholder-emerald-300"
                    type="number"
                    step={p.unidade === 'KG' ? '0.1' : '1'}
                    min="0"
                    placeholder="—"
                    onChange={e => {
                      const qty = e.target.value === '' ? null : Number(e.target.value)
                      onApplyAll(p.id, qty)
                    }}
                  />
                </th>
              ))}
              <th className="border px-2 py-1 w-36"></th>
            </tr>
          )}

          {/* Cabeçalho das colunas */}
          <tr className="bg-gray-50">
            <th className="border px-2 py-1 text-left text-xs text-gray-600">NOTA</th>
            <th className="border px-2 py-1 text-left text-xs text-gray-600">LOJA</th>
            {visibleProdutos.map(p => (
              <th key={p.id} className="border px-1 py-1 text-center text-xs text-gray-600 uppercase">
                <div className="flex items-center justify-center gap-1">
                  <span>{p.nome}</span>
                  {editMode && (
                    <button
                      onClick={() => onRemoveColumn(p.id)}
                      title="Remover de todas as lojas"
                      className="text-gray-300 hover:text-red-400 leading-none"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="text-gray-400 font-normal">{p.unidade}</div>
              </th>
            ))}
            <th className="border px-2 py-1 text-xs text-gray-600">AÇÕES</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.loja_id} className="hover:bg-gray-50">
              {/* Campo OC */}
              <td className="border px-1 py-0.5">
                <input
                  className="w-full px-1 py-0.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                  placeholder={ocPlaceholders[row.loja_id] ?? 'OC'}
                  value={row.numero_oc}
                  onChange={e => onOcChange(row.loja_id, e.target.value)}
                  onBlur={() => onCellBlur(row)}
                />
              </td>

              {/* Nome da loja */}
              <td className="border px-1 py-0.5 font-medium text-gray-700 whitespace-nowrap">
                {editingLojaId === row.loja_id ? (
                  <input
                    autoFocus
                    className="w-full px-1 py-0.5 text-sm text-slate-800 bg-white border border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                    value={editingLojaNome}
                    onChange={e => onEditLojaNameChange(e.target.value)}
                    onBlur={() => onSaveLojaNome(row.loja_id)}
                    onKeyDown={e => onEditLojaKeyDown(e, row.loja_id)}
                  />
                ) : (
                  <span
                    className="block px-1 py-0.5 cursor-pointer hover:bg-gray-100 rounded"
                    title="Clique duplo para editar"
                    onDoubleClick={() => onEditLoja(row.loja_id, row.loja_nome)}
                  >
                    {row.loja_nome}
                  </span>
                )}
              </td>

              {/* Células de quantidade */}
              {visibleProdutos.map((p, prodIndex) => {
                const isActive = rowProdIds[row.loja_id]?.has(p.id)
                const qty = row.quantidades[p.id]
                return (
                  <td key={p.id} className="border px-1 py-0.5">
                    {isActive ? (
                      <input
                        data-cell-id={`${row.loja_id}-${prodIndex}`}
                        className="w-full px-1 py-0.5 text-sm text-center text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                        type="number"
                        step={p.unidade === 'KG' ? '0.1' : '1'}
                        min="0"
                        value={qty ?? ''}
                        onChange={e => onQuantidadeChange(row.loja_id, p.id, e.target.value)}
                        onBlur={e => {
                          // Não salva se o foco está indo para outra célula de quantidade
                          if ((e.relatedTarget as HTMLElement)?.hasAttribute('data-cell-id')) return
                          onCellBlur(row)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); return }
                          if (e.key === 'Tab') {
                            e.preventDefault()
                            const forward = !e.shiftKey
                            const totalProd = visibleProdutos.length
                            let pi = prodIndex
                            let ri = rowIndex
                            // Loop until we find an existing input element (skip inactive cells)
                            for (let attempts = 0; attempts < rows.length * totalProd; attempts++) {
                              if (forward) { pi++; if (pi >= totalProd) { pi = 0; ri++ } }
                              else { pi--; if (pi < 0) { pi = totalProd - 1; ri-- } }
                              if (ri < 0 || ri >= rows.length) break
                              const nextLojaId = rows[ri].loja_id
                              const next = (tableRef.current ?? document).querySelector<HTMLInputElement>(
                                `[data-cell-id="${nextLojaId}-${pi}"]`
                              )
                              if (next) { next.focus(); break }
                            }
                          }
                        }}
                      />
                    ) : editMode ? (
                      <button
                        className="w-full h-6 flex items-center justify-center text-gray-200 hover:text-blue-400 hover:bg-blue-50 rounded"
                        title="Adicionar para esta loja"
                        onClick={e => { e.stopPropagation(); onToggleRowProd(row.loja_id, p.id) }}
                      >
                        <Plus size={10} />
                      </button>
                    ) : null}
                  </td>
                )
              })}

              {/* Ações */}
              <td className="border px-1 py-0.5">
                <div className="flex items-center gap-1">
                  {editMode && (
                    <>
                      <button
                        onClick={e => onOpenRowProdMenu(e, row.loja_id)}
                        title="Gerenciar produtos desta loja"
                        className={`flex items-center gap-0.5 px-1 py-0.5 text-xs rounded ${
                          (rowProdIds[row.loja_id]?.size ?? 0) === 0
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                        }`}
                      >
                        <Plus size={12} />
                        {(rowProdIds[row.loja_id]?.size ?? 0) === 0 && <span>Produtos</span>}
                      </button>
                      <button
                        onClick={() => onMoveUp(row.loja_id)}
                        title="Mover para cima"
                        className="p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => onMoveDown(row.loja_id)}
                        title="Mover para baixo"
                        className="p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onPrint(row)}
                    disabled={!row.pedido_id}
                    title="Imprimir"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer size={12} />
                    Imprimir
                  </button>
                  <button
                    onClick={() => onShare(row)}
                    disabled={!row.pedido_id || shareLoading}
                    title="Compartilhar nota como imagem"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Share2 size={12} />
                    {shareLoading ? 'Gerando...' : 'Enviar'}
                  </button>
                  {editMode && (
                    <button
                      onClick={() => onDeleteRow(row.loja_id)}
                      title="Remover da lista"
                      className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={visibleProdutos.length + 3} className="text-center text-gray-400 py-8">
                Nenhuma loja cadastrada para esta rede.
              </td>
            </tr>
          )}
          {rows.length > 0 && visibleProdutos.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center text-gray-400 py-6 text-sm">
                Clique em <strong>+</strong> em AÇÕES para adicionar produtos a cada loja.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

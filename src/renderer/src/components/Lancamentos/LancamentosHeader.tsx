import { Plus, Pencil, Check, Table2, List, LayoutGrid, Search, X } from 'lucide-react'
import type { Produto, LancamentoRow } from '../../../../shared/types'

export type LayoutMode = 'tabela' | 'lista' | 'cards'

interface LancamentosHeaderProps {
  dataPedido: string
  editMode: boolean
  hiddenRows: LancamentoRow[]
  showAddMenu: boolean
  showGlobalProdMenu: boolean
  globalProdSearch: string
  rows: LancamentoRow[]
  produtos: Produto[]
  rowProdIds: Record<number, Set<number>>
  layoutMode: LayoutMode
  onDateChange: (v: string) => void
  onToggleEditMode: () => void
  onToggleAddMenu: () => void
  onRestoreRow: (lojaId: number) => void
  onToggleGlobalProdMenu: () => void
  onGlobalProdSearch: (v: string) => void
  onToggleGlobalProd: (prodId: number) => void
  onLayoutChange: (mode: LayoutMode) => void
  prodSearch: string
  onProdSearch: (v: string) => void
}

export function LancamentosHeader({
  dataPedido, editMode, hiddenRows, showAddMenu, showGlobalProdMenu,
  globalProdSearch, rows, produtos, rowProdIds, layoutMode,
  onDateChange, onToggleEditMode, onToggleAddMenu, onRestoreRow,
  onToggleGlobalProdMenu, onGlobalProdSearch, onToggleGlobalProd, onLayoutChange,
  prodSearch, onProdSearch,
}: LancamentosHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="text-2xl font-bold text-gray-900">Lançamentos</h2>

      {/* Seletor de data */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Data:</label>
        <input
          type="date"
          value={dataPedido}
          onChange={e => onDateChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      {/* Restaurar loja oculta */}
      {editMode && hiddenRows.length > 0 && (
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); onToggleAddMenu() }}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            <Plus size={14} />
            Adicionar loja
          </button>
          {showAddMenu && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 min-w-40"
              onClick={e => e.stopPropagation()}
            >
              {hiddenRows.map(r => (
                <button
                  key={r.loja_id}
                  onClick={() => onRestoreRow(r.loja_id)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {r.loja_nome}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botão Editar/Concluído */}
      <button
        onClick={e => { e.stopPropagation(); onToggleEditMode() }}
        className={`flex items-center gap-1 px-3 py-1 text-sm rounded font-medium ${
          editMode
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {editMode ? <><Check size={14} /> Concluído</> : <><Pencil size={14} /> Editar</>}
      </button>

      {/* Seletor de layout — ao lado do Editar */}
      <div className="flex items-center gap-0.5 border border-gray-200 rounded p-0.5 bg-gray-50">
        {([
          { mode: 'tabela', Icon: Table2, title: 'Tabela' },
          { mode: 'lista',  Icon: List,   title: 'Lista'  },
          { mode: 'cards',  Icon: LayoutGrid, title: 'Cards' },
        ] as const).map(({ mode, Icon, title }) => (
          <button
            key={mode}
            title={title}
            onClick={e => { e.stopPropagation(); onLayoutChange(mode) }}
            className={`p-1 rounded transition-colors ${
              layoutMode === mode
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      {/* Busca de produto nas colunas */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar produto..."
          value={prodSearch}
          onChange={e => onProdSearch(e.target.value)}
          className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44 bg-white"
        />
        {prodSearch && (
          <button
            onClick={() => onProdSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Botão Produto global */}
      {editMode && (
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); onToggleGlobalProdMenu() }}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus size={14} />
            Produto
          </button>
          {showGlobalProdMenu && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 w-64"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
                Adicionar para todas as lojas
              </div>
              <div className="p-1.5 border-b border-gray-100">
                <input
                  autoFocus
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Buscar produto..."
                  value={globalProdSearch}
                  onChange={e => onGlobalProdSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {[...produtos]
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .filter((p, i, arr) => arr.findIndex(x => x.nome === p.nome && x.unidade === p.unidade) === i)
                  .filter(p => p.nome.toLowerCase().includes(globalProdSearch.toLowerCase()))
                  .map(p => {
                    const inAll = rows.length > 0 && rows.every(row => rowProdIds[row.loja_id]?.has(p.id))
                    const inSome = rows.some(row => rowProdIds[row.loja_id]?.has(p.id))
                    return (
                      <button
                        key={p.id}
                        onClick={() => onToggleGlobalProd(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50"
                      >
                        <span className={`w-4 text-center text-xs font-bold flex-shrink-0 ${inAll ? 'text-blue-500' : inSome ? 'text-blue-300' : 'text-gray-300'}`}>
                          {inAll ? '✓' : inSome ? '–' : '+'}
                        </span>
                        <span className="flex-1 text-left">{p.nome}</span>
                        <span className="text-xs text-gray-400">{p.unidade}</span>
                      </button>
                    )
                  })}
                {produtos.filter(p => p.nome.toLowerCase().includes(globalProdSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

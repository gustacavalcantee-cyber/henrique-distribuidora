export interface Rede { id: number; nome: string; cor_tema: string; ativo: number }
export interface Loja { id: number; rede_id: number; nome: string; codigo: string | null; ativo: number }
export interface Produto { id: number; rede_id: number | null; nome: string; unidade: string; ordem_exibicao: number; ativo: number }
export interface Preco { id: number; produto_id: number; loja_id: number; preco_venda: number; vigencia_inicio: string; vigencia_fim: string | null }
export interface Custo { id: number; produto_id: number; custo_compra: number; vigencia_inicio: string; vigencia_fim: string | null }
export interface Pedido { id: number; rede_id: number; loja_id: number; data_pedido: string; numero_oc: string; observacoes: string | null; criado_em: string }
export interface ItemPedido { id: number; pedido_id: number; produto_id: number; quantidade: number; preco_unit: number; custo_unit: number }
export interface Despesa { id: number; data: string; categoria: string; rede_id: number | null; loja_id: number | null; descricao: string | null; valor: number }

export interface SalvarPedidoInput {
  rede_id: number
  loja_id: number
  data_pedido: string
  numero_oc: string
  observacoes?: string
  itens: Array<{ produto_id: number; quantidade: number; preco_unit?: number; custo_unit?: number }>
}

export interface LancamentoRow {
  loja_id: number
  loja_nome: string
  pedido_id: number | null
  numero_oc: string
  quantidades: Record<number, number | null>
}

export interface QuinzenaDetalheItem {
  data_pedido: string; numero_oc: string; loja_nome: string; produto_nome: string
  unidade: string; quantidade: number; preco_unit: number; custo_unit: number
  total_venda: number; total_custo: number
}
export interface QuinzenaMatrizRow { data_pedido: string; quantidades: Record<number, number> }
export interface QuinzenaSummary {
  total_venda: number; total_custo: number; margem: number
  detalhe: QuinzenaDetalheItem[]; matriz: QuinzenaMatrizRow[]; produtos: Produto[]
}
export interface FinanceiroSummary {
  receita_bruta: number; custo_produtos: number; margem_bruta: number
  despesas: number; lucro_liquido: number
  por_rede: Array<{ rede_nome: string; receita: number }>
  top_lojas: Array<{ loja_nome: string; receita: number }>
}

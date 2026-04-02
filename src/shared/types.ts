export interface Rede { id: number; nome: string; cor_tema: string; ativo: number }
export interface Franqueado { id: number; nome: string }
export interface Loja { id: number; rede_id: number; nome: string; codigo: string | null; cnpj: string | null; ativo: number; franqueado_id: number | null }
export interface Produto { id: number; rede_id: number | null; nome: string; unidade: string; ordem_exibicao: number; ativo: number; ncm: string | null }
export interface Preco { id: number; produto_id: number; loja_id: number; preco_venda: number; vigencia_inicio: string; vigencia_fim: string | null }
export interface Custo { id: number; produto_id: number; custo_compra: number; vigencia_inicio: string; vigencia_fim: string | null }
export interface Pedido { id: number; rede_id: number; loja_id: number; data_pedido: string; numero_oc: string; observacoes: string | null; criado_em: string; status_pagamento: string }
export interface NotaPagamento { pedido_id: number; loja_id: number; loja_nome: string; loja_nome_only: string; rede_nome: string; franqueado_nome: string | null; data_pedido: string; numero_oc: string; total_venda: number; status_pagamento: string }
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
  item_id: number; data_pedido: string; numero_oc: string; loja_nome: string; produto_nome: string
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
export interface CobrancaLojaResult {
  loja_id: number
  loja_nome: string
  periodo_str: string
  total_venda: number
}

export interface ProdutoRelatorioLinha {
  nome: string
  quantidade: number
  valor: number
}

export interface ProdutoRelatorioResult {
  produto_id: number
  produto_nome: string
  unidade: string
  linhas: ProdutoRelatorioLinha[]
  total_quantidade: number
  total_valor: number
}

export interface PrecoVsCustoCusto {
  id: number
  custo_compra: number
  vigencia_inicio: string
  vigencia_fim: string | null
}

export interface PrecoVsCustoLoja {
  loja_id: number
  loja_nome: string          // "Franqueado — Loja" ou só "Loja"
  preco_venda: number | null
  custo_atual: number | null
  margem_reais: number | null
  margem_pct: number | null
}

export interface PrecoVsCustoGraficoDia {
  dia: string                // "YYYY-MM-DD"
  custo: number | null
  preco: number | null
  margem_pct: number | null
}

export interface PrecoVsCustoGraficoMes {
  mes: string                // "YYYY-MM"
  custo: number | null
  preco_medio: number | null
  margem_pct: number | null
  dias: PrecoVsCustoGraficoDia[]
}

export interface PrecoVsCustoResult {
  produto_nome: string
  historico_custos: PrecoVsCustoCusto[]
  comparacao_lojas: PrecoVsCustoLoja[]
  grafico_mensal: PrecoVsCustoGraficoMes[]
}

export interface NfeConfig {
  nome: string
  cnpj: string
  ie: string
  logradouro: string
  numero_end: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  serie: string
  numero_atual: number
  natureza_operacao: string
}

export interface NfeItem {
  codigo: string
  descricao: string
  ncm: string
  cst: string
  cfop: string
  unidade: string
  quantidade: number
  valor_unitario: number
  valor_desconto: number
  valor_total: number
  base_icms: number
  valor_icms: number
  aliq_icms: number
}

export interface NfeDraft {
  loja_id: number
  loja_nome: string
  loja_razao_social: string
  loja_cnpj: string
  loja_ie: string
  loja_endereco: string
  loja_bairro: string
  loja_cep: string
  loja_municipio: string
  loja_uf: string
  loja_telefone: string
  mes: number
  ano: number
  quinzena: 1 | 2
  items: NfeItem[]
  valor_total: number
}

export interface NotaFiscalSalva {
  id: number
  numero: number
  serie: string
  loja_id: number
  loja_nome: string
  mes: number
  ano: number
  quinzena: number
  data_emissao: string
  valor_total: number
  status: string
  items_json: string
  danfe_html: string | null
  chave_acesso: string | null
  protocolo: string | null
  criado_em: string
}

export interface ProdutoFiscalRow {
  id: number
  nome: string
  unidade: string
  ncm: string | null
  cst_icms: string | null
  cfop: string | null
  unidade_nfe: string | null
}

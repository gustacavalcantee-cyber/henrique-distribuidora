export interface Rede { id: number; nome: string; cor_tema: string; ativo: number }
export interface Franqueado { id: number; nome: string }
export interface Loja {
  id: number; rede_id: number; nome: string; codigo: string | null; cnpj: string | null; ativo: number; franqueado_id: number | null
  // Fiscal / boleto fields
  razao_social: string | null; endereco: string | null; bairro: string | null; cep: string | null
  municipio: string | null; uf: string | null; ie: string | null; telefone: string | null
}
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

// ---- Boleto / Banco Inter ----
export interface Banco {
  id: number
  nome: string
  codigo: string          // e.g. "077" for Inter
  provedor: string        // 'inter' | 'manual'
  ativo: number
  // Inter-specific credentials (stored encrypted or as plain text for now)
  client_id: string | null
  client_secret: string | null
  cert_path: string | null       // path to .crt file
  key_path: string | null        // path to .key file
  conta: string | null           // checking account number
  agencia: string | null
}

export interface BoletoSacado {
  nome: string
  cpf_cnpj: string
  endereco: string
  cidade: string
  uf: string
  cep: string
}

export interface BoletoDraft {
  banco_id: number
  sacado: BoletoSacado
  valor: number                  // R$
  vencimento: string             // 'YYYY-MM-DD'
  descricao: string
  numero_documento: string
  loja_id?: number
  pedido_id?: number
  dias_multa?: number            // default 0
  juros_mensal?: number          // % default 0
  desconto_valor?: number        // R$
  desconto_data?: string         // until this date
}

export interface BoletoSalvo {
  id: number
  banco_id: number
  banco_nome: string
  loja_id: number | null
  pedido_id: number | null
  sacado_nome: string
  sacado_cpf_cnpj: string
  valor: number
  vencimento: string
  descricao: string
  numero_documento: string
  nosso_numero: string | null
  linha_digitavel: string | null
  codigo_barras: string | null
  status: string                 // 'emitido' | 'pago' | 'cancelado' | 'vencido'
  pdf_path: string | null
  criado_em: string
  inter_id: string | null        // response id from Inter API
}

// ── Emissão em Lote ──────────────────────────────────────────────────────────
export interface LoteItem {
  loja_id: number
  loja_nome: string
  franqueado_id: number | null
  franqueado_nome: string | null
  total_venda: number
  cnpj: string | null
  razao_social: string | null
  endereco: string | null
  municipio: string | null
  uf: string | null
  cep: string | null
}

export interface LoteResultItem {
  loja_id: number
  loja_nome: string
  tipo: 'boleto' | 'nfe'
  status: 'ok' | 'erro'
  mensagem?: string
  boleto_id?: number
  nfe_id?: number
}

export interface InterConfig {
  client_id: string
  client_secret: string
  cert_path: string
  key_path: string
  conta: string
  agencia: string
  ambiente: 'producao' | 'sandbox'
}

import { getSupabase } from '../supabase'

export interface PedidoRow {
  id: number
  rede_id: number
  loja_id: number
  data_pedido: string
  numero_oc: string
}

export interface ItemRow {
  pedido_id: number
  produto_id: number
  quantidade: number
  preco_unit: number
  custo_unit: number
}

export interface LojaRow { id: number; nome: string; rede_id: number }
export interface RedeRow { id: number; nome: string }
export interface ProdutoRow { id: number; nome: string; unidade: string }
export interface PrecoRow { produto_id: number; loja_id: number; preco_venda: number; vigencia_fim: string | null }

export async function fetchRedes(): Promise<RedeRow[]> {
  const { data, error } = await getSupabase()
    .from('redes').select('id, nome').eq('ativo', 1)
  if (error) throw new Error(`fetchRedes: ${error.message}`)
  return data ?? []
}

export async function fetchLojas(): Promise<LojaRow[]> {
  const { data, error } = await getSupabase()
    .from('lojas').select('id, nome, rede_id').eq('ativo', 1)
  if (error) throw new Error(`fetchLojas: ${error.message}`)
  return data ?? []
}

export async function fetchPedidosRange(
  dataInicio: string,
  dataFim: string,
  redeId?: number
): Promise<PedidoRow[]> {
  let q = getSupabase()
    .from('pedidos')
    .select('id, rede_id, loja_id, data_pedido, numero_oc')
    .gte('data_pedido', dataInicio)
    .lte('data_pedido', dataFim)
  if (redeId) q = q.eq('rede_id', redeId)
  const { data, error } = await q
  if (error) throw new Error(`fetchPedidosRange: ${error.message}`)
  return data ?? []
}

export async function fetchItens(pedidoIds: number[]): Promise<ItemRow[]> {
  if (pedidoIds.length === 0) return []
  const { data, error } = await getSupabase()
    .from('itens_pedido')
    .select('pedido_id, produto_id, quantidade, preco_unit, custo_unit')
    .in('pedido_id', pedidoIds)
  if (error) throw new Error(`fetchItens: ${error.message}`)
  return data ?? []
}

export async function fetchProdutos(ids?: number[]): Promise<ProdutoRow[]> {
  let q = getSupabase()
    .from('produtos')
    .select('id, nome, unidade')
    .eq('ativo', 1)
  if (ids && ids.length > 0) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw new Error(`fetchProdutos: ${error.message}`)
  return data ?? []
}

export async function fetchActivePrecos(): Promise<PrecoRow[]> {
  const { data, error } = await getSupabase()
    .from('precos')
    .select('produto_id, loja_id, preco_venda, vigencia_fim')
    .is('vigencia_fim', null)
  if (error) throw new Error(`fetchActivePrecos: ${error.message}`)
  return data ?? []
}

export async function fetchConfig(chave: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('configuracoes').select('valor').eq('chave', chave).single()
  return data?.valor ?? null
}

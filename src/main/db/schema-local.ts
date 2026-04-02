// src/main/db/schema-local.ts
// SQLite schema — local primary store (offline-first)
import { sqliteTable, integer, text, real, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

export const syncMeta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
})

export const redes = sqliteTable('redes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  cor_tema: text('cor_tema'),
  ativo: integer('ativo').default(1),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const franqueados = sqliteTable('franqueados', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const lojas = sqliteTable('lojas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  codigo: text('codigo'),
  cnpj: text('cnpj'),
  ativo: integer('ativo').default(1),
  franqueado_id: integer('franqueado_id').references(() => franqueados.id),
  // Fiscal / boleto fields (added via ALTER TABLE migration)
  razao_social: text('razao_social'),
  endereco: text('endereco'),
  bairro: text('bairro'),
  cep: text('cep'),
  municipio: text('municipio'),
  uf: text('uf'),
  ie: text('ie'),
  telefone: text('telefone'),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const produtos = sqliteTable('produtos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  unidade: text('unidade').notNull(),
  ordem_exibicao: integer('ordem_exibicao').default(0),
  ativo: integer('ativo').default(1),
  ncm: text('ncm'),
  cst_icms: text('cst_icms'),
  cfop: text('cfop'),
  unidade_nfe: text('unidade_nfe'),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const pedidos = sqliteTable(
  'pedidos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rede_id: integer('rede_id').references(() => redes.id),
    loja_id: integer('loja_id').references(() => lojas.id),
    data_pedido: text('data_pedido').notNull(),
    numero_oc: text('numero_oc').notNull(),
    observacoes: text('observacoes'),
    criado_em: text('criado_em'),
    status_pagamento: text('status_pagamento').default('aberto'),
    updated_at: text('updated_at'),
    device_id: text('device_id'),
    synced: integer('synced').default(1),
    remote_id: integer('remote_id'),
    conflict_state: text('conflict_state'),
  },
  (t) => ({
    uniquePedido: uniqueIndex('unique_pedido').on(t.rede_id, t.loja_id, t.data_pedido, t.numero_oc),
  })
)

export const itensPedido = sqliteTable('itens_pedido', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pedido_id: integer('pedido_id').references(() => pedidos.id, { onDelete: 'cascade' }),
  produto_id: integer('produto_id').references(() => produtos.id),
  quantidade: real('quantidade').notNull(),
  preco_unit: real('preco_unit').notNull(),
  custo_unit: real('custo_unit').notNull(),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const precos = sqliteTable('precos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  produto_id: integer('produto_id').references(() => produtos.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  preco_venda: real('preco_venda').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const custos = sqliteTable('custos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  produto_id: integer('produto_id').references(() => produtos.id),
  custo_compra: real('custo_compra').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const despesas = sqliteTable('despesas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data').notNull(),
  categoria: text('categoria').notNull(),
  rede_id: integer('rede_id').references(() => redes.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  descricao: text('descricao'),
  valor: real('valor').notNull(),
  updated_at: text('updated_at'),
  device_id: text('device_id'),
  synced: integer('synced').default(1),
})

export const configuracoes = sqliteTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor'),
  synced: integer('synced').default(1),
  updated_at: text('updated_at'),
})

export const layoutConfig = sqliteTable(
  'layout_config',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rede_id: integer('rede_id').notNull().references(() => redes.id),
    loja_id: integer('loja_id').notNull().references(() => lojas.id),
    produto_ids: text('produto_ids').notNull().default('[]'),
    synced: integer('synced').default(0),
    updated_at: text('updated_at'),
  },
  (t) => ({
    uniqueLayout: uniqueIndex('unique_layout').on(t.rede_id, t.loja_id),
  })
)

export const estoqueEntradas = sqliteTable(
  'estoque_entradas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    produto_id: integer('produto_id').notNull().references(() => produtos.id),
    data: text('data').notNull(),           // 'YYYY-MM-DD'
    quantidade: real('quantidade').notNull(),
    synced: integer('synced').default(0),
    device_id: text('device_id'),
    updated_at: text('updated_at'),
  },
  (t) => ({
    uniqueEntrada: uniqueIndex('uq_estoque_entrada').on(t.produto_id, t.data),
  })
)

// --- Relations ---
export const redesRelations = relations(redes, ({ many }) => ({
  lojas: many(lojas),
  produtos: many(produtos),
  pedidos: many(pedidos),
}))

export const lojasRelations = relations(lojas, ({ one, many }) => ({
  rede: one(redes, { fields: [lojas.rede_id], references: [redes.id] }),
  franqueado: one(franqueados, { fields: [lojas.franqueado_id], references: [franqueados.id] }),
  pedidos: many(pedidos),
  precos: many(precos),
}))

export const franqueadosRelations = relations(franqueados, ({ many }) => ({
  lojas: many(lojas),
}))

export const produtosRelations = relations(produtos, ({ one, many }) => ({
  rede: one(redes, { fields: [produtos.rede_id], references: [redes.id] }),
  precos: many(precos),
  custos: many(custos),
  itensPedido: many(itensPedido),
}))

export const pedidosRelations = relations(pedidos, ({ one, many }) => ({
  rede: one(redes, { fields: [pedidos.rede_id], references: [redes.id] }),
  loja: one(lojas, { fields: [pedidos.loja_id], references: [lojas.id] }),
  itensPedido: many(itensPedido),
}))

export const itensPedidoRelations = relations(itensPedido, ({ one }) => ({
  pedido: one(pedidos, { fields: [itensPedido.pedido_id], references: [pedidos.id] }),
  produto: one(produtos, { fields: [itensPedido.produto_id], references: [produtos.id] }),
}))

export const precosRelations = relations(precos, ({ one }) => ({
  produto: one(produtos, { fields: [precos.produto_id], references: [produtos.id] }),
  loja: one(lojas, { fields: [precos.loja_id], references: [lojas.id] }),
}))

export const custosRelations = relations(custos, ({ one }) => ({
  produto: one(produtos, { fields: [custos.produto_id], references: [produtos.id] }),
}))

export const despesasRelations = relations(despesas, ({ one }) => ({
  rede: one(redes, { fields: [despesas.rede_id], references: [redes.id] }),
  loja: one(lojas, { fields: [despesas.loja_id], references: [lojas.id] }),
}))

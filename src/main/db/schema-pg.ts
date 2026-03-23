// src/main/db/schema-pg.ts
import { pgTable, serial, integer, text, doublePrecision, unique } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

export const redes = pgTable('redes', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  cor_tema: text('cor_tema'),
  ativo: integer('ativo').default(1),
})

export const franqueados = pgTable('franqueados', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
})

export const lojas = pgTable('lojas', {
  id: serial('id').primaryKey(),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  codigo: text('codigo'),
  cnpj: text('cnpj'),
  ativo: integer('ativo').default(1),
  franqueado_id: integer('franqueado_id').references(() => franqueados.id),
})

export const produtos = pgTable('produtos', {
  id: serial('id').primaryKey(),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  unidade: text('unidade').notNull(),
  ordem_exibicao: integer('ordem_exibicao').default(0),
  ativo: integer('ativo').default(1),
})

export const pedidos = pgTable(
  'pedidos',
  {
    id: serial('id').primaryKey(),
    rede_id: integer('rede_id').references(() => redes.id),
    loja_id: integer('loja_id').references(() => lojas.id),
    data_pedido: text('data_pedido').notNull(),
    numero_oc: text('numero_oc').notNull(),
    observacoes: text('observacoes'),
    criado_em: text('criado_em').default(sql`now()`),
    status_pagamento: text('status_pagamento').default('aberto'),
  },
  (t) => ({
    uniquePedido: unique().on(t.rede_id, t.loja_id, t.data_pedido, t.numero_oc),
  })
)

export const itensPedido = pgTable('itens_pedido', {
  id: serial('id').primaryKey(),
  pedido_id: integer('pedido_id').references(() => pedidos.id, { onDelete: 'cascade' }),
  produto_id: integer('produto_id').references(() => produtos.id),
  quantidade: doublePrecision('quantidade').notNull(),
  preco_unit: doublePrecision('preco_unit').notNull(),
  custo_unit: doublePrecision('custo_unit').notNull(),
})

export const precos = pgTable('precos', {
  id: serial('id').primaryKey(),
  produto_id: integer('produto_id').references(() => produtos.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  preco_venda: doublePrecision('preco_venda').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
})

export const custos = pgTable('custos', {
  id: serial('id').primaryKey(),
  produto_id: integer('produto_id').references(() => produtos.id),
  custo_compra: doublePrecision('custo_compra').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'),
})

export const despesas = pgTable('despesas', {
  id: serial('id').primaryKey(),
  data: text('data').notNull(),
  categoria: text('categoria').notNull(),
  rede_id: integer('rede_id').references(() => redes.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  descricao: text('descricao'),
  valor: doublePrecision('valor').notNull(),
})

export const configuracoes = pgTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor'),
})

// Relations
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

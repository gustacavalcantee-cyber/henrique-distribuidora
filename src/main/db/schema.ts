// src/main/db/schema.ts
import { sqliteTable, integer, text, real, unique } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

export const redes = sqliteTable('redes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  cor_tema: text('cor_tema'),
  ativo: integer('ativo').default(1),
})

export const lojas = sqliteTable('lojas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').references(() => redes.id),
  nome: text('nome').notNull(),
  codigo: text('codigo'),
  ativo: integer('ativo').default(1),
})

export const produtos = sqliteTable('produtos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rede_id: integer('rede_id').references(() => redes.id), // NULL = produto global
  nome: text('nome').notNull(),
  unidade: text('unidade').notNull(), // 'UN' ou 'KG'
  ordem_exibicao: integer('ordem_exibicao').default(0),
  ativo: integer('ativo').default(1),
})

export const pedidos = sqliteTable(
  'pedidos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rede_id: integer('rede_id').references(() => redes.id),
    loja_id: integer('loja_id').references(() => lojas.id),
    data_pedido: text('data_pedido').notNull(), // ISO date YYYY-MM-DD
    numero_oc: text('numero_oc').notNull(),
    observacoes: text('observacoes'),
    criado_em: text('criado_em').default(sql`(datetime('now'))`),
  },
  (t) => ({
    uniquePedido: unique().on(t.rede_id, t.loja_id, t.data_pedido, t.numero_oc),
  })
)

export const itensPedido = sqliteTable('itens_pedido', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pedido_id: integer('pedido_id').references(() => pedidos.id, { onDelete: 'cascade' }),
  produto_id: integer('produto_id').references(() => produtos.id),
  quantidade: real('quantidade').notNull(),
  preco_unit: real('preco_unit').notNull(),
  custo_unit: real('custo_unit').notNull(),
})

export const precos = sqliteTable('precos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  produto_id: integer('produto_id').references(() => produtos.id),
  loja_id: integer('loja_id').references(() => lojas.id), // preço por loja
  preco_venda: real('preco_venda').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'), // NULL = vigente
})

export const custos = sqliteTable('custos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  produto_id: integer('produto_id').references(() => produtos.id),
  custo_compra: real('custo_compra').notNull(),
  vigencia_inicio: text('vigencia_inicio').notNull(),
  vigencia_fim: text('vigencia_fim'), // NULL = vigente
})

export const despesas = sqliteTable('despesas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data').notNull(),
  categoria: text('categoria').notNull(),
  rede_id: integer('rede_id').references(() => redes.id),
  loja_id: integer('loja_id').references(() => lojas.id),
  descricao: text('descricao'),
  valor: real('valor').notNull(),
})

export const configuracoes = sqliteTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor'),
})

// Relations (required for db.query.*.findMany with `with:`)
export const redesRelations = relations(redes, ({ many }) => ({
  lojas: many(lojas),
  produtos: many(produtos),
  pedidos: many(pedidos),
}))

export const lojasRelations = relations(lojas, ({ one, many }) => ({
  rede: one(redes, { fields: [lojas.rede_id], references: [redes.id] }),
  pedidos: many(pedidos),
  precos: many(precos),
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

// src/main/db/seed.ts
import { getDb } from './client'
import { redes, lojas, produtos, configuracoes } from './schema'

export async function seedIfEmpty() {
  const db = getDb()

  // Only seed if no redes exist
  const existingRedes = db.select().from(redes).all()
  if (existingRedes.length > 0) return

  // Configurações
  db.insert(configuracoes)
    .values([
      { chave: 'nome_fornecedor', valor: 'HENRIQUE' },
      { chave: 'telefone', valor: '98127-2205' },
    ])
    .run()

  // Redes
  const [subwayRede] = db
    .insert(redes)
    .values({ nome: 'Subway', cor_tema: '#1a7a3a' })
    .returning()
    .all()
  const [bobsRede] = db
    .insert(redes)
    .values({ nome: "Bob's", cor_tema: '#c0392b' })
    .returning()
    .all()

  // Produtos Subway
  const subwayProdutos = [
    { nome: 'Alface', unidade: 'UN' },
    { nome: 'Cebola Roxa', unidade: 'KG' },
    { nome: 'Pepino', unidade: 'KG' },
    { nome: 'Pimentão', unidade: 'KG' },
    { nome: 'Tomate', unidade: 'KG' },
  ]
  for (let i = 0; i < subwayProdutos.length; i++) {
    db.insert(produtos)
      .values({ ...subwayProdutos[i], rede_id: subwayRede.id, ordem_exibicao: i })
      .run()
  }

  // Produtos Bob's
  const bobsProdutos = [
    { nome: 'Alface USA', unidade: 'UN' },
    { nome: 'Alface', unidade: 'UN' },
    { nome: 'Cebola', unidade: 'KG' },
    { nome: 'Cebola Roxa', unidade: 'KG' },
    { nome: 'Tomate', unidade: 'KG' },
    { nome: 'Repolho Branco', unidade: 'KG' },
  ]
  for (let i = 0; i < bobsProdutos.length; i++) {
    db.insert(produtos)
      .values({ ...bobsProdutos[i], rede_id: bobsRede.id, ordem_exibicao: i })
      .run()
  }
}

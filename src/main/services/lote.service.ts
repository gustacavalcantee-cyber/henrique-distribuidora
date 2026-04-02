// src/main/services/lote.service.ts
// Batch data loader for "Emissão em Lote" — quinzena totals per loja

import { getRawSqlite } from '../db/client-local'
import type { LoteItem } from '../../shared/types'

function sqlite() {
  return getRawSqlite()
}

function padMes(mes: number) {
  return String(mes).padStart(2, '0')
}

function getQuinzenaDates(mes: number, ano: number, quinzena: 1 | 2): { inicio: string; fim: string } {
  const m = padMes(mes)
  if (quinzena === 1) {
    return { inicio: `${ano}-${m}-01`, fim: `${ano}-${m}-15` }
  }
  const lastDay = new Date(ano, mes, 0).getDate()
  return { inicio: `${ano}-${m}-16`, fim: `${ano}-${m}-${String(lastDay).padStart(2, '0')}` }
}

export function getLoteQuinzena(mes: number, ano: number, quinzena: 1 | 2): LoteItem[] {
  const { inicio, fim } = getQuinzenaDates(mes, ano, quinzena)
  return sqlite().prepare(`
    SELECT
      l.id          AS loja_id,
      l.nome        AS loja_nome,
      l.cnpj,
      l.razao_social,
      l.endereco,
      l.municipio,
      l.uf,
      l.cep,
      f.id          AS franqueado_id,
      f.nome        AS franqueado_nome,
      COALESCE(SUM(ip.quantidade * ip.preco_unit), 0) AS total_venda
    FROM lojas l
    LEFT JOIN franqueados f ON f.id = l.franqueado_id
    LEFT JOIN pedidos p
      ON p.loja_id = l.id
      AND p.data_pedido >= ?
      AND p.data_pedido <= ?
    LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
    WHERE l.ativo = 1
    GROUP BY l.id
    HAVING total_venda > 0
    ORDER BY COALESCE(f.nome, 'ZZZZ'), l.nome
  `).all(inicio, fim) as LoteItem[]
}

// src/main/services/boleto.service.ts
// Banco Inter boleto (cobrança) integration + local CRUD
// Inter API v3: https://cdpj.partners.bancointer.com.br
// Auth: OAuth2 mTLS (client_credentials) with .crt/.key certificate files

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Banco, BoletoDraft, BoletoSalvo, InterConfig } from '../../shared/types'

const BASE_URL_PROD = 'https://cdpj.partners.bancointer.com.br'
const BASE_URL_SANDBOX = 'https://cdpj-sandbox.partners.uatinter.co'

// -----------------------------------------------------------------------
// Local DB helpers (raw sqlite via getDb)
// -----------------------------------------------------------------------

function getDb() {
  // lazy import to avoid circular deps
  const { getDb: _getDb } = require('../db/client-local')
  return _getDb()
}

function sqlite() {
  const db = getDb()
  return (db as any).$client
}

// -----------------------------------------------------------------------
// Banco CRUD
// -----------------------------------------------------------------------

export function listBancos(): Banco[] {
  return sqlite().prepare('SELECT * FROM bancos WHERE ativo=1 ORDER BY nome').all() as Banco[]
}

export function createBanco(data: Omit<Banco, 'id'>): Banco {
  const stmt = sqlite().prepare(`
    INSERT INTO bancos (nome, codigo, provedor, ativo, client_id, client_secret, cert_path, key_path, conta, agencia)
    VALUES (@nome, @codigo, @provedor, @ativo, @client_id, @client_secret, @cert_path, @key_path, @conta, @agencia)
  `)
  const result = stmt.run({
    nome: data.nome,
    codigo: data.codigo ?? '',
    provedor: data.provedor ?? 'manual',
    ativo: data.ativo ?? 1,
    client_id: data.client_id ?? null,
    client_secret: data.client_secret ?? null,
    cert_path: data.cert_path ?? null,
    key_path: data.key_path ?? null,
    conta: data.conta ?? null,
    agencia: data.agencia ?? null,
  })
  return sqlite().prepare('SELECT * FROM bancos WHERE id=?').get(result.lastInsertRowid) as Banco
}

export function updateBanco(data: Partial<Banco> & { id: number }): Banco {
  const { id, ...fields } = data
  const sets = Object.keys(fields).map(k => `${k}=@${k}`).join(', ')
  sqlite().prepare(`UPDATE bancos SET ${sets} WHERE id=@id`).run({ ...fields, id })
  return sqlite().prepare('SELECT * FROM bancos WHERE id=?').get(id) as Banco
}

export function deleteBanco(id: number): void {
  sqlite().prepare('UPDATE bancos SET ativo=0 WHERE id=?').run(id)
}

// -----------------------------------------------------------------------
// Inter config (stored in configuracoes key-value table)
// -----------------------------------------------------------------------

export function getInterConfig(banco_id: number): InterConfig | null {
  const row = sqlite()
    .prepare("SELECT value FROM configuracoes WHERE key=?")
    .get(`inter_config_${banco_id}`)
  if (!row) return null
  try { return JSON.parse((row as any).value) } catch { return null }
}

export function setInterConfig(banco_id: number, config: InterConfig): void {
  const key = `inter_config_${banco_id}`
  const value = JSON.stringify(config)
  const existing = sqlite().prepare("SELECT key FROM configuracoes WHERE key=?").get(key)
  if (existing) {
    sqlite().prepare("UPDATE configuracoes SET value=? WHERE key=?").run(value, key)
  } else {
    sqlite().prepare("INSERT INTO configuracoes (key, value) VALUES (?, ?)").run(key, value)
  }
  // Also update banco table fields
  sqlite().prepare(`
    UPDATE bancos SET client_id=@client_id, client_secret=@client_secret,
    cert_path=@cert_path, key_path=@key_path, conta=@conta, agencia=@agencia
    WHERE id=@id
  `).run({
    client_id: config.client_id,
    client_secret: config.client_secret,
    cert_path: config.cert_path,
    key_path: config.key_path,
    conta: config.conta,
    agencia: config.agencia,
    id: banco_id,
  })
}

// -----------------------------------------------------------------------
// Boleto CRUD
// -----------------------------------------------------------------------

export function listBoletos(filters?: { loja_id?: number; status?: string; banco_id?: number }): BoletoSalvo[] {
  let query = `
    SELECT b.*, bk.nome as banco_nome
    FROM boletos b
    LEFT JOIN bancos bk ON b.banco_id = bk.id
    WHERE 1=1
  `
  const params: Record<string, unknown> = {}
  if (filters?.loja_id) { query += ' AND b.loja_id=@loja_id'; params.loja_id = filters.loja_id }
  if (filters?.status) { query += ' AND b.status=@status'; params.status = filters.status }
  if (filters?.banco_id) { query += ' AND b.banco_id=@banco_id'; params.banco_id = filters.banco_id }
  query += ' ORDER BY b.criado_em DESC LIMIT 200'
  return sqlite().prepare(query).all(params) as BoletoSalvo[]
}

function saveBoletoLocal(draft: BoletoDraft, result: {
  nosso_numero?: string
  linha_digitavel?: string
  codigo_barras?: string
  inter_id?: string
  pdf_path?: string
  status?: string
}): BoletoSalvo {
  const stmt = sqlite().prepare(`
    INSERT INTO boletos (
      banco_id, loja_id, pedido_id,
      sacado_nome, sacado_cpf_cnpj, sacado_endereco, sacado_cidade, sacado_uf, sacado_cep,
      valor, vencimento, descricao, numero_documento,
      nosso_numero, linha_digitavel, codigo_barras, status, pdf_path, inter_id
    ) VALUES (
      @banco_id, @loja_id, @pedido_id,
      @sacado_nome, @sacado_cpf_cnpj, @sacado_endereco, @sacado_cidade, @sacado_uf, @sacado_cep,
      @valor, @vencimento, @descricao, @numero_documento,
      @nosso_numero, @linha_digitavel, @codigo_barras, @status, @pdf_path, @inter_id
    )
  `)
  const run = stmt.run({
    banco_id: draft.banco_id,
    loja_id: draft.loja_id ?? null,
    pedido_id: draft.pedido_id ?? null,
    sacado_nome: draft.sacado.nome,
    sacado_cpf_cnpj: draft.sacado.cpf_cnpj,
    sacado_endereco: draft.sacado.endereco,
    sacado_cidade: draft.sacado.cidade,
    sacado_uf: draft.sacado.uf,
    sacado_cep: draft.sacado.cep,
    valor: draft.valor,
    vencimento: draft.vencimento,
    descricao: draft.descricao,
    numero_documento: draft.numero_documento,
    nosso_numero: result.nosso_numero ?? null,
    linha_digitavel: result.linha_digitavel ?? null,
    codigo_barras: result.codigo_barras ?? null,
    status: result.status ?? 'emitido',
    pdf_path: result.pdf_path ?? null,
    inter_id: result.inter_id ?? null,
  })
  return sqlite()
    .prepare('SELECT b.*, bk.nome as banco_nome FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(run.lastInsertRowid) as BoletoSalvo
}

// -----------------------------------------------------------------------
// Inter API OAuth2 token (mTLS)
// -----------------------------------------------------------------------

interface TokenCache { token: string; expires_at: number }
const tokenCache = new Map<number, TokenCache>()

async function getInterToken(banco_id: number, config: InterConfig): Promise<string> {
  const cached = tokenCache.get(banco_id)
  if (cached && Date.now() < cached.expires_at - 30_000) return cached.token

  const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD

  if (!existsSync(config.cert_path)) throw new Error(`Certificado não encontrado: ${config.cert_path}`)
  if (!existsSync(config.key_path)) throw new Error(`Chave privada não encontrada: ${config.key_path}`)

  const cert = readFileSync(config.cert_path)
  const key = readFileSync(config.key_path)

  // Use undici (Node 18+) with certificate for mTLS
  const { Agent, request } = await import('undici')
  const agent = new Agent({ connect: { cert, key, rejectUnauthorized: config.ambiente !== 'sandbox' } })

  const body = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    grant_type: 'client_credentials',
    scope: 'cobranca.read cobranca.write',
  })

  const { statusCode, body: resBody } = await request(`${baseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    dispatcher: agent,
  })

  const json = await resBody.json() as any
  if (statusCode !== 200) throw new Error(`Token error ${statusCode}: ${JSON.stringify(json)}`)

  const token: TokenCache = { token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 }
  tokenCache.set(banco_id, token)
  return token.token
}

// -----------------------------------------------------------------------
// Emitir boleto via Inter API
// -----------------------------------------------------------------------

export async function emitirBoleto(draft: BoletoDraft): Promise<BoletoSalvo> {
  const banco = sqlite().prepare('SELECT * FROM bancos WHERE id=?').get(draft.banco_id) as Banco | null
  if (!banco) throw new Error('Banco não encontrado')

  if (banco.provedor === 'inter') {
    return emitirBoletoInter(draft, banco)
  }

  // Manual / outros bancos — só salva localmente sem API
  return saveBoletoLocal(draft, { status: 'emitido' })
}

async function emitirBoletoInter(draft: BoletoDraft, banco: Banco): Promise<BoletoSalvo> {
  const config = getInterConfig(banco.id)
  if (!config) throw new Error('Configuração Inter não encontrada. Configure as credenciais na aba Bancos.')

  const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
  const token = await getInterToken(banco.id, config)

  const { Agent, request } = await import('undici')
  const agent = new Agent({
    connect: {
      cert: readFileSync(config.cert_path),
      key: readFileSync(config.key_path),
      rejectUnauthorized: config.ambiente !== 'sandbox',
    }
  })

  const payload: Record<string, unknown> = {
    seuNumero: draft.numero_documento,
    valorNominal: draft.valor,
    dataVencimento: draft.vencimento,
    numDiasAgenda: 30,
    pagador: {
      cpfCnpj: draft.sacado.cpf_cnpj.replace(/\D/g, ''),
      tipoPessoa: draft.sacado.cpf_cnpj.replace(/\D/g, '').length <= 11 ? 'FISICA' : 'JURIDICA',
      nome: draft.sacado.nome,
      endereco: draft.sacado.endereco,
      cidade: draft.sacado.cidade,
      uf: draft.sacado.uf,
      cep: draft.sacado.cep.replace(/\D/g, ''),
    },
  }

  if (draft.descricao) {
    payload.mensagem = { linha1: draft.descricao.substring(0, 77) }
  }
  if (draft.dias_multa && draft.dias_multa > 0) {
    payload.multa = { codigoMulta: 'PERCENTUAL', data: draft.vencimento, taxa: draft.dias_multa }
  }
  if (draft.juros_mensal && draft.juros_mensal > 0) {
    payload.juros = { codigoJuros: 'TAXAMENSAL', data: draft.vencimento, taxa: draft.juros_mensal }
  }
  if (draft.desconto_valor && draft.desconto_data) {
    payload.desconto = {
      codigoDesconto: 'VALORFIXODATAINFORMADA',
      descontos: [{ data: draft.desconto_data, taxa: 0, valor: draft.desconto_valor }],
    }
  }

  const { statusCode, body: resBody } = await request(
    `${baseUrl}/cobranca/v3/cobrancas`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-conta-corrente': config.conta,
      },
      body: JSON.stringify(payload),
      dispatcher: agent,
    }
  )

  const json = await resBody.json() as any
  if (statusCode !== 200 && statusCode !== 201) {
    throw new Error(`Inter API error ${statusCode}: ${JSON.stringify(json)}`)
  }

  const nosso_numero: string = json.nossoNumero ?? ''
  let linha_digitavel = json.linhaDigitavel ?? ''
  let codigo_barras = json.codigoBarras ?? ''

  // Fetch PDF
  let pdf_path: string | undefined
  try {
    pdf_path = await downloadBoletoPdf(banco.id, config, nosso_numero)
  } catch {
    // non-fatal, PDF can be re-fetched later
  }

  return saveBoletoLocal(draft, { nosso_numero, linha_digitavel, codigo_barras, inter_id: nosso_numero, pdf_path, status: 'emitido' })
}

// -----------------------------------------------------------------------
// PDF
// -----------------------------------------------------------------------

async function downloadBoletoPdf(banco_id: number, config: InterConfig, nosso_numero: string): Promise<string> {
  const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
  const token = await getInterToken(banco_id, config)

  const { Agent, request } = await import('undici')
  const agent = new Agent({
    connect: {
      cert: readFileSync(config.cert_path),
      key: readFileSync(config.key_path),
      rejectUnauthorized: config.ambiente !== 'sandbox',
    }
  })

  const { statusCode, body: resBody } = await request(
    `${baseUrl}/cobranca/v3/cobrancas/${nosso_numero}/pdf`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-conta-corrente': config.conta,
      },
      dispatcher: agent,
    }
  )

  if (statusCode !== 200) throw new Error(`PDF error ${statusCode}`)

  const json = await resBody.json() as any
  // Inter returns base64-encoded PDF
  const base64 = json.pdf as string
  const pdfBuffer = Buffer.from(base64, 'base64')

  const pdfDir = join(app.getPath('userData'), 'boletos')
  const { mkdirSync } = await import('fs')
  mkdirSync(pdfDir, { recursive: true })
  const pdfPath = join(pdfDir, `boleto_${nosso_numero}.pdf`)
  writeFileSync(pdfPath, pdfBuffer)
  return pdfPath
}

export async function getBoletosPdf(boleto_id: number): Promise<string> {
  const row = sqlite()
    .prepare('SELECT b.*, bk.* FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(boleto_id) as any
  if (!row) throw new Error('Boleto não encontrado')

  if (row.pdf_path && existsSync(row.pdf_path)) return row.pdf_path

  if (row.provedor === 'inter' && row.nosso_numero) {
    const config = getInterConfig(row.banco_id)
    if (!config) throw new Error('Config Inter não encontrada')
    const path = await downloadBoletoPdf(row.banco_id, config, row.nosso_numero)
    sqlite().prepare('UPDATE boletos SET pdf_path=? WHERE id=?').run(path, boleto_id)
    return path
  }

  throw new Error('PDF não disponível para este boleto')
}

// -----------------------------------------------------------------------
// Cancelar boleto
// -----------------------------------------------------------------------

export async function cancelarBoleto(boleto_id: number, motivo: string = 'ACERTOS'): Promise<void> {
  const row = sqlite()
    .prepare('SELECT b.*, bk.provedor, bk.conta FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(boleto_id) as any
  if (!row) throw new Error('Boleto não encontrado')

  if (row.provedor === 'inter' && row.nosso_numero) {
    const config = getInterConfig(row.banco_id)
    if (!config) throw new Error('Config Inter não encontrada')

    const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
    const token = await getInterToken(row.banco_id, config)

    const { Agent, request } = await import('undici')
    const agent = new Agent({
      connect: {
        cert: readFileSync(config.cert_path),
        key: readFileSync(config.key_path),
        rejectUnauthorized: config.ambiente !== 'sandbox',
      }
    })

    const { statusCode } = await request(
      `${baseUrl}/cobranca/v3/cobrancas/${row.nosso_numero}/cancelar`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-conta-corrente': config.conta,
        },
        body: JSON.stringify({ motivoCancelamento: motivo }),
        dispatcher: agent,
      }
    )

    if (statusCode !== 200 && statusCode !== 204) throw new Error(`Cancelamento error ${statusCode}`)
  }

  sqlite().prepare("UPDATE boletos SET status='cancelado' WHERE id=?").run(boleto_id)
}

// -----------------------------------------------------------------------
// Consultar status via Inter API
// -----------------------------------------------------------------------

export async function consultarBoleto(boleto_id: number): Promise<{ status: string; situacao?: string }> {
  const row = sqlite()
    .prepare('SELECT b.*, bk.provedor, bk.conta FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(boleto_id) as any
  if (!row) throw new Error('Boleto não encontrado')

  if (row.provedor === 'inter' && row.nosso_numero) {
    const config = getInterConfig(row.banco_id)
    if (!config) throw new Error('Config Inter não encontrada')

    const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
    const token = await getInterToken(row.banco_id, config)

    const { Agent, request } = await import('undici')
    const agent = new Agent({
      connect: {
        cert: readFileSync(config.cert_path),
        key: readFileSync(config.key_path),
        rejectUnauthorized: config.ambiente !== 'sandbox',
      }
    })

    const { statusCode, body: resBody } = await request(
      `${baseUrl}/cobranca/v3/cobrancas/${row.nosso_numero}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-conta-corrente': config.conta,
        },
        dispatcher: agent,
      }
    )

    const json = await resBody.json() as any
    if (statusCode !== 200) throw new Error(`Consulta error ${statusCode}`)

    const situacao: string = json.situacao ?? json.status ?? 'EMABERTO'
    // Map Inter status → local status
    const statusMap: Record<string, string> = {
      PAGO: 'pago', CANCELADO: 'cancelado', VENCIDO: 'vencido',
      EMABERTO: 'emitido', EXPIRADO: 'vencido',
    }
    const newStatus = statusMap[situacao] ?? 'emitido'
    sqlite().prepare("UPDATE boletos SET status=? WHERE id=?").run(newStatus, boleto_id)
    return { status: newStatus, situacao }
  }

  return { status: row.status }
}

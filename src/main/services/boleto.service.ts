// src/main/services/boleto.service.ts
// Banco Inter boleto (cobrança) integration + local CRUD
// Inter API v3: https://cdpj.partners.bancointer.com.br
// Auth: OAuth2 mTLS (client_credentials) with .crt/.key certificate files

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import https from 'node:https'
import { URL } from 'node:url'
import { app } from 'electron'
import type { Banco, BoletoDraft, BoletoSalvo, InterConfig } from '../../shared/types'

const BASE_URL_PROD = 'https://cdpj.partners.bancointer.com.br'
const BASE_URL_SANDBOX = 'https://cdpj-sandbox.partners.uatinter.co'

// -----------------------------------------------------------------------
// Lightweight mTLS HTTPS helper (no external dependencies)
// -----------------------------------------------------------------------

interface MtlsReqOptions {
  method: string
  url: string
  cert: Buffer
  key: Buffer
  rejectUnauthorized: boolean
  headers?: Record<string, string>
  body?: string
}

interface MtlsResponse {
  statusCode: number
  json<T = unknown>(): T
  asBuffer(): Buffer
}

function mtlsRequest(opts: MtlsReqOptions): Promise<MtlsResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(opts.url)
    const agent = new https.Agent({
      cert: opts.cert,
      key: opts.key,
      rejectUnauthorized: opts.rejectUnauthorized,
    })

    const headers: Record<string, string> = { ...(opts.headers ?? {}) }
    if (opts.body) {
      headers['Content-Length'] = String(Buffer.byteLength(opts.body))
    }

    const reqOpts: https.RequestOptions = {
      hostname: parsed.hostname,
      port: Number(parsed.port) || 443,
      path: parsed.pathname + parsed.search,
      method: opts.method,
      headers,
      agent,
    }

    const req = https.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({
          statusCode: res.statusCode ?? 0,
          json<T>() { return JSON.parse(buf.toString('utf8')) as T },
          asBuffer() { return buf },
        })
      })
    })

    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

// -----------------------------------------------------------------------
// Local DB helpers
// -----------------------------------------------------------------------

function getDb() {
  const { getDb: _getDb } = require('../db/client-local') as { getDb: () => unknown }
  return _getDb()
}

function sqlite() {
  return (getDb() as any).$client
}

// -----------------------------------------------------------------------
// Banco CRUD
// -----------------------------------------------------------------------

export function listBancos(): Banco[] {
  return sqlite().prepare('SELECT * FROM bancos WHERE ativo=1 ORDER BY nome').all() as Banco[]
}

export function createBanco(data: Omit<Banco, 'id'>): Banco {
  const result = sqlite().prepare(`
    INSERT INTO bancos (nome, codigo, provedor, ativo, client_id, client_secret, cert_path, key_path, conta, agencia)
    VALUES (@nome, @codigo, @provedor, @ativo, @client_id, @client_secret, @cert_path, @key_path, @conta, @agencia)
  `).run({
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
// Inter config (key-value in configuracoes table)
// -----------------------------------------------------------------------

export function getInterConfig(banco_id: number): InterConfig | null {
  const row = sqlite().prepare('SELECT value FROM configuracoes WHERE key=?').get(`inter_config_${banco_id}`)
  if (!row) return null
  try { return JSON.parse((row as any).value) as InterConfig } catch { return null }
}

export function setInterConfig(banco_id: number, config: InterConfig): void {
  const key = `inter_config_${banco_id}`
  const value = JSON.stringify(config)
  const existing = sqlite().prepare('SELECT key FROM configuracoes WHERE key=?').get(key)
  if (existing) {
    sqlite().prepare('UPDATE configuracoes SET value=? WHERE key=?').run(value, key)
  } else {
    sqlite().prepare('INSERT INTO configuracoes (key, value) VALUES (?, ?)').run(key, value)
  }
  sqlite().prepare(`
    UPDATE bancos SET client_id=@client_id, client_secret=@client_secret,
    cert_path=@cert_path, key_path=@key_path, conta=@conta, agencia=@agencia
    WHERE id=@id
  `).run({
    client_id: config.client_id, client_secret: config.client_secret,
    cert_path: config.cert_path, key_path: config.key_path,
    conta: config.conta, agencia: config.agencia, id: banco_id,
  })
}

// -----------------------------------------------------------------------
// Boleto list / save
// -----------------------------------------------------------------------

export function listBoletos(filters?: { loja_id?: number; status?: string; banco_id?: number }): BoletoSalvo[] {
  let query = `
    SELECT b.*, bk.nome as banco_nome
    FROM boletos b LEFT JOIN bancos bk ON b.banco_id = bk.id
    WHERE 1=1
  `
  const params: Record<string, unknown> = {}
  if (filters?.loja_id)  { query += ' AND b.loja_id=@loja_id';   params.loja_id  = filters.loja_id }
  if (filters?.status)   { query += ' AND b.status=@status';      params.status   = filters.status }
  if (filters?.banco_id) { query += ' AND b.banco_id=@banco_id';  params.banco_id = filters.banco_id }
  query += ' ORDER BY b.criado_em DESC LIMIT 200'
  return sqlite().prepare(query).all(params) as BoletoSalvo[]
}

function saveBoletoLocal(draft: BoletoDraft, res: {
  nosso_numero?: string; linha_digitavel?: string; codigo_barras?: string
  inter_id?: string; pdf_path?: string; status?: string
}): BoletoSalvo {
  const run = sqlite().prepare(`
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
  `).run({
    banco_id: draft.banco_id, loja_id: draft.loja_id ?? null, pedido_id: draft.pedido_id ?? null,
    sacado_nome: draft.sacado.nome, sacado_cpf_cnpj: draft.sacado.cpf_cnpj,
    sacado_endereco: draft.sacado.endereco, sacado_cidade: draft.sacado.cidade,
    sacado_uf: draft.sacado.uf, sacado_cep: draft.sacado.cep,
    valor: draft.valor, vencimento: draft.vencimento,
    descricao: draft.descricao, numero_documento: draft.numero_documento,
    nosso_numero: res.nosso_numero ?? null, linha_digitavel: res.linha_digitavel ?? null,
    codigo_barras: res.codigo_barras ?? null, status: res.status ?? 'emitido',
    pdf_path: res.pdf_path ?? null, inter_id: res.inter_id ?? null,
  })
  return sqlite()
    .prepare('SELECT b.*, bk.nome as banco_nome FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(run.lastInsertRowid) as BoletoSalvo
}

// -----------------------------------------------------------------------
// Inter OAuth2 token (mTLS)
// -----------------------------------------------------------------------

interface TokenCache { token: string; expires_at: number }
const tokenCache = new Map<number, TokenCache>()

async function getInterToken(banco_id: number, config: InterConfig): Promise<string> {
  const cached = tokenCache.get(banco_id)
  if (cached && Date.now() < cached.expires_at - 30_000) return cached.token

  const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
  if (!existsSync(config.cert_path)) throw new Error(`Certificado não encontrado: ${config.cert_path}`)
  if (!existsSync(config.key_path))  throw new Error(`Chave privada não encontrada: ${config.key_path}`)

  const cert = readFileSync(config.cert_path)
  const key  = readFileSync(config.key_path)

  const body = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    grant_type: 'client_credentials',
    scope: 'boleto-cobranca.read boleto-cobranca.write',
  }).toString()

  const res = await mtlsRequest({
    method: 'POST',
    url: `${baseUrl}/oauth/v2/token`,
    cert, key,
    rejectUnauthorized: config.ambiente !== 'sandbox',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = res.json<any>()
  if (res.statusCode !== 200) throw new Error(`Token error ${res.statusCode}: ${JSON.stringify(json)}`)

  const entry: TokenCache = { token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 }
  tokenCache.set(banco_id, entry)
  return entry.token
}

// -----------------------------------------------------------------------
// Emitir boleto
// -----------------------------------------------------------------------

export async function emitirBoleto(draft: BoletoDraft): Promise<BoletoSalvo> {
  const banco = sqlite().prepare('SELECT * FROM bancos WHERE id=?').get(draft.banco_id) as Banco | null
  if (!banco) throw new Error('Banco não encontrado')
  if (banco.provedor === 'inter') return emitirBoletoInter(draft, banco)
  return saveBoletoLocal(draft, { status: 'emitido' })
}

async function emitirBoletoInter(draft: BoletoDraft, banco: Banco): Promise<BoletoSalvo> {
  const config = getInterConfig(banco.id)
  if (!config) throw new Error('Configuração Inter não encontrada. Configure as credenciais na aba Bancos.')

  const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
  const token = await getInterToken(banco.id, config)
  const cert = readFileSync(config.cert_path)
  const key  = readFileSync(config.key_path)
  const rejectUnauthorized = config.ambiente !== 'sandbox'

  const cpfCnpj = draft.sacado.cpf_cnpj.replace(/\D/g, '')
  const payload: Record<string, unknown> = {
    seuNumero: draft.numero_documento,
    valorNominal: draft.valor,
    dataVencimento: draft.vencimento,
    numDiasAgenda: 30,
    pagador: {
      cpfCnpj,
      tipoPessoa: cpfCnpj.length <= 11 ? 'FISICA' : 'JURIDICA',
      nome: draft.sacado.nome,
      endereco: draft.sacado.endereco,
      cidade: draft.sacado.cidade,
      uf: draft.sacado.uf,
      cep: draft.sacado.cep.replace(/\D/g, ''),
    },
    multa: draft.dias_multa && draft.dias_multa > 0
      ? { codigoMulta: 'PERCENTUAL', data: draft.vencimento, taxa: draft.dias_multa }
      : { codigoMulta: 'NAOTEMMULTA' },
    mora: draft.juros_mensal && draft.juros_mensal > 0
      ? { codigoMora: 'TAXAMENSAL', data: draft.vencimento, taxa: draft.juros_mensal }
      : { codigoMora: 'ISENTO' },
    desconto: draft.desconto_valor && draft.desconto_data
      ? { codigoDesconto: 'VALORFIXODATAINFORMADA', descontos: [{ data: draft.desconto_data, taxa: 0, valor: draft.desconto_valor }] }
      : { codigoDesconto: 'NAOTEMDESCONTO' },
  }
  if (draft.descricao) payload.mensagem = { linha1: draft.descricao.substring(0, 77) }

  const res = await mtlsRequest({
    method: 'POST',
    url: `${baseUrl}/cobranca/v3/cobrancas`,
    cert, key, rejectUnauthorized,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-inter-conta-corrente': config.conta,
    },
    body: JSON.stringify(payload),
  })

  const json = res.json<any>()
  if (res.statusCode !== 200 && res.statusCode !== 201)
    throw new Error(`Inter API error ${res.statusCode}: ${JSON.stringify(json)}`)

  const nosso_numero: string = json.nossoNumero ?? ''
  const codigo_solicitacao: string = json.codigoSolicitacao ?? nosso_numero
  const linha_digitavel: string = json.linhaDigitavel ?? ''
  const codigo_barras: string = json.codigoBarras ?? ''

  let pdf_path: string | undefined
  try { pdf_path = await downloadBoletoPdf(banco.id, config, codigo_solicitacao) } catch { /* non-fatal */ }

  return saveBoletoLocal(draft, { nosso_numero, linha_digitavel, codigo_barras, inter_id: codigo_solicitacao, pdf_path, status: 'emitido' })
}

// -----------------------------------------------------------------------
// PDF download
// -----------------------------------------------------------------------

async function downloadBoletoPdf(banco_id: number, config: InterConfig, identifier: string): Promise<string> {
  const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
  const token = await getInterToken(banco_id, config)
  const cert = readFileSync(config.cert_path)
  const key  = readFileSync(config.key_path)

  const res = await mtlsRequest({
    method: 'GET',
    url: `${baseUrl}/cobranca/v3/cobrancas/${identifier}/pdf`,
    cert, key,
    rejectUnauthorized: config.ambiente !== 'sandbox',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-inter-conta-corrente': config.conta,
    },
  })

  if (res.statusCode !== 200) throw new Error(`PDF error ${res.statusCode}`)

  const pdfDir = join(app.getPath('userData'), 'boletos')
  mkdirSync(pdfDir, { recursive: true })
  const safeName = identifier.replace(/[^a-zA-Z0-9_-]/g, '_')
  const pdfPath = join(pdfDir, `boleto_${safeName}.pdf`)
  writeFileSync(pdfPath, res.asBuffer())
  return pdfPath
}

export async function getBoletosPdf(boleto_id: number): Promise<string> {
  const row = sqlite()
    .prepare('SELECT b.*, bk.* FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(boleto_id) as any
  if (!row) throw new Error('Boleto não encontrado')
  if (row.pdf_path && existsSync(row.pdf_path)) return row.pdf_path as string

  const identifier: string = row.inter_id || row.nosso_numero
  if (row.provedor === 'inter' && identifier) {
    const config = getInterConfig(row.banco_id as number)
    if (!config) throw new Error('Config Inter não encontrada')
    const pdfPath = await downloadBoletoPdf(row.banco_id as number, config, identifier)
    sqlite().prepare('UPDATE boletos SET pdf_path=? WHERE id=?').run(pdfPath, boleto_id)
    return pdfPath
  }
  throw new Error('PDF não disponível para este boleto')
}

// -----------------------------------------------------------------------
// Cancelar
// -----------------------------------------------------------------------

export async function cancelarBoleto(boleto_id: number, motivo = 'ACERTOS'): Promise<void> {
  const row = sqlite()
    .prepare('SELECT b.*, bk.provedor FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(boleto_id) as any
  if (!row) throw new Error('Boleto não encontrado')

  const cancelId: string = row.inter_id || row.nosso_numero
  if (row.provedor === 'inter' && cancelId) {
    const config = getInterConfig(row.banco_id as number)
    if (!config) throw new Error('Config Inter não encontrada')

    const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
    const token = await getInterToken(row.banco_id as number, config)
    const cert = readFileSync(config.cert_path)
    const key  = readFileSync(config.key_path)

    const res = await mtlsRequest({
      method: 'POST',
      url: `${baseUrl}/cobranca/v3/cobrancas/${cancelId}/cancelar`,
      cert, key,
      rejectUnauthorized: config.ambiente !== 'sandbox',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-inter-conta-corrente': config.conta,
      },
      body: JSON.stringify({ motivoCancelamento: motivo }),
    })

    if (res.statusCode !== 200 && res.statusCode !== 204)
      throw new Error(`Cancelamento error ${res.statusCode}`)
  }

  sqlite().prepare("UPDATE boletos SET status='cancelado' WHERE id=?").run(boleto_id)
}

// -----------------------------------------------------------------------
// Consultar status
// -----------------------------------------------------------------------

export async function consultarBoleto(boleto_id: number): Promise<{ status: string; situacao?: string }> {
  const row = sqlite()
    .prepare('SELECT b.*, bk.provedor FROM boletos b LEFT JOIN bancos bk ON b.banco_id=bk.id WHERE b.id=?')
    .get(boleto_id) as any
  if (!row) throw new Error('Boleto não encontrado')

  const consultaId: string = row.inter_id || row.nosso_numero
  if (row.provedor === 'inter' && consultaId) {
    const config = getInterConfig(row.banco_id as number)
    if (!config) throw new Error('Config Inter não encontrada')

    const baseUrl = config.ambiente === 'sandbox' ? BASE_URL_SANDBOX : BASE_URL_PROD
    const token = await getInterToken(row.banco_id as number, config)
    const cert = readFileSync(config.cert_path)
    const key  = readFileSync(config.key_path)

    const res = await mtlsRequest({
      method: 'GET',
      url: `${baseUrl}/cobranca/v3/cobrancas/${consultaId}`,
      cert, key,
      rejectUnauthorized: config.ambiente !== 'sandbox',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-inter-conta-corrente': config.conta,
      },
    })

    const json = res.json<any>()
    if (res.statusCode !== 200) throw new Error(`Consulta error ${res.statusCode}`)

    const situacao: string = json.situacao ?? json.status ?? 'EMABERTO'
    const statusMap: Record<string, string> = {
      PAGO: 'pago', CANCELADO: 'cancelado', VENCIDO: 'vencido', EMABERTO: 'emitido', EXPIRADO: 'vencido',
    }
    const newStatus = statusMap[situacao] ?? 'emitido'
    sqlite().prepare('UPDATE boletos SET status=? WHERE id=?').run(newStatus, boleto_id)
    return { status: newStatus, situacao }
  }

  return { status: row.status as string }
}

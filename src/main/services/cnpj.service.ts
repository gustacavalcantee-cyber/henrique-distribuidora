// Looks up a company's public registration data by CNPJ.
// CNPJ.ws is the only free source that also returns the Inscrição Estadual, but its
// public tier allows about 3 lookups per minute, so BrasilAPI covers the rest (without IE).

export interface DadosCnpj {
  cnpj: string
  razao_social: string
  endereco: string
  bairro: string
  cep: string
  municipio: string
  uf: string
  ie: string
  telefone: string
}

const limpar = (texto: unknown) => String(texto ?? '').replace(/\s+/g, ' ').trim()

export const formatarCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const formatarCep = (d: string) => limpar(d).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')

function formatarTelefone(ddd: unknown, numero: unknown): string {
  const n = limpar(numero).replace(/\D/g, '')
  if (!n) return ''
  const local = n.length === 9 ? n.replace(/^(\d{5})(\d{4})$/, '$1-$2') : n.replace(/^(\d{4})(\d{4})$/, '$1-$2')
  const d = limpar(ddd).replace(/\D/g, '')
  return d ? `(${d}) ${local}` : local
}

function montarEndereco(rua: string, numero: unknown, complemento: unknown): string {
  const num = limpar(numero)
  const comp = limpar(complemento)
  return `${rua}${num ? ', ' + num : ''}${comp ? ' - ' + comp : ''}`
}

async function buscarJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'HenriqueVendas/1.0' }, signal: AbortSignal.timeout(15000) })
  if (res.status === 404 || res.status === 400) throw new Error('CNPJ não encontrado na Receita Federal')
  if (!res.ok) throw new Error(`Serviço respondeu ${res.status}`)
  return res.json()
}

async function viaCnpjWs(digitos: string): Promise<DadosCnpj> {
  const d = await buscarJson(`https://publica.cnpj.ws/cnpj/${digitos}`)
  const e = d.estabelecimento ?? {}
  const uf = limpar(e.estado?.sigla)
  const inscricoes: any[] = e.inscricoes_estaduais ?? []
  const ie = inscricoes.find(i => i.ativo && i.estado?.sigla === uf) ?? inscricoes.find(i => i.ativo) ?? inscricoes[0]
  return {
    cnpj: formatarCnpj(digitos),
    razao_social: limpar(d.razao_social),
    endereco: montarEndereco(limpar(`${e.tipo_logradouro ?? ''} ${e.logradouro ?? ''}`), e.numero, e.complemento),
    bairro: limpar(e.bairro),
    cep: formatarCep(e.cep),
    municipio: limpar(e.cidade?.nome),
    uf,
    ie: limpar(ie?.inscricao_estadual),
    telefone: formatarTelefone(e.ddd1, e.telefone1),
  }
}

async function viaBrasilApi(digitos: string): Promise<DadosCnpj> {
  const d = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`)
  const tel = limpar(d.ddd_telefone_1).replace(/\D/g, '')
  return {
    cnpj: formatarCnpj(digitos),
    razao_social: limpar(d.razao_social),
    endereco: montarEndereco(limpar(`${d.descricao_tipo_de_logradouro ?? ''} ${d.logradouro ?? ''}`), d.numero, d.complemento),
    bairro: limpar(d.bairro),
    cep: formatarCep(d.cep),
    municipio: limpar(d.municipio),
    uf: limpar(d.uf),
    ie: '',
    telefone: formatarTelefone(tel.slice(0, 2), tel.slice(2)),
  }
}

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj> {
  const digitos = String(cnpj).replace(/\D/g, '')
  if (digitos.length !== 14) throw new Error('O CNPJ precisa ter 14 números')
  try {
    return await viaCnpjWs(digitos)
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith('CNPJ não encontrado')) throw erro
    return viaBrasilApi(digitos)
  }
}

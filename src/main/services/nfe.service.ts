import { getDb } from '../db/client'
import { getRelatorioQuinzena } from './relatorios.service'
import type { NfeConfig, NfeDraft, NfeItem, NotaFiscalSalva, ProdutoFiscalRow } from '../../shared/types'

function sqlite() {
  return (getDb() as any).$client as import('better-sqlite3').Database
}

// ── Config ──────────────────────────────────────────────────────────────────

export function getNfeConfig(): NfeConfig {
  const row = sqlite().prepare("SELECT valor FROM configuracoes WHERE chave = 'nfe_config'").get() as { valor: string } | undefined
  if (!row?.valor) {
    return {
      nome: '', cnpj: '', ie: '', logradouro: '', numero_end: '', complemento: '',
      bairro: '', municipio: 'MANAUS', uf: 'AM', cep: '', telefone: '',
      serie: '001', numero_atual: 1, natureza_operacao: 'VENDA DE MERCADORIA P/ESTADO',
    }
  }
  return JSON.parse(row.valor) as NfeConfig
}

export function setNfeConfig(config: NfeConfig): void {
  sqlite().prepare("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('nfe_config', ?)").run(JSON.stringify(config))
}

// ── Loja fiscal data ─────────────────────────────────────────────────────────

export function getLojaFiscal(loja_id: number) {
  return sqlite().prepare(
    'SELECT id, razao_social, endereco, bairro, cep, municipio, uf, ie, telefone FROM lojas WHERE id = ?'
  ).get(loja_id)
}

export function setLojaFiscal(loja_id: number, data: Record<string, string>): void {
  const allowed = ['razao_social', 'endereco', 'bairro', 'cep', 'municipio', 'uf', 'ie', 'telefone']
  const fields = allowed.filter(f => f in data)
  if (!fields.length) return
  const sets = fields.map(f => `${f} = ?`).join(', ')
  const vals = fields.map(f => data[f])
  sqlite().prepare(`UPDATE lojas SET ${sets} WHERE id = ?`).run(...vals, loja_id)
}

// ── Produto fiscal data ───────────────────────────────────────────────────────

export function getAllProdutosFiscal(): ProdutoFiscalRow[] {
  return sqlite().prepare(
    'SELECT id, nome, unidade, ncm, cst_icms, cfop, unidade_nfe FROM produtos WHERE ativo = 1 ORDER BY nome'
  ).all() as ProdutoFiscalRow[]
}

export function setProdutoFiscal(produto_id: number, ncm: string, cst_icms: string, cfop: string, unidade_nfe: string): void {
  sqlite().prepare(
    'UPDATE produtos SET ncm = ?, cst_icms = ?, cfop = ?, unidade_nfe = ? WHERE id = ?'
  ).run(ncm, cst_icms, cfop, unidade_nfe, produto_id)
}

// ── Preview generation ────────────────────────────────────────────────────────

export function gerarPreviewNfe(loja_id: number, mes: number, ano: number, quinzena: 1 | 2): NfeDraft {
  const db = sqlite()
  const loja = db.prepare('SELECT * FROM lojas WHERE id = ?').get(loja_id) as Record<string, any>
  if (!loja) throw new Error('Loja não encontrada')

  const summary = getRelatorioQuinzena(loja.rede_id as number, loja_id, mes, ano, quinzena)

  // Aggregate qty and price per product name from detalhe
  const qtdPorNome: Record<string, number> = {}
  const precoPorNome: Record<string, number> = {}
  for (const item of summary.detalhe) {
    qtdPorNome[item.produto_nome] = (qtdPorNome[item.produto_nome] ?? 0) + item.quantidade
    if (item.preco_unit > 0 && !precoPorNome[item.produto_nome]) {
      precoPorNome[item.produto_nome] = item.preco_unit
    }
  }

  // Get fiscal data per product
  const prodIds = summary.produtos.map((p: any) => p.id as number)
  const prodFiscal: Record<number, any> = {}
  if (prodIds.length > 0) {
    const placeholders = prodIds.map(() => '?').join(',')
    const rows = db.prepare(`SELECT id, ncm, cst_icms, cfop, unidade_nfe FROM produtos WHERE id IN (${placeholders})`).all(...prodIds) as any[]
    for (const r of rows) prodFiscal[r.id as number] = r
  }

  const items: NfeItem[] = summary.produtos
    .filter((p: any) => (qtdPorNome[p.nome as string] ?? 0) > 0)
    .map((p: any) => {
      const fiscal = prodFiscal[p.id as number] ?? {}
      const qty = qtdPorNome[p.nome as string] ?? 0
      const price = precoPorNome[p.nome as string] ?? 0
      const total = Math.round(qty * price * 100) / 100
      return {
        codigo: String(p.id),
        descricao: (p.nome as string).toUpperCase(),
        ncm: fiscal.ncm ?? '',
        cst: fiscal.cst_icms ?? '040',
        cfop: fiscal.cfop ?? '5102',
        unidade: fiscal.unidade_nfe ?? (p.unidade === 'UN' ? 'UNID' : 'KG'),
        quantidade: qty,
        valor_unitario: price,
        valor_desconto: 0,
        valor_total: total,
        base_icms: 0,
        valor_icms: 0,
        aliq_icms: 0,
      }
    })

  const valor_total = Math.round(items.reduce((s, i) => s + i.valor_total, 0) * 100) / 100

  return {
    loja_id,
    loja_nome: loja.nome as string,
    loja_razao_social: (loja.razao_social as string) || (loja.nome as string),
    loja_cnpj: (loja.cnpj as string) || '',
    loja_ie: (loja.ie as string) || '',
    loja_endereco: (loja.endereco as string) || '',
    loja_bairro: (loja.bairro as string) || '',
    loja_cep: (loja.cep as string) || '',
    loja_municipio: (loja.municipio as string) || 'MANAUS',
    loja_uf: (loja.uf as string) || 'AM',
    loja_telefone: (loja.telefone as string) || '',
    mes, ano, quinzena, items, valor_total,
  }
}

// ── Save NF-e ─────────────────────────────────────────────────────────────────

export function salvarNfe(draft: NfeDraft): NotaFiscalSalva {
  const db = sqlite()
  const config = getNfeConfig()
  const numero = config.numero_atual

  // Increment counter
  config.numero_atual = numero + 1
  setNfeConfig(config)

  const data_emissao = new Date().toISOString().split('T')[0]
  const danfe_html = gerarDanfeHtml(draft, config, numero)

  db.prepare(`
    INSERT INTO notas_fiscais (numero, serie, loja_id, mes, ano, quinzena, data_emissao, valor_total, status, items_json, danfe_html)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?)
  `).run(numero, config.serie, draft.loja_id, draft.mes, draft.ano, draft.quinzena,
    data_emissao, draft.valor_total, JSON.stringify(draft.items), danfe_html)

  const saved = db.prepare('SELECT nf.*, l.nome as loja_nome FROM notas_fiscais nf LEFT JOIN lojas l ON nf.loja_id = l.id ORDER BY nf.id DESC LIMIT 1').get() as any
  return saved as NotaFiscalSalva
}

// ── List / Delete ─────────────────────────────────────────────────────────────

export function listNfe(): NotaFiscalSalva[] {
  return sqlite().prepare(`
    SELECT nf.*, l.nome as loja_nome
    FROM notas_fiscais nf
    LEFT JOIN lojas l ON nf.loja_id = l.id
    ORDER BY nf.id DESC
  `).all() as NotaFiscalSalva[]
}

export function deletarNfe(id: number): void {
  sqlite().prepare('DELETE FROM notas_fiscais WHERE id = ?').run(id)
}

export function imprimirDanfe(id: number): string | null {
  const row = sqlite().prepare('SELECT danfe_html FROM notas_fiscais WHERE id = ?').get(id) as any
  return row?.danfe_html ?? null
}

// ── DANFE HTML generation ─────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gerarDanfeHtml(draft: NfeDraft, config: NfeConfig, numero: number): string {
  const meses = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const qLabel = draft.quinzena === 1 ? '1ª Quinzena (01–15)' : `2ª Quinzena (16–fim)`
  const serie = config.serie.padStart(3, '0')
  const numFmt = String(numero).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
  const hoje = new Date()
  const dataFmt = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`
  const horaFmt = `${String(hoje.getHours()).padStart(2,'0')}:${String(hoje.getMinutes()).padStart(2,'0')}:${String(hoje.getSeconds()).padStart(2,'0')}`
  const cnpjEmit = config.cnpj.replace(/[^\d]/g,'').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  const endEmit = [config.logradouro, config.numero_end, config.complemento].filter(Boolean).join(', ')
  const periodoRef = `${meses[draft.mes]}/${draft.ano} — ${qLabel}`

  const itemRows = draft.items.map((item, idx) => `
    <tr class="${idx % 2 === 0 ? '' : 'alt'}">
      <td>${item.codigo}</td>
      <td class="left">${item.descricao}</td>
      <td>${item.ncm || '—'}</td>
      <td>${item.cst}</td>
      <td>${item.cfop}</td>
      <td>${item.unidade}</td>
      <td class="right">${item.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="right">${fmt(item.valor_unitario)}</td>
      <td class="right">0,00</td>
      <td class="right">${fmt(item.valor_total)}</td>
      <td class="right">0,00</td>
      <td class="right">0,00</td>
      <td class="right">0,00</td>
      <td class="right">0,00</td>
      <td class="right">0,00</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 7.5pt; background:#fff; color:#000; }
.toolbar { display:flex; gap:8px; padding:8px 14px; background:#1e293b; }
.btn-print { padding:6px 18px; background:#16a34a; color:#fff; border:none; border-radius:4px; font-size:13px; font-weight:bold; cursor:pointer; }
.btn-close { padding:6px 14px; background:#475569; color:#fff; border:none; border-radius:4px; font-size:13px; cursor:pointer; }
.page { padding: 6mm 8mm; max-width: 210mm; margin: 0 auto; }
.watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-35deg);
  font-size:72pt; font-weight:bold; color:rgba(200,0,0,0.07); pointer-events:none; z-index:1000; white-space:nowrap; }
.box { border: 1px solid #555; }
.section { border: 1px solid #555; margin-top: -1px; }
.section-title { font-size: 6pt; color:#555; padding: 1mm 2mm 0; text-transform:uppercase; }
.section-value { padding: 1mm 2mm 1.5mm; font-size: 8pt; font-weight: bold; }
.row { display: flex; }
.row > * { flex: 1; border-right: 1px solid #555; }
.row > *:last-child { border-right: none; }
.header-box { display:flex; border: 1px solid #555; margin-bottom: -1px; }
.emit-info { flex: 2; padding: 3mm; border-right: 1px solid #555; }
.emit-name { font-size: 11pt; font-weight: bold; }
.emit-addr { font-size: 7pt; color:#333; margin-top:1mm; }
.danfe-center { flex: 1; padding: 3mm; border-right: 1px solid #555; text-align:center; }
.danfe-title { font-size: 8pt; font-weight:bold; }
.danfe-sub { font-size: 7pt; margin-top:1mm; }
.danfe-nf { font-size: 9pt; font-weight:bold; margin-top:2mm; }
.danfe-right { flex: 1; padding: 3mm; font-size:7pt; text-align:center; }
.chave-box { border: 1px solid #555; padding: 2mm; margin-top: -1px; }
.chave-label { font-size: 6pt; color:#555; }
.chave-val { font-size: 8pt; font-weight:bold; letter-spacing:1px; margin-top:0.5mm; }
.chave-note { font-size: 6pt; color:#555; margin-top:1mm; }
table.products { width:100%; border-collapse:collapse; margin-top:-1px; border: 1px solid #555; }
table.products th { background:#e8e8e8; font-size:6.5pt; padding:1mm 1.5mm; text-align:center; border-bottom:1px solid #555; border-right:1px solid #ccc; }
table.products td { font-size:7pt; padding:1mm 1.5mm; border-bottom:1px solid #eee; border-right:1px solid #eee; text-align:center; }
table.products td.left { text-align:left; }
table.products td.right { text-align:right; }
table.products tr.alt td { background:#fafafa; }
table.products tr.total-row td { font-weight:bold; background:#f0f0f0; border-top:1px solid #555; }
.imposto-box { display:flex; border: 1px solid #555; margin-top:-1px; }
.imposto-cell { flex:1; border-right:1px solid #555; padding:1mm 2mm; }
.imposto-cell:last-child { border-right:none; }
.total-nf { font-size:10pt; font-weight:bold; color:#166534; }
@media print { @page { size: A4 portrait; margin: 6mm; } .toolbar { display:none; } .watermark { position:fixed; } }
</style></head><body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">Imprimir</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>
<div class="watermark">RASCUNHO</div>
<div class="page">

  <!-- Header -->
  <div class="header-box">
    <div class="emit-info">
      <div class="emit-name">${config.nome.toUpperCase()}</div>
      <div class="emit-addr">${endEmit}${config.bairro ? ', ' + config.bairro : ''} — ${config.municipio}/${config.uf} — CEP: ${config.cep}</div>
      ${config.telefone ? `<div class="emit-addr">Fone: ${config.telefone}</div>` : ''}
    </div>
    <div class="danfe-center">
      <div class="danfe-title">DANFE</div>
      <div class="danfe-sub">Documento Auxiliar da<br>Nota Fiscal Eletrônica</div>
      <div style="margin-top:2mm; font-size:7pt;">0 - ENTRADA<br>1 - SAÍDA &nbsp;<strong style="font-size:11pt; border:1px solid #555; padding:1mm;">1</strong></div>
      <div class="danfe-nf">Nº ${numFmt}<br>SÉRIE ${serie}<br>FOLHA 1/1</div>
    </div>
    <div class="danfe-right">
      <div style="font-size:6pt; color:#555;">CHAVE DE ACESSO</div>
      <div style="font-size:7.5pt; font-weight:bold; margin-top:1mm; letter-spacing:1px;">— RASCUNHO —</div>
      <div style="font-size:6pt; color:#555; margin-top:3mm;">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br</div>
    </div>
  </div>

  <!-- Natureza + Protocolo -->
  <div class="section">
    <div class="row">
      <div>
        <div class="section-title">Natureza da Operação</div>
        <div class="section-value">${config.natureza_operacao}</div>
      </div>
      <div style="flex:1.2">
        <div class="section-title">Protocolo de Autorização de Uso</div>
        <div class="section-value" style="color:#888;">Aguardando autorização SEFAZ — ${periodoRef}</div>
      </div>
    </div>
    <div class="row" style="border-top:1px solid #555;">
      <div>
        <div class="section-title">Inscrição Estadual</div>
        <div class="section-value">${config.ie}</div>
      </div>
      <div><div class="section-title">Inscrição Estadual do Substituto Tributário</div><div class="section-value"> </div></div>
      <div>
        <div class="section-title">CNPJ</div>
        <div class="section-value">${cnpjEmit}</div>
      </div>
    </div>
  </div>

  <!-- Destinatário -->
  <div class="section" style="margin-top:2mm;">
    <div style="background:#e8e8e8; padding:1mm 2mm; font-weight:bold; font-size:7pt; border-bottom:1px solid #555;">DESTINATÁRIO / REMETENTE</div>
    <div class="row">
      <div style="flex:3">
        <div class="section-title">Nome / Razão Social</div>
        <div class="section-value">${draft.loja_razao_social.toUpperCase()}</div>
      </div>
      <div style="flex:1.5">
        <div class="section-title">CNPJ / CPF</div>
        <div class="section-value">${draft.loja_cnpj}</div>
      </div>
      <div>
        <div class="section-title">Data da Emissão</div>
        <div class="section-value">${dataFmt}</div>
      </div>
    </div>
    <div class="row" style="border-top:1px solid #555;">
      <div style="flex:3">
        <div class="section-title">Endereço</div>
        <div class="section-value">${draft.loja_endereco}</div>
      </div>
      <div>
        <div class="section-title">Bairro / Distrito</div>
        <div class="section-value">${draft.loja_bairro}</div>
      </div>
      <div>
        <div class="section-title">CEP</div>
        <div class="section-value">${draft.loja_cep}</div>
      </div>
      <div>
        <div class="section-title">Data da Saída</div>
        <div class="section-value">${dataFmt}</div>
      </div>
    </div>
    <div class="row" style="border-top:1px solid #555;">
      <div style="flex:2">
        <div class="section-title">Município</div>
        <div class="section-value">${draft.loja_municipio}</div>
      </div>
      <div>
        <div class="section-title">UF</div>
        <div class="section-value">${draft.loja_uf}</div>
      </div>
      <div style="flex:1.5">
        <div class="section-title">Telefone / Fax</div>
        <div class="section-value">${draft.loja_telefone}</div>
      </div>
      <div style="flex:1.5">
        <div class="section-title">Inscrição Estadual</div>
        <div class="section-value">${draft.loja_ie}</div>
      </div>
      <div>
        <div class="section-title">Hora da Saída</div>
        <div class="section-value">${horaFmt}</div>
      </div>
    </div>
  </div>

  <!-- Cálculo do Imposto -->
  <div class="section" style="margin-top:2mm;">
    <div style="background:#e8e8e8; padding:1mm 2mm; font-weight:bold; font-size:7pt; border-bottom:1px solid #555;">CÁLCULO DO IMPOSTO</div>
    <div class="imposto-box">
      <div class="imposto-cell"><div class="section-title">Base de Cálculo do ICMS</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Valor do ICMS</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Base de Cálculo ICMS Subst.</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Valor do ICMS Subst.</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">V.Aprox. Tributos</div><div class="section-value">—</div></div>
      <div class="imposto-cell"><div class="section-title">Valor Total dos Produtos</div><div class="section-value total-nf">R$ ${fmt(draft.valor_total)}</div></div>
    </div>
    <div class="imposto-box" style="border-top:1px solid #555;">
      <div class="imposto-cell"><div class="section-title">Valor do Frete</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Valor do Seguro</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Desconto</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Outras Despesas Acessórias</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Valor do IPI</div><div class="section-value">0,00</div></div>
      <div class="imposto-cell"><div class="section-title">Valor Total da Nota</div><div class="section-value total-nf">R$ ${fmt(draft.valor_total)}</div></div>
    </div>
  </div>

  <!-- Transportador -->
  <div class="section" style="margin-top:2mm;">
    <div style="background:#e8e8e8; padding:1mm 2mm; font-weight:bold; font-size:7pt; border-bottom:1px solid #555;">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <div class="row">
      <div style="flex:3"><div class="section-title">Nome / Razão Social</div><div class="section-value"> </div></div>
      <div><div class="section-title">Frete por Conta</div><div class="section-value">0 - REMETENTI</div></div>
      <div><div class="section-title">Código ANTT</div><div class="section-value"> </div></div>
      <div><div class="section-title">Placa do Veículo</div><div class="section-value"> </div></div>
      <div><div class="section-title">UF</div><div class="section-value"> </div></div>
      <div><div class="section-title">CNPJ / CPF</div><div class="section-value"> </div></div>
    </div>
  </div>

  <!-- Produtos -->
  <div style="margin-top:2mm;">
    <div style="background:#e8e8e8; padding:1mm 2mm; font-weight:bold; font-size:7pt; border:1px solid #555; border-bottom:none;">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <table class="products">
      <thead>
        <tr>
          <th>CÓD.</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th>
          <th>CST</th><th>CFOP</th><th>UNID.</th><th>QTDE.</th>
          <th>VALOR UNIT.</th><th>VALOR DESC.</th><th>VALOR TOTAL</th>
          <th>BASE CALC. ICMS</th><th>VALOR ICMS</th><th>VALOR IPI</th>
          <th>ALÍQ. % ICMS</th><th>IPI</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <tr class="total-row">
          <td colspan="9" class="right">TOTAL</td>
          <td class="right">${fmt(draft.valor_total)}</td>
          <td>0,00</td><td>0,00</td><td>0,00</td><td></td><td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Dados adicionais -->
  <div class="section" style="margin-top:2mm;">
    <div style="background:#e8e8e8; padding:1mm 2mm; font-weight:bold; font-size:7pt; border-bottom:1px solid #555;">DADOS ADICIONAIS</div>
    <div style="padding:2mm; font-size:7pt; min-height:12mm;">
      Período de referência: ${periodoRef}<br>
      NF-e gerada automaticamente pelo sistema Henrique Hortifruti.<br>
      <strong style="color:red;">DOCUMENTO SEM VALOR FISCAL — AGUARDANDO AUTORIZAÇÃO SEFAZ</strong>
    </div>
  </div>

  <div style="margin-top:3mm; font-size:6pt; color:#888; text-align:center;">
    DATA E HORA DA IMPRESSÃO: ${dataFmt} ${horaFmt}
  </div>
</div>
</body></html>`
}

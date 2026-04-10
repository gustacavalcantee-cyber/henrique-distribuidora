export interface ListaPrecosItem {
  nome: string
  unidade: string
  preco: number
}

export interface ListaPrecosData {
  nomeEmpresa: string
  logoBase64: string   // full data URL — e.g. "data:image/png;base64,..."
  itens: ListaPrecosItem[]
}

function fmt(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function generateListaPrecosHtml(data: ListaPrecosData): string {
  const rows = data.itens.map((item) => `
    <tr>
      <td class="c-nome">${item.nome}</td>
      <td class="c-un">${item.unidade}</td>
      <td class="c-preco">R$&nbsp;${fmt(item.preco)}</td>
    </tr>`).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; width: 400px; background: #fff; position: relative; overflow: hidden; }
.watermark {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-25deg);
  font-size: 72px; font-weight: 900; color: #10b981; opacity: 0.04;
  white-space: nowrap; pointer-events: none; z-index: 0; letter-spacing: .05em;
}
.container { padding: 20px 22px; position: relative; z-index: 1; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2.5px solid #10b981;
}
.company-name { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -.02em; }
.list-title { font-size: 10px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-top: 3px; }
.logo { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
table { width: 100%; border-collapse: collapse; }
thead tr { border-bottom: 1px solid #e2e8f0; }
th { font-size: 9px; color: #94a3b8; font-weight: 600; padding: 4px 6px;
     text-transform: uppercase; letter-spacing: .05em; }
th.c-nome { text-align: left; }
th.c-un { text-align: center; }
th.c-preco { text-align: right; }
td { font-size: 11.5px; color: #1e293b; padding: 6px 6px; border-bottom: 1px solid #f1f5f9; }
tr:nth-child(even) td { background: rgba(16,185,129,.04); }
.c-nome { text-align: left; }
.c-un { text-align: center; color: #64748b; }
.c-preco { text-align: right; font-weight: 700; color: #0f172a; }
.footer {
  margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0;
  font-size: 9px; color: #94a3b8; text-align: center;
}
</style>
</head>
<body>
<div class="watermark">${data.nomeEmpresa}</div>
<div class="container">
  <div class="header">
    <div>
      <div class="company-name">${data.nomeEmpresa}</div>
      <div class="list-title">Lista de Preços</div>
    </div>
    <img class="logo" src="${data.logoBase64}" alt="logo" />
  </div>
  <table>
    <thead><tr>
      <th class="c-nome">Produto</th>
      <th class="c-un">UN</th>
      <th class="c-preco">Preço</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Preços sujeitos a alteração sem aviso prévio</div>
</div>
</body>
</html>`
}

export function generateListaPrecosPrintHtml(data: ListaPrecosData): string {
  const rows = data.itens.map((item) => `
    <tr>
      <td class="c-nome">${item.nome}</td>
      <td class="c-un">${item.unidade}</td>
      <td class="c-preco">R$&nbsp;${fmt(item.preco)}</td>
    </tr>`).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; background: #e5e7eb; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #1e293b; }
.btn-print { padding: 6px 18px; background: #16a34a; color: #fff; border: none; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; }
.btn-print:hover { background: #15803d; }
.btn-close { padding: 6px 14px; background: #475569; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
.btn-close:hover { background: #334155; }
.page-wrap { padding: 12px; }
.page { background: #fff; width: 180mm; margin: 0 auto; padding: 14mm 16mm; position: relative; overflow: hidden; }
.watermark {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-25deg);
  font-size: 80px; font-weight: 900; color: #10b981; opacity: 0.04;
  white-space: nowrap; pointer-events: none;
}
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 10mm; padding-bottom: 4mm; border-bottom: 2.5px solid #10b981;
}
.company-name { font-size: 22pt; font-weight: 900; color: #0f172a; }
.list-title { font-size: 9pt; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-top: 2mm; }
.logo { width: 14mm; height: 14mm; border-radius: 50%; object-fit: cover; }
table { width: 100%; border-collapse: collapse; }
thead tr { border-bottom: 1px solid #e2e8f0; }
th { font-size: 8pt; color: #94a3b8; font-weight: 600; padding: 2mm 3mm;
     text-transform: uppercase; letter-spacing: .05em; }
th.c-nome { text-align: left; }
th.c-un { text-align: center; }
th.c-preco { text-align: right; }
td { font-size: 10pt; color: #1e293b; padding: 2.5mm 3mm; border-bottom: 1px solid #f1f5f9; }
tr:nth-child(even) td { background: rgba(16,185,129,.04); }
.c-nome { text-align: left; }
.c-un { text-align: center; color: #64748b; }
.c-preco { text-align: right; font-weight: 700; }
.footer { margin-top: 6mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  body { background: #fff; }
  .toolbar { display: none; }
  .page-wrap { padding: 0; }
  .page { width: 210mm; margin: 0; padding: 14mm 16mm; min-height: 297mm; }
}
</style>
</head>
<script>document.addEventListener('keydown', function(e){ if(e.key==='Escape') window.close(); });</script>
<body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">✕ Fechar</button>
</div>
<div class="page-wrap">
  <div class="page">
    <div class="watermark">${data.nomeEmpresa}</div>
    <div class="header">
      <div>
        <div class="company-name">${data.nomeEmpresa}</div>
        <div class="list-title">Lista de Preços</div>
      </div>
      <img class="logo" src="${data.logoBase64}" alt="logo" />
    </div>
    <table>
      <thead><tr>
        <th class="c-nome">Produto</th>
        <th class="c-un">UN</th>
        <th class="c-preco">Preço</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Preços sujeitos a alteração sem aviso prévio</div>
  </div>
</div>
</body>
</html>`
}

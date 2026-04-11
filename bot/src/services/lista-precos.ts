import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

export interface ListaPrecosItem { nome: string; unidade: string; preco: number }
export interface ListaPrecosData { nomeEmpresa: string; logoBase64: string; itens: ListaPrecosItem[] }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function getLogoBase64(): string {
  const logoPath = path.join(__dirname, '../../../src/renderer/src/assets/logo.png')
  return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
}

function generateHtml(data: ListaPrecosData): string {
  const rows = data.itens.map(item => `
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
.watermark-logo {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 220px; height: 220px; object-fit: contain;
  opacity: 0.06; pointer-events: none; z-index: 0;
}
.container { padding: 20px 22px; position: relative; z-index: 1; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2.5px solid #10b981;
}
.company-name { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -.02em; }
.list-title { font-size: 10px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-top: 3px; }
.logo { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
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
<img class="watermark-logo" src="${data.logoBase64}" alt="" />
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

export async function screenshotListaPrecos(data: ListaPrecosData): Promise<Buffer> {
  const html = generateHtml(data)
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 400, height: 1200 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const body = await page.$('body')
    const screenshot = await body!.screenshot({ type: 'png' })
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}

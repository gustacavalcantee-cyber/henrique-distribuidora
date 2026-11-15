// "Selecione a orientação" picker shared by every print window.
// The picker writes the @page size into <style id="page-orient"> and marks <html data-orient="...">,
// so each document can add its own `html[data-orient=portrait] ...` rules when its layout must change.

export type Orientacao = 'portrait' | 'landscape'

export interface OpcoesOrientacao {
  // 'auto' picks landscape only when the widest table does not fit across a portrait page
  padrao: Orientacao | 'auto'
  // @page margin, e.g. '10mm'
  margem: string
  // Shrinks this element at print time when its widest table is still wider than the paper.
  // `util` is the printable width in mm for each orientation (paper minus margins and padding).
  ajustar?: { seletor: string; util: Record<Orientacao, number> }
}

export const ORIENTACAO_CSS = `
.orient { display:flex; align-items:center; gap:4px; margin-left:12px; color:#cbd5e1; font-size:13px; font-family: Arial, sans-serif; }
.orient span { margin-right:4px; }
.orient button { display:flex; align-items:center; justify-content:center; width:36px; height:30px; background:#334155; color:#cbd5e1; border:none; border-radius:4px; cursor:pointer; }
.orient button.active { background:#2563eb; color:#fff; }
@media print { .orient { display:none; } }`

export const ORIENTACAO_SELETOR = `<div class="orient">
    <span>Selecione a orientação:</span>
    <button id="orient-landscape" title="Horizontal" onclick="setOrient('landscape')"><svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="20" height="14" rx="1.5"/><path d="M5 5.5h12M5 8h12M5 10.5h8"/></svg></button>
    <button id="orient-portrait" title="Vertical" onclick="setOrient('portrait')"><svg width="16" height="22" viewBox="0 0 16 22" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="14" height="20" rx="1.5"/><path d="M4 6h8M4 9h8M4 12h8M4 15h5"/></svg></button>
  </div>`

// Goes at the end of <body>. Without a toolbar (silent print) it still applies the default orientation.
export function orientacaoScript(opcoes: OpcoesOrientacao): string {
  const util = opcoes.ajustar?.util ?? { portrait: 210, landscape: 297 }
  return `<style id="page-orient"></style>
<script>
(function () {
  var MM = 96 / 25.4
  var UTIL = ${JSON.stringify(util)}
  var AJUSTAR = ${JSON.stringify(opcoes.ajustar?.seletor ?? null)}
  var orient = 'portrait'
  // Natural width of the widest table (tables stretch to their container, so measure them unstretched)
  function widestTable() {
    var tabelas = document.querySelectorAll(AJUSTAR ? AJUSTAR + ' table' : 'table')
    return Math.max.apply(null, [0].concat(Array.prototype.map.call(tabelas, function (t) {
      t.style.width = 'max-content'
      var w = t.scrollWidth
      t.style.width = ''
      return w
    })))
  }
  window.setOrient = function (o) {
    orient = o
    document.documentElement.setAttribute('data-orient', o)
    document.getElementById('page-orient').textContent = '@media print { @page { size: A4 ' + o + '; margin: ${opcoes.margem}; } }'
    var p = document.getElementById('orient-portrait'), l = document.getElementById('orient-landscape')
    if (p) p.classList.toggle('active', o === 'portrait')
    if (l) l.classList.toggle('active', o === 'landscape')
  }
  if (AJUSTAR) {
    window.addEventListener('beforeprint', function () {
      var alvo = document.querySelector(AJUSTAR)
      if (alvo) alvo.style.zoom = String(Math.min(1, UTIL[orient] * MM / widestTable()))
    })
    window.addEventListener('afterprint', function () {
      var alvo = document.querySelector(AJUSTAR)
      if (alvo) alvo.style.zoom = ''
    })
  }
  var padrao = ${JSON.stringify(opcoes.padrao)}
  window.setOrient(padrao === 'auto' ? (widestTable() > UTIL.portrait * MM ? 'landscape' : 'portrait') : padrao)
})()
</script>`
}

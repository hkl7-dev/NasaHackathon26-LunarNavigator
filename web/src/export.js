// Downloads: CSV / JSON text files and PNG snapshots of any chart (SVG) or the 3D map (WebGL canvas).
export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export const downloadText = (name, text, type = 'text/csv') => downloadBlob(name, new Blob([text], { type }))

const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility', 'display']
// copy the computed CSS onto each element, since a standalone SVG image cannot see the page's stylesheet
function inlineStyles(src, dst) {
  const cs = getComputedStyle(src)
  dst.setAttribute('style', STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'))
  for (let k = 0; k < src.children.length; k++) inlineStyles(src.children[k], dst.children[k])
}

function bg() { return getComputedStyle(document.body).backgroundColor || '#07090f' }

function canvasBlob(cv) { return new Promise((res) => cv.toBlob(res, 'image/png')) }

async function svgToCanvas(svg, scale = 2) {
  const box = svg.getBoundingClientRect()
  const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height))
  const clone = svg.cloneNode(true)
  inlineStyles(svg, clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', w); clone.setAttribute('height', h)
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('could not draw this chart')); img.src = url })
    const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale
    const g = cv.getContext('2d'); g.fillStyle = bg(); g.fillRect(0, 0, cv.width, cv.height)
    g.drawImage(img, 0, 0, cv.width, cv.height)
    return cv
  } finally { URL.revokeObjectURL(url) }
}

// Save the main picture inside `root` (the largest canvas or svg) as a PNG
export async function savePng(root, name) {
  const cands = [...root.querySelectorAll('canvas, svg')].filter((e) => !e.closest('button') && e.getBoundingClientRect().width > 120)
  if (!cands.length) return
  const el = cands.reduce((a, e) => (e.getBoundingClientRect().width * e.getBoundingClientRect().height > a.getBoundingClientRect().width * a.getBoundingClientRect().height ? e : a))
  let cv = el
  if (el.tagName.toLowerCase() === 'svg') cv = await svgToCanvas(el)
  else {   // WebGL canvas: put it on the page background
    const c2 = document.createElement('canvas'); c2.width = el.width; c2.height = el.height
    const g = c2.getContext('2d'); g.fillStyle = bg(); g.fillRect(0, 0, c2.width, c2.height); g.drawImage(el, 0, 0); cv = c2
  }
  downloadBlob(name.endsWith('.png') ? name : name + '.png', await canvasBlob(cv))
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

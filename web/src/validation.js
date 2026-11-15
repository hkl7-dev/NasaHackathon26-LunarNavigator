// Compares our in-browser maps with independent NASA reference maps on the same 84 x 84 grid
// (reference files come from engine/import_reference.py). Pure functions, no React.

function pairs(a, b) {
  const x = [], y = []
  if (!a || !b) return { x, y }
  for (let k = 0; k < a.length; k++) {
    const u = a[k], v = b[k]
    if (u == null || v == null || Number.isNaN(u) || Number.isNaN(v)) continue
    x.push(u); y.push(v)
  }
  return { x, y }
}

export function stats(x, y) {
  const n = x.length
  if (n < 3) return null
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sad = 0
  for (let k = 0; k < n; k++) {
    const u = x[k], v = y[k]
    sx += u; sy += v; sxx += u * u; syy += v * v; sxy += u * v; sad += Math.abs(u - v)
  }
  const mx = sx / n, my = sy / n
  const cov = sxy / n - mx * my, vx = sxx / n - mx * mx, vy = syy / n - my * my
  return { n, r: cov / Math.sqrt(vx * vy), mae: sad / n, bias: mx - my }
}

// two yes/no maps: how well do "our dark cells" and "their dark cells" overlap?
export function overlap(ours, theirs) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (let k = 0; k < ours.length; k++) {
    const a = ours[k], b = theirs[k]
    if (a == null || b == null) continue
    if (a && b) tp++; else if (a) fp++; else if (b) fn++; else tn++
  }
  const n = tp + fp + fn + tn
  return { tp, fp, fn, tn, n, iou: tp / Math.max(1, tp + fp + fn), precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), agree: (tp + tn) / Math.max(1, n) }
}

const flag = (arr, test) => Array.from(arr, (v) => (v == null || Number.isNaN(v) ? null : test(v)))

// Everything the validation panel shows. heat = our worker output, ref = ref_<pole>.json
export function validate(heat, ref) {
  if (!heat || heat.partial || !ref) return null
  const L = ref.layers, out = {}
  if (L.lola_sun) {
    const p = pairs(heat.sun, L.lola_sun.center)
    out.sun = { ...stats(p.x, p.y), x: p.x, y: p.y, file: L.lola_sun.file }
  }
  if (L.lola_earth) {
    const p = pairs(heat.earth, L.lola_earth.center)
    out.earth = { ...stats(p.x, p.y), file: L.lola_earth.file }
  }
  if (L.lola_slope) {
    const p = pairs(heat.slope, L.lola_slope.mean)
    out.slope = { ...stats(p.x, p.y), x: p.x, y: p.y, file: L.lola_slope.file }
  }
  const oursDark = flag(heat.sun, (v) => v === 0)
  if (L.lola_psr) out.psr = { ...overlap(oursDark, flag(L.lola_psr.center, (v) => v > 0.5)), file: L.lola_psr.file, ref: 'LOLA PSR map' }
  else if (L.lola_sun) out.psr = { ...overlap(oursDark, flag(L.lola_sun.center, (v) => v < 0.005)), file: L.lola_sun.file, ref: 'LOLA illumination < 0.5 %' }
  if (L.diviner_tmax) out.cold = { ...overlap(oursDark, flag(L.diviner_tmax.frac, (v) => v >= 0.5)), file: L.diviner_tmax.file }
  return out
}

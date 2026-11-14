// Shared helpers for time, windows and formatting

export const DATA = './data'

export async function fetchJSON(path) {
  const r = await fetch(`${DATA}/${path}`)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

export function timeAt(site, i) {
  return new Date(Date.parse(site.t0) + i * site.step_min * 60000)
}

export function fmtDate(d) {
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export function fmtDuration(hours) {
  if (hours == null || !isFinite(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  const d = Math.floor(hours / 24)
  const h = Math.round(hours - d * 24)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}

// Given windows [{start_i,end_i}], return the state at index i and hours until the next change
export function windowState(windows, i, stepMin, n = Infinity) {
  const toH = (n) => (n * stepMin) / 60
  let lo = 0, hi = windows.length - 1, inside = null, next = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const w = windows[mid]
    if (i < w.start_i) { next = w; hi = mid - 1 }
    else if (i >= w.end_i) lo = mid + 1
    else { inside = w; break }
  }
  if (inside) return { on: true, untilChange: inside.end_i >= n ? null : toH(inside.end_i - i) }
  if (next) return { on: false, untilChange: toH(next.start_i - i) }
  return { on: false, untilChange: null }
}

export function maskAt(mask, az) {
  const step = mask.az_step_deg
  const n = mask.el.length
  const x = (((az % 360) + 360) % 360) / step
  const i0 = Math.floor(x) % n
  const i1 = (i0 + 1) % n
  const f = x - Math.floor(x)
  return mask.el[i0] * (1 - f) + mask.el[i1] * f
}

export const GROUP_COLORS = {
  'Artemis III region': '#f5b84b',
  'CLPS': '#5ec8f2',
  'ISRO': '#ff8a5c',
  'CNSA': '#e66a8f',
  'Apollo': '#b7c3d6',
  'Shadowed crater': '#8f7cf0',
  'Test': '#888',
}

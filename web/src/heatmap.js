// Region-wide map layers for the south pole map (computed in a web worker, see heatmap.worker.js)
import { useEffect, useMemo, useState } from 'react'
import { loadDem, loadVectors } from './engine.js'
import { DATA } from './lib.js'

export const LAYERS = {
  score: { label: 'Landing score', unit: 'landing score: flat ground + Sun + Earth + short nights', fmt: (v) => `${Math.round(v * 100)}/100`, ramp: [[0, [200, 40, 40]], [0.35, [235, 120, 40]], [0.6, [235, 210, 60]], [1, [40, 200, 90]]], range: [0, 0.8] },
  ice: { label: 'Water ice', unit: 'never sunlit = cold trap where water ice can survive', fmt: (v) => (v <= 0 ? 'never sunlit' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}% sunlit`), ramp: [[0, [215, 245, 255]], [0.02, [90, 170, 235]], [0.25, [40, 60, 95]], [1, [34, 32, 32]]], range: [0, 0.3] },
  evidence: { label: 'Ice evidence', unit: 'share of datasets that agree: cold, dark trap where ice can survive', fmt: (v) => `${Math.round(v * 100)}% agree`, ramp: [[0, [34, 32, 32]], [0.34, [45, 80, 130]], [0.67, [90, 170, 235]], [1, [215, 245, 255]]], range: [0, 1] },
  sun: { label: 'Sunlight', unit: '% of time sunlit', fmt: (v) => `${Math.round(v * 100)}%`, ramp: [[0, [12, 12, 22]], [0.25, [90, 30, 70]], [0.5, [200, 70, 40]], [0.75, [250, 170, 40]], [1, [255, 245, 190]]], range: [0, 0.9] },
  earth: { label: 'Earth in view', unit: '% of time Earth visible', fmt: (v) => `${Math.round(v * 100)}%`, ramp: [[0, [10, 12, 24]], [0.5, [30, 90, 170]], [1, [170, 225, 255]]], range: [0, 1] },
  both: { label: 'Sun + Earth', unit: '% of time with both', fmt: (v) => `${Math.round(v * 100)}%`, ramp: [[0, [10, 14, 18]], [0.5, [30, 130, 100]], [1, [170, 255, 210]]], range: [0, 0.6] },
  night: { label: 'Longest night', unit: 'longest stretch without Sun', fmt: (v) => (v >= 360 ? 'never lit' : `${v.toFixed(1)} days`), ramp: [[0, [255, 245, 190]], [0.3, [250, 170, 40]], [0.6, [160, 50, 60]], [1, [12, 12, 22]]], range: [2, 30] },
}

export function colorFor(layer, v) {
  const L = LAYERS[layer]
  const [lo, hi] = L.range
  const f = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  const r = L.ramp
  let k = 1
  while (k < r.length - 1 && r[k][0] < f) k++
  const [f0, c0] = r[k - 1], [f1, c1] = r[k]
  const w = (f - f0) / Math.max(1e-9, f1 - f0)
  return c0.map((c, j) => Math.round(c + (c1[j] - c) * w))
}

export function gradientCss(layer) {
  const L = LAYERS[layer]
  return `linear-gradient(90deg, ${L.ramp.map(([f, c]) => `rgb(${c.join(',')}) ${f * 100}%`).join(', ')})`
}

// Renders one layer to a data URL (N x N pixels, transparent outside the disk)
export function renderLayer(heat, layer) {
  const { N } = heat, arr = heat[layer]
  const cv = document.createElement('canvas')
  cv.width = cv.height = N
  const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N)
  for (let k = 0; k < N * N; k++) {
    const v = arr[k]
    if (Number.isNaN(v)) continue
    const [r, g, b] = colorFor(layer, v)
    img.data.set([r, g, b, 235], k * 4)
  }
  ctx.putImageData(img, 0, 0)
  return cv.toDataURL()
}

// ---- shared per-pole store, so the map and the data panel use one worker run ----
const stores = {}
function store(pole) {
  return (stores[pole] ??= { state: { heat: null, progress: 0, regions: null }, subs: new Set(), started: false })
}
function publish(pole, patch) {
  const st = store(pole)
  st.state = { ...st.state, ...patch }
  st.subs.forEach((f) => f(st.state))
}

// Named regions to score (public/data/artemis3_regions.json); entries without coordinates are skipped
let regionsP
export function loadRegions() {
  regionsP ??= fetch(`${DATA}/artemis3_regions.json`).then((r) => (r.ok ? r.json() : { regions: [] }))
    .catch(() => ({ regions: [] }))
  return regionsP
}

// Independent NASA reference maps on the same grid (engine/import_reference.py); null when not imported
const refP = {}
export function loadRef(pole) {
  refP[pole] ??= fetch(`${DATA}/ref_${pole}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return refP[pole]
}

function start(pole, cells, mapLimit) {
  const st = store(pole)
  if (st.started) return
  st.started = true
  Promise.all([loadDem(pole), loadVectors(), pole === 'south' ? loadRegions() : { regions: [] }]).then(([dem, vec, reg]) => {
    const regions = (reg.regions || []).filter((g) => isFinite(g.lat) && isFinite(g.lon) && g.lat !== null && Math.sign(g.lat) === dem.s)
    const worker = new Worker(new URL('./heatmap.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'regions') publish(pole, { regions: m.regions })
      else if (m.type === 'progress') publish(pole, { heat: { N: cells, ...m, ice: m.sun, partial: true }, progress: m.done })
      else {
        publish(pole, { heat: { ...m, ice: m.sun, partial: false }, progress: 1, regions: m.regions })
        worker.terminate()
        console.info(`[heatmap] ${pole} ${cells}x${cells} cells in ${m.ms} ms`)
      }
    }
    worker.onerror = (e) => publish(pole, { error: e.message || 'map worker failed' })
    worker.postMessage({ dem, vec, cells, mapLimit, regions })
  }).catch((e) => {
    st.started = false   // allow a retry later
    publish(pole, { error: pole === 'north' ? 'North pole terrain not found: put LDEM_75N_240M.IMG and .LBL in dem/ and run python -m engine.export_north' : e.message })
  })
}

// "Ice evidence": for each cell, the share of independent datasets that call it a cold, dark trap
// (our own never-sunlit result, LOLA permanently shadowed regions, Diviner max temperature < 110 K)
export function iceEvidence(heat, ref) {
  if (!heat) return null
  const L = ref?.layers || {}, n = heat.N * heat.N, out = new Float32Array(n).fill(NaN)
  for (let k = 0; k < n; k++) {
    const ours = heat.sun[k]
    if (Number.isNaN(ours)) continue
    let yes = ours === 0 ? 1 : 0, all = 1
    const psr = L.lola_psr?.center[k], vis = L.lola_sun?.center[k], div = L.diviner_tmax?.frac[k]
    if (psr != null) { all++; yes += psr > 0.5 } else if (vis != null) { all++; yes += vis < 0.005 }
    if (div != null) { all++; yes += div >= 0.5 }
    out[k] = yes / all
  }
  return out
}
export function evidenceSources(ref) {
  const L = ref?.layers || {}
  return ['our 3-year Sun run', L.lola_psr ? 'LOLA PSR map' : L.lola_sun ? 'LOLA illumination' : null, L.diviner_tmax ? 'Diviner < 110 K' : null].filter(Boolean)
}

// Starts the worker on first use for each pole; returns {heat, progress, error, regions, ref}
export function useHeatmap(enabled, { cells = 84, mapLimit = -79, pole = 'south' } = {}) {
  const [state, setState] = useState(() => store(pole).state)
  const [ref, setRef] = useState(null)
  useEffect(() => {
    const st = store(pole)
    setState(st.state)
    st.subs.add(setState)
    if (enabled) start(pole, cells, mapLimit)
    return () => st.subs.delete(setState)
  }, [enabled, pole])
  useEffect(() => { let on = true; setRef(null); loadRef(pole).then((r) => on && setRef(r)); return () => { on = false } }, [pole])
  const heat = useMemo(() => (state.heat ? { ...state.heat, evidence: iceEvidence(state.heat, ref) } : null), [state.heat, ref])
  return { ...state, heat, ref }
}

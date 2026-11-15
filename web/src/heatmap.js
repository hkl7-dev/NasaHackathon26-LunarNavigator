// Region-wide map layers for the south pole map (computed in a web worker, see heatmap.worker.js)
import { useEffect, useRef, useState } from 'react'
import { loadDem, loadVectors } from './engine.js'

export const LAYERS = {
  score: { label: 'Landing score', unit: 'landing score: flat ground + Sun + Earth + short nights', fmt: (v) => `${Math.round(v * 100)}/100`, ramp: [[0, [200, 40, 40]], [0.35, [235, 120, 40]], [0.6, [235, 210, 60]], [1, [40, 200, 90]]], range: [0, 0.8] },
  ice: { label: 'Water ice', unit: 'never sunlit = cold trap where water ice can survive', fmt: (v) => (v <= 0 ? 'never sunlit' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}% sunlit`), ramp: [[0, [215, 245, 255]], [0.02, [90, 170, 235]], [0.25, [40, 60, 95]], [1, [34, 32, 32]]], range: [0, 0.3] },
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

const memo = {}   // finished maps, per pole
const jobs = {}   // latest state of each pole's running job
// Starts the worker on first use for each pole; returns {heat, progress, error}
export function useHeatmap(enabled, { cells = 84, mapLimit = -79, pole = 'south' } = {}) {
  const idle = { heat: null, progress: 0 }
  const [state, setState] = useState(() => memo[pole] ? { heat: memo[pole], progress: 1 } : jobs[pole] || idle)
  const cur = useRef(pole)
  cur.current = pole
  useEffect(() => {
    setState(memo[pole] ? { heat: memo[pole], progress: 1 } : jobs[pole] || idle)
    if (!enabled || jobs[pole] || memo[pole]) return
    const put = (st) => { jobs[pole] = st; if (cur.current === pole) setState(st) }
    put(idle)
    Promise.all([loadDem(pole), loadVectors()]).then(([dem, vec]) => {
      const worker = new Worker(new URL('./heatmap.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const m = e.data
        if (m.type === 'progress') put({ heat: { N: cells, ...m, ice: m.sun, partial: true }, progress: m.done })
        else {
          memo[pole] = { ...m, ice: m.sun, partial: false }
          put({ heat: memo[pole], progress: 1 })
          worker.terminate()
          console.info(`[heatmap] ${pole} ${cells}x${cells} cells in ${m.ms} ms`)
        }
      }
      worker.onerror = (e) => put({ ...jobs[pole], error: e.message || 'map worker failed' })
      worker.postMessage({ dem, vec, cells, mapLimit })
    }).catch((e) => {
      put({ ...idle, error: pole === 'north' ? 'North pole terrain not found: put LDEM_75N_240M.IMG and .LBL in dem/ and run python -m engine.export_north' : e.message })
      delete jobs[pole]   // allow a retry later
    })
  }, [enabled, pole])
  return state
}

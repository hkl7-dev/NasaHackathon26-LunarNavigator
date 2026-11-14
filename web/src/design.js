// "Design your lander": re-run the power + battery models in the browser with the user's own numbers.
// Defaults match models/config.py (via engine.js CFG), so with untouched sliders every number in the
// app is exactly the precomputed one.
import { CFG, landingScan } from './engine.js'

export const DEFAULT_DESIGN = {
  area_m2: CFG.power.area_m2,
  capacity_wh: CFG.battery.capacity_wh,
  load_day_w: CFG.battery.load_day_w,
  load_night_w: CFG.battery.load_night_w,
  mission_days: 14,
}

// Illustrative presets (engineering estimates, not real spacecraft specs)
export const PRESETS = [
  { id: 'default', label: 'Baseline lander', note: 'our default assumptions (models/config.py)', d: DEFAULT_DESIGN },
  { id: 'small', label: 'Small CubeSat-class', note: 'tiny panel, tiny battery, low loads', d: { area_m2: 0.6, capacity_wh: 600, load_day_w: 45, load_night_w: 12, mission_days: 14 } },
  { id: 'rover', label: 'Rover-class', note: 'bigger array, bigger loads', d: { area_m2: 4, capacity_wh: 6000, load_day_w: 400, load_night_w: 90, mission_days: 28 } },
  { id: 'night', label: 'Survive the night', note: 'big pack to ride out long darkness', d: { area_m2: 3, capacity_wh: 25000, load_day_w: 150, load_night_w: 40, mission_days: 90 } },
]

export const SLIDERS = [
  { k: 'area_m2', label: 'Solar array area', min: 0.5, max: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)} m²` },
  { k: 'capacity_wh', label: 'Battery capacity', min: 250, max: 30000, step: 250, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 2 : 0)} kWh` : `${v} Wh`), log: true },
  { k: 'load_day_w', label: 'Science load (Sun up)', min: 20, max: 600, step: 5, fmt: (v) => `${v} W` },
  { k: 'load_night_w', label: 'Survival load (dark)', min: 5, max: 200, step: 1, fmt: (v) => `${v} W` },
  { k: 'mission_days', label: 'Mission length', min: 3, max: 120, step: 1, fmt: (v) => `${v} days` },
]

export const isDefault = (d) => Object.keys(DEFAULT_DESIGN).every((k) => d[k] === DEFAULT_DESIGN[k])
export const designKey = (d) => Object.keys(DEFAULT_DESIGN).map((k) => d[k]).join('|')

const memo = new WeakMap()
export function applyDesign(site, design) {
  if (!site || isDefault(design)) return site
  const key = designKey(design)
  let byKey = memo.get(site)
  if (!byKey) memo.set(site, (byKey = new Map()))
  if (byKey.has(key)) return byKey.get(key)

  const b = { ...CFG.battery, capacity_wh: design.capacity_wh, load_day_w: design.load_day_w, load_night_w: design.load_night_w }
  const n = site.n, dt = site.step_min / 60, scale = design.area_m2 / CFG.power.area_m2
  const power = new Float32Array(n)
  for (let k = 0; k < n; k++) power[k] = site.power_w[k] * scale

  // battery: same rule as models/battery.py
  const cap = b.capacity_wh, floor = (1 - b.dod_max) * cap, thr = 0.2 * b.load_day_w
  const soc = new Float32Array(n)
  let E = b.soc0 * cap, dead = false, run = 0, longest = 0, sumP = 0, deadAt = -1
  for (let k = 0; k < n; k++) {
    const pw = power[k], net = pw - (pw > thr ? b.load_day_w : b.load_night_w)
    E = net >= 0 ? Math.min(cap, E + net * dt * b.charge_eff) : E + (net * dt) / b.discharge_eff
    if (E < floor && !dead) { dead = true; deadAt = k }
    E = Math.max(E, 0); soc[k] = E / cap
    run = pw < thr ? run + 1 : 0; if (run > longest) longest = run
    sumP += pw
  }
  const longestH = longest * dt
  const whNeeded = (longestH * b.load_night_w) / b.discharge_eff / b.dod_max
  const out = {
    ...site,
    power_w: power, soc,
    design,
    summary: {
      ...site.summary,
      longest_dark_h: longestH,
      battery_wh_needed: Math.round(whNeeded),
      battery_mass_kg: Math.round((whNeeded / b.specific_energy_wh_kg) * 10) / 10,
      survives_default: !dead,
      first_failure_i: deadAt,
      mean_power_w: sumP / n,
    },
  }
  out.landing = landingScan(out, design.mission_days, b)
  byKey.set(key, out)
  return out
}

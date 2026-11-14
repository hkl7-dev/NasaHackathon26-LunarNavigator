// In-browser version of the Python engine + EE models, used for clicked points and the panel-height slider.
// Inputs (made by `python -m engine.export_web`): data/vectors.json and data/dem_south_960m.{bin,json}.
// Keep CFG in sync with models/config.py.
import { DATA } from './lib.js'

const R = 1737400            // m, LOLA reference sphere
const AU_KM = 1.495978707e8
const SUN_RADIUS_KM = 695700
const D2R = Math.PI / 180, R2D = 180 / Math.PI

export const CFG = {
  power: { area_m2: 2.0, efficiency: 0.30, derate: 0.85, solar_constant: 1361 },
  battery: { capacity_wh: 3000, dod_max: 0.8, charge_eff: 0.95, discharge_eff: 0.95, load_day_w: 150, load_night_w: 40, specific_energy_wh_kg: 150, soc0: 1.0 },
  comms: { freq_hz: 8.45e9, tx_power_w: 15, tx_gain_dbi: 20, tx_losses_db: 2, rx_g_over_t_dbk: 53, required_ebn0_db: 2.5, margin_db: 3, min_elev_margin_deg: 1, max_rate_bps: 2e6 },
}

let demP, vecP
function loadGrid(name) {
  return Promise.all([
    fetch(`${DATA}/${name}.json`).then((r) => { if (!r.ok) throw new Error(`${name}.json missing: run python -m engine.export_web`); return r.json() }),
    fetch(`${DATA}/${name}.bin`).then((r) => { if (!r.ok) throw new Error(`${name}.bin missing`); return r.arrayBuffer() }),
  ]).then(([m, buf]) => ({ ...m, h: new Int16Array(buf) }))
}
// coarse 960 m grid to 75S + full 240 m core around the pole
export function loadDem() {
  demP ??= Promise.all([loadGrid('dem_south_960m'), loadGrid('dem_south_240m_core')]).then(([coarse, fine]) => ({ coarse, fine }))
  return demP
}
export function loadVectors() {
  vecP ??= fetch(`${DATA}/vectors.json`).then((r) => { if (!r.ok) throw new Error('vectors.json missing: run python -m engine.export_web'); return r.json() })
  return vecP
}

// ---------- terrain ----------
export function demCovers(lat) { return lat < -75.2 }

function sampleGrid(dem, x, y) {
  const c = (x - dem.x0) / dem.pixel_m - 0.5, r = (dem.y0 - y) / dem.pixel_m - 0.5
  const n = dem.size
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c))), r0 = Math.max(0, Math.min(n - 2, Math.floor(r)))
  const fc = Math.max(0, Math.min(1, c - c0)), fr = Math.max(0, Math.min(1, r - r0))
  const h = dem.h, i = r0 * n + c0
  return (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + n] * (1 - fc) + h[i + n + 1] * fc) * fr
}

function sampleDem(dem, lat, lon) {
  const rho = 2 * R * Math.tan(Math.PI / 4 + (lat * D2R) / 2)
  const x = rho * Math.sin(lon * D2R), y = rho * Math.cos(lon * D2R)
  const f = dem.fine, edge = f.size * f.pixel_m
  if (x > f.x0 + f.pixel_m && x < f.x0 + edge - f.pixel_m && y < f.y0 - f.pixel_m && y > f.y0 - edge + f.pixel_m) return sampleGrid(f, x, y)
  return sampleGrid(dem.coarse, x, y)
}

const AZ_STEP = 0.5, NAZ = 720, ND = 600
const DIST = Array.from({ length: ND }, (_, k) => 720 * Math.pow(250000 / 720, k / (ND - 1)))  // same as engine/horizon.py

export function siteHeight(dem, lat, lon) { return sampleDem(dem, lat, lon) }

export function horizonMask(dem, lat, lon, hExtra = 2) {
  const h0 = sampleDem(dem, lat, lon) + hExtra
  const p1 = lat * D2R, l1 = lon * D2R, sp1 = Math.sin(p1), cp1 = Math.cos(p1)
  const mask = new Float32Array(NAZ)
  for (let a = 0; a < NAZ; a++) {
    const th = a * AZ_STEP * D2R, st = Math.sin(th), ct = Math.cos(th)
    let best = -90
    for (let k = 0; k < ND; k++) {
      const d = DIST[k] / R, sd = Math.sin(d), cd = Math.cos(d)
      const p2 = Math.asin(sp1 * cd + cp1 * sd * ct)
      const l2 = l1 + Math.atan2(st * sd * cp1, cd - sp1 * Math.sin(p2))
      const h = sampleDem(dem, p2 * R2D, l2 * R2D)
      const e = Math.atan2((R + h) * cd - (R + h0), (R + h) * sd) * R2D
      if (e > best) best = e
    }
    mask[a] = best
  }
  return { mask, h0: h0 - hExtra }
}

function maskAt(mask, az) {
  const x = (((az % 360) + 360) % 360) / AZ_STEP
  const i0 = Math.floor(x) % NAZ, i1 = (i0 + 1) % NAZ, f = x - Math.floor(x)
  return mask[i0] * (1 - f) + mask[i1] * f
}

function windows(flag, stepMin) {
  const out = []
  let s = -1
  for (let k = 0; k <= flag.length; k++) {
    const on = k < flag.length && flag[k]
    if (on && s < 0) s = k
    if (!on && s >= 0) { out.push({ start_i: s, end_i: k, hours: ((k - s) * stepMin) / 60 }); s = -1 }
  }
  return out
}

// ---------- full analysis for one point ----------
export function computeSite(meta, vec, dem, hExtra = 2) {
  const { lat, lon } = meta
  const terrain = !!dem && demCovers(lat)
  let mask = new Float32Array(NAZ), elev = 0
  if (terrain) ({ mask, h0: elev } = horizonMask(dem, lat, lon, hExtra))
  const n = vec.n, step = vec.step_min
  const p = lat * D2R, l = lon * D2R
  const u = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]
  const e = [-Math.sin(l), Math.cos(l), 0]
  const nn = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)]
  const rs = (R + elev + hExtra) / 1000  // km
  const site = [rs * u[0], rs * u[1], rs * u[2]]

  const altaz = (X, Y, Z, scale, k) => {
    const dx = X[k] * scale - site[0], dy = Y[k] * scale - site[1], dz = Z[k] * scale - site[2]
    const d = Math.hypot(dx, dy, dz)
    const up = (dx * u[0] + dy * u[1] + dz * u[2]) / d
    const az = Math.atan2(dx * e[0] + dy * e[1], dx * nn[0] + dy * nn[1] + dz * nn[2]) * R2D
    return [(az + 360) % 360, Math.asin(up) * R2D, d]
  }

  const sun = { az: new Float32Array(n), el: new Float32Array(n), dist_au: new Float32Array(n) }
  const earth = { az: new Float32Array(n), el: new Float32Array(n), dist_km: new Float32Array(n) }
  const vis = new Float32Array(n), emask = new Float32Array(n), evis = new Uint8Array(n)
  const power = new Float32Array(n), comms = new Uint8Array(n), rate = new Float32Array(n)
  const pc = CFG.power, cc = CFG.comms
  const vertical = Math.abs(lat) > 60
  // link budget constant part (rate depends only on distance)
  const eirp = 10 * Math.log10(cc.tx_power_w) + cc.tx_gain_dbi - cc.tx_losses_db
  for (let k = 0; k < n; k++) {
    const [saz, sel, sd] = altaz(vec.sun.x, vec.sun.y, vec.sun.z, vec.sun_units_km, k)
    const [eaz, eel, ed] = altaz(vec.earth.x, vec.earth.y, vec.earth.z, vec.earth_units_km, k)
    sun.az[k] = saz; sun.el[k] = sel; sun.dist_au[k] = sd / AU_KM
    earth.az[k] = eaz; earth.el[k] = eel; earth.dist_km[k] = ed
    const rSun = Math.asin(SUN_RADIUS_KM / sd) * R2D
    vis[k] = Math.min(1, Math.max(0, (sel - maskAt(mask, saz) + rSun) / (2 * rSun)))
    emask[k] = maskAt(mask, eaz)
    evis[k] = eel > emask[k] ? 1 : 0
    const cosi = Math.max(0, vertical ? Math.cos(sel * D2R) : Math.sin(sel * D2R))
    power[k] = (pc.solar_constant / (sun.dist_au[k] ** 2)) * pc.area_m2 * pc.efficiency * pc.derate * cosi * vis[k]
    comms[k] = eel > emask[k] + cc.min_elev_margin_deg ? 1 : 0
    const fspl = 20 * Math.log10((4 * Math.PI * ed * 1000 * cc.freq_hz) / 299792458)
    const rdb = eirp - fspl + cc.rx_g_over_t_dbk + 228.6 - (cc.required_ebn0_db + cc.margin_db)
    rate[k] = comms[k] ? Math.min(10 ** (rdb / 10), cc.max_rate_bps) / 1000 : 0
  }

  // battery
  const b = CFG.battery, dt = step / 60, cap = b.capacity_wh, floor = (1 - b.dod_max) * cap, thr = 0.2 * b.load_day_w
  const soc = new Float32Array(n)
  let E = b.soc0 * cap, dead = false, run = 0, longest = 0
  for (let k = 0; k < n; k++) {
    const pw = power[k], load = pw > thr ? b.load_day_w : b.load_night_w, net = pw - load
    E = net >= 0 ? Math.min(cap, E + net * dt * b.charge_eff) : E + (net * dt) / b.discharge_eff
    if (E < floor) dead = true
    E = Math.max(E, 0); soc[k] = E / cap
    run = pw < thr ? run + 1 : 0; if (run > longest) longest = run
  }
  const longestH = longest * dt
  const whNeeded = (longestH * b.load_night_w) / b.discharge_eff / b.dod_max
  const sunlit = Array.from(vis, (v) => v > 0.5)
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
  const both = sunlit.reduce((s, v, k) => s + (v && evis[k] ? 1 : 0), 0) / n

  return {
    site: { ...meta, elev_m: Math.round(elev), terrain, mast_m: hExtra },
    t0: vec.t0, step_min: step, n,
    sun, earth, mask: { az_step_deg: AZ_STEP, el: mask },
    sun_vis_frac: vis, earth_mask_el: emask, earth_visible: evis,
    panel_mode: vertical ? 'vertical_tracking' : 'horizontal',
    power_w: power, soc, comms_up: comms, rate_kbps: rate,
    sun_windows: windows(sunlit, step), earth_windows: windows(evis, step),
    summary: {
      pct_sunlit: mean(sunlit.map(Number)), pct_earth_visible: mean(evis), pct_both: both,
      longest_dark_h: longestH, battery_wh_needed: Math.round(whNeeded),
      battery_mass_kg: Math.round((whNeeded / b.specific_energy_wh_kg) * 10) / 10,
      survives_default: !dead, mean_power_w: mean(power), terrain,
    },
  }
}

// "Good landing dates" for a computed site: same logic as models.battery.landing_date_scan (14-day mission, daily starts)
export function landingScan(d, missionDays = 14) {
  const b = CFG.battery, step = d.step_min, dt = step / 60, per = Math.round(1440 / step)
  const len = missionDays * per, cap = b.capacity_wh, floor = (1 - b.dod_max) * cap, thr = 0.2 * b.load_day_w
  const days = []
  for (let s = 0; s + len < d.n; s += per) {
    let E = b.soc0 * cap, dead = false, minS = 1
    for (let k = s; k < s + len; k++) {
      const pw = d.power_w[k], net = pw - (pw > thr ? b.load_day_w : b.load_night_w)
      E = net >= 0 ? Math.min(cap, E + net * dt * b.charge_eff) : E + (net * dt) / b.discharge_eff
      if (E < floor) dead = true
      E = Math.max(E, 0); if (E / cap < minS) minS = E / cap
    }
    let c = 0
    for (let k = s; k < s + 2 * per; k++) c += d.comms_up[k]
    days.push({ start_i: s, survives: !dead, min_soc: minS, comms_48h: c / (2 * per) })
  }
  return { site: d.site.id, t0: d.t0, step_min: step, mission_days: missionDays, days }
}

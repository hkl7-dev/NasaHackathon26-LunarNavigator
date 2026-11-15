// Landing safety at one spot: terrain (slope, roughness, how much flat ground is nearby) from the
// LOLA polar terrain, plus the conditions at the chosen landing time (lighting, line of sight to Earth,
// ground temperature). Each check gets GO / CAUTION / NO-GO and the worst one sets the verdict.
// Thresholds: 8° is a typical lander tilt limit (Apollo LM ≈ 12°, CLPS landers 8 to 10°).
import { sampleDem } from './engine.js'

const R = 1737400
export const SAFE = { go: 8, nogo: 15 }   // slope, degrees
export const ROUGH = { go: 8, nogo: 20 }   // relief left over after removing the local tilt, metres RMS over 1 km
                                           // (typical polar plains 2 to 6 m; narrow ridges and crater rims 10 to 20 m)
const STEP = 120                            // m between slope samples (terrain is 240 m, so this is interpolated)
const BASE = 240                            // m half-baseline of the slope measurement

// local east / north offsets in metres -> lat / lon (small-distance formula, fine for a few km)
function offset(lat, lon, de, dn) {
  const la = lat + (dn / R) * (180 / Math.PI)
  const lo = lon + (de / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)
  return [la, lo]
}
const hAt = (dem, lat, lon, de, dn) => sampleDem(dem, ...offset(lat, lon, de, dn))
function slopeAt(dem, lat, lon, de, dn) {
  const gx = (hAt(dem, lat, lon, de + BASE, dn) - hAt(dem, lat, lon, de - BASE, dn)) / (2 * BASE)
  const gy = (hAt(dem, lat, lon, de, dn + BASE) - hAt(dem, lat, lon, de, dn - BASE)) / (2 * BASE)
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI
}

// slope map of a square around the spot (half = half-width in metres), plus numbers for the centre
export function terrainSafety(dem, lat, lon, half = 2400) {
  const n = Math.round((2 * half) / STEP) + 1
  const slope = new Float32Array(n * n)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    slope[r * n + c] = slopeAt(dem, lat, lon, -half + c * STEP, half - r * STEP)   // row 0 = north
  }
  // within 500 m of the spot: share of flat ground, worst slope, roughness (RMS height after removing a plane)
  const pts = []
  for (let de = -480; de <= 480; de += STEP) for (let dn = -480; dn <= 480; dn += STEP) {
    if (de * de + dn * dn <= 500 * 500) pts.push([de, dn, hAt(dem, lat, lon, de, dn), slopeAt(dem, lat, lon, de, dn)])
  }
  const m = pts.length
  // least-squares plane h = a + b·de + c·dn (de, dn symmetric around 0, so the fit separates)
  let sh = 0, sx = 0, sy = 0, sxx = 0, syy = 0
  for (const [x, y, h] of pts) { sh += h; sx += x * h; sy += y * h; sxx += x * x; syy += y * y }
  const a = sh / m, b = sx / sxx, cc = sy / syy
  let rss = 0
  for (const [x, y, h] of pts) rss += (h - a - b * x - cc * y) ** 2
  const flat = pts.filter((p) => p[3] < SAFE.go).length / m
  return {
    n, step: STEP, half, slope,
    center: slopeAt(dem, lat, lon, 0, 0),
    maxNear: Math.max(...pts.map((p) => p[3])),
    flat, rough: Math.sqrt(rss / m),
    tilt: (Math.atan(Math.hypot(b, cc)) * 180) / Math.PI,
  }
}

const LEVEL = { go: 0, caution: 1, nogo: 2 }
export function verdict(terrain, cond) {
  const checks = []
  if (terrain) {
    const s = terrain.center
    checks.push({ k: 'Slope at the spot', v: `${s.toFixed(1)}°`, lvl: s < SAFE.go ? 'go' : s < SAFE.nogo ? 'caution' : 'nogo', why: `lander tilt limit ≈ ${SAFE.go}°, tipping risk above ${SAFE.nogo}°` })
    const f = terrain.flat
    checks.push({ k: 'Flat ground within 500 m', v: `${Math.round(f * 100)}%`, lvl: f > 0.7 ? 'go' : f > 0.35 ? 'caution' : 'nogo', why: 'room to divert if the planned spot looks bad on approach' })
    const r = terrain.rough
    checks.push({ k: 'Uneven ground (1 km)', v: `${r.toFixed(1)} m`, lvl: r < ROUGH.go ? 'go' : r < ROUGH.nogo ? 'caution' : 'nogo', why: 'height left after removing the overall tilt: ridge crests, rims, mounds (boulders are too small for 240 m data)' })
  }
  if (cond) {
    checks.push({ k: 'Sunlight at landing', v: cond.lit ? `lit, Sun ${cond.sunEl.toFixed(1)}° up` : cond.sunEl > 0 ? 'in a shadow' : 'night', lvl: cond.lit ? (cond.sunEl < 3 && Math.abs(cond.lat) < 80 ? 'caution' : 'go') : 'caution', why: cond.lit ? 'cameras can see hazards; at the poles long shadows are normal' : 'needs lidar or lights to spot hazards, and no solar power on arrival' })
    checks.push({ k: 'Earth in view at landing', v: cond.earth ? 'yes' : 'no', lvl: cond.earth ? 'go' : 'caution', why: cond.earth ? 'live link during descent' : 'no direct radio link during descent: needs a relay' })
    if (cond.tempK != null) {
      const t = cond.tempK
      checks.push({ k: 'Ground temperature', v: `${Math.round(t)} K (${Math.round(t - 273.15)} °C)`, lvl: t > 380 || t < 70 ? 'caution' : 'go', why: t < 70 ? 'deep cold: heaters and cold-rated legs and seals' : t > 380 ? 'hot: thermal margins on electronics' : 'within normal lander ranges' })
    }
  }
  const worst = checks.reduce((w, c) => (LEVEL[c.lvl] > LEVEL[w] ? c.lvl : w), 'go')
  return { checks, worst }
}

export const SAFETY_COLOR = (deg) => (deg < SAFE.go ? [62, 201, 120] : deg < SAFE.nogo ? [245, 184, 75] : [230, 80, 80])

// Web worker: whole-region illumination / Earth-visibility map of the south pole.
// For every cell of a grid over the polar map it builds a coarse terrain horizon (2° azimuth bins,
// ~90 log-spaced ranges out to 150 km) from the same LOLA grids the app already loads, then
// checks Sun and Earth against it every 6 h for the whole ephemeris span.
// It is a faster, coarser version of engine.js:horizonMask, good enough for a map overlay
// (the per-site numbers in the dashboard still come from the full-resolution analysis).

const R = 1737400
const D2R = Math.PI / 180, R2D = 180 / Math.PI
const NAZ = 180, AZ_STEP = 360 / NAZ
const ND = 90, DMIN = 700, DMAX = 150000
const DIST = Array.from({ length: ND }, (_, k) => DMIN * Math.pow(DMAX / DMIN, k / (ND - 1)))
const DROP = DIST.map((d) => (d * d) / (2 * R))   // curvature drop of the far terrain, metres

function sampleGrid(g, x, y) {
  const c = (x - g.x0) / g.pixel_m - 0.5, r = (g.y0 - y) / g.pixel_m - 0.5
  const n = g.size
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c))), r0 = Math.max(0, Math.min(n - 2, Math.floor(r)))
  const fc = Math.max(0, Math.min(1, c - c0)), fr = Math.max(0, Math.min(1, r - r0))
  const h = g.h, i = r0 * n + c0
  return (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + n] * (1 - fc) + h[i + n + 1] * fc) * fr
}
function makeSampler(fine, coarse) {
  const edge = fine.size * fine.pixel_m, m = fine.pixel_m
  const fx0 = fine.x0 + m, fx1 = fine.x0 + edge - m, fy0 = fine.y0 - m, fy1 = fine.y0 - edge + m
  return (x, y) => (x > fx0 && x < fx1 && y < fy0 && y > fy1 ? sampleGrid(fine, x, y) : sampleGrid(coarse, x, y))
}

// ---- landing score: 0 (bad) .. 1 (good) ----
// Safe ground first (share of the cell flatter than SAFE_SLOPE, a typical lander tilt limit),
// then the things a solar lander needs: Sun, a line of sight to Earth, and short nights.
const SUB = 5, SLOPE_D = 480, SAFE_SLOPE = 8
const clamp01 = (v) => Math.max(0, Math.min(1, v))
function landingScore(flatFrac, sun, earth, nightDays) {
  const sunS = clamp01(sun / 0.7), earthS = clamp01(earth / 0.7), nightS = 1 - clamp01((nightDays - 3) / 17)
  const resources = 0.4 * sunS + 0.25 * earthS + 0.35 * nightS
  return clamp01((resources * Math.sqrt(flatFrac)) / 0.6)   // scaled so the best spots near the pole reach ~100
}

self.onmessage = (ev) => {
  const { dem, vec, cells, mapLimit, everyH = 6, mast = 2 } = ev.data
  const sample = makeSampler(dem.fine, dem.coarse)
  const every = Math.max(1, Math.round((everyH * 60) / vec.step_min))
  const T = Math.floor(vec.n / every)
  // Sun / Earth positions in the Moon-fixed frame (km), subsampled
  const S = new Float64Array(T * 3), E = new Float64Array(T * 3)
  for (let t = 0; t < T; t++) {
    const k = t * every
    S[3 * t] = vec.sun.x[k] * vec.sun_units_km; S[3 * t + 1] = vec.sun.y[k] * vec.sun_units_km; S[3 * t + 2] = vec.sun.z[k] * vec.sun_units_km
    E[3 * t] = vec.earth.x[k] * vec.earth_units_km; E[3 * t + 1] = vec.earth.y[k] * vec.earth_units_km; E[3 * t + 2] = vec.earth.z[k] * vec.earth_units_km
  }
  const stepH = (every * vec.step_min) / 60

  // grid over the map disk: cell centres in map-normalised coords u,v in [-1,1]
  const N = cells
  const sun = new Float32Array(N * N).fill(NaN), earth = new Float32Array(N * N).fill(NaN)
  const both = new Float32Array(N * N).fill(NaN), night = new Float32Array(N * N).fill(NaN)
  const slope = new Float32Array(N * N).fill(NaN), score = new Float32Array(N * N).fill(NaN)
  const sg = dem.s ?? -1   // -1 south pole, +1 north pole
  const rhoMax = 2 * R * Math.tan(((90 - sg * mapLimit) * D2R) / 2)  // stereographic radius of the map edge, metres
  const cellM = (2 * rhoMax) / N   // cell size in map metres
  const mask = new Float32Array(NAZ)
  const t0 = performance.now()

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const u = ((c + 0.5) / N) * 2 - 1, v = 1 - ((r + 0.5) / N) * 2
      if (u * u + v * v > 1) continue
      const x = u * rhoMax, y = v * rhoMax              // map: 90°E right; 0°E up (south) or down (north), as PolarMap
      const rho = Math.hypot(x, y)
      const lon = Math.atan2(x, -sg * y)
      const colat = 2 * Math.atan(rho / (2 * R))
      const lat = sg * (Math.PI / 2 - colat)
      const kScale = 1 / Math.cos(colat / 2) ** 2   // stereographic scale factor
      const h0 = sample(x, y) + mast
      // geographic north and east unit vectors in the map plane
      const nx = -sg * Math.sin(lon), ny = Math.cos(lon), ex = Math.cos(lon), ey = sg * Math.sin(lon)

      // coarse horizon mask
      for (let a = 0; a < NAZ; a++) {
        const th = a * AZ_STEP * D2R, ca = Math.cos(th), sa = Math.sin(th)
        const dx = (nx * ca + ex * sa) * kScale, dy = (ny * ca + ey * sa) * kScale
        let best = -1e9
        for (let k = 0; k < ND; k++) {
          const d = DIST[k]
          const tanE = (sample(x + dx * d, y + dy * d) - h0 - DROP[k]) / d
          if (tanE > best) best = tanE
        }
        mask[a] = Math.atan(best) * R2D
      }

      // local frame (Moon-fixed): up, east, north
      const cp = Math.cos(lat), sp = Math.sin(lat), cl = Math.cos(lon), sl = Math.sin(lon)
      const U = [cp * cl, cp * sl, sp], Ea = [-sl, cl, 0], No = [-sp * cl, -sp * sl, cp]
      const rs = (R + h0) / 1000
      const P = [rs * U[0], rs * U[1], rs * U[2]]
      const look = (X, t) => {
        const dx = X[3 * t] - P[0], dy = X[3 * t + 1] - P[1], dz = X[3 * t + 2] - P[2]
        const d = Math.hypot(dx, dy, dz)
        const el = Math.asin((dx * U[0] + dy * U[1] + dz * U[2]) / d) * R2D
        let az = Math.atan2(dx * Ea[0] + dy * Ea[1], dx * No[0] + dy * No[1] + dz * No[2]) * R2D
        if (az < 0) az += 360
        const f = az / AZ_STEP, i0 = Math.floor(f) % NAZ, i1 = (i0 + 1) % NAZ, w = f - Math.floor(f)
        return el - (mask[i0] * (1 - w) + mask[i1] * w)
      }
      let ns = 0, ne = 0, nb = 0, run = 0, longest = 0
      for (let t = 0; t < T; t++) {
        const s = look(S, t) > 0, e = look(E, t) > 0
        ns += s; ne += e; nb += s && e
        run = s ? 0 : run + 1; if (run > longest) longest = run
      }
      const idx = r * N + c
      sun[idx] = ns / T; earth[idx] = ne / T; both[idx] = nb / T; night[idx] = (longest * stepH) / 24

      // terrain slope: 5 x 5 samples spread over the cell, central differences over 480 m
      let sSum = 0, flat = 0
      for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
        const px = x + ((a + 0.5) / SUB - 0.5) * cellM, py = y + ((b + 0.5) / SUB - 0.5) * cellM
        const gx = (sample(px + SLOPE_D, py) - sample(px - SLOPE_D, py)) / (2 * SLOPE_D)
        const gy = (sample(px, py + SLOPE_D) - sample(px, py - SLOPE_D)) / (2 * SLOPE_D)
        const deg = Math.atan(Math.hypot(gx, gy) * kScale) * R2D
        sSum += deg; if (deg < SAFE_SLOPE) flat++
      }
      slope[idx] = sSum / (SUB * SUB)
      score[idx] = landingScore(flat / (SUB * SUB), sun[idx], earth[idx], night[idx])
    }
    if (r % 4 === 3 || r === N - 1) self.postMessage({ type: 'progress', done: (r + 1) / N, sun, earth, both, night, slope, score })
  }
  self.postMessage({ type: 'done', N, sun, earth, both, night, slope, score, ms: Math.round(performance.now() - t0), everyH })
}

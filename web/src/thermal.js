// Surface temperature estimate for a site, hour by hour, from the same Sun data as the power model.
// Two-layer regolith model (tuned so the equator swings between about 390 K at noon and 95 K before dawn, as Diviner measures):
// settles at the long-term mean, plus the Moon's interior heat flow from below. Parameters follow
// Hayne et al. 2017 (Diviner regolith properties): albedo 0.12, emissivity 0.95, heat flow 0.018 W/m².
// It treats the ground as flat and ignores light and infrared scattered from nearby slopes, so inside
// permanent shadow it gives a lower bound (real cold-trap floors read 25 to 70 K in Diviner data).
const SIGMA = 5.670374e-8
export const THERMAL = { albedo: 0.12, emissivity: 0.95, heat_flow: 0.018, c_top: 2e4, c_deep: 1e6, k_couple: 0.04, solar_constant: 1361 }
export const ICE_STABLE_K = 110   // water ice survives billions of years below about 110 K (Vasavada et al. 1999)

export function surfaceTemps(site, P = THERMAL) {
  const n = site.n, dt = site.step_min * 60, e = P.emissivity * SIGMA
  const absorbed = new Float32Array(n)
  let mean = 0
  for (let k = 0; k < n; k++) {
    const el = site.sun.el[k], d = site.sun.dist_au[k] || 1
    const f = el > 0 ? (P.solar_constant / (d * d)) * Math.sin((el * Math.PI) / 180) * (site.sun_vis_frac[k] ?? 0) * (1 - P.albedo) : 0
    absorbed[k] = f; mean += f
  }
  mean /= n
  // start the deep layer near its long-term balance, then spin up over the first 60 days
  let deep = Math.pow((mean * 0.7 + P.heat_flow) / e, 0.25), top = deep
  const T = new Float32Array(n)
  const sub = Math.max(1, Math.ceil(dt / 600)), h = dt / sub
  const spin = Math.min(n, Math.round((60 * 86400) / dt))
  for (let pass = 0; pass < 2; pass++) {
    for (let k = pass ? 0 : n - spin; k < n; k++) {
      for (let s = 0; s < sub; s++) {
        const flow = P.k_couple * (deep - top)
        top += ((absorbed[k] - e * top ** 4 + flow) / P.c_top) * h
        deep += ((P.heat_flow - flow) / P.c_deep) * h
        if (top < 3) top = 3
      }
      if (pass) T[k] = top
    }
  }
  let min = Infinity, max = -Infinity
  for (let k = 0; k < n; k++) { if (T[k] < min) min = T[k]; if (T[k] > max) max = T[k] }
  return { T, min, max, iceStable: max < ICE_STABLE_K }
}

export const toC = (K) => K - 273.15

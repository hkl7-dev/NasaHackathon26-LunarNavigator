import { useMemo } from 'react'

// Horizon panorama: azimuth across, elevation up. Terrain is drawn on top, so it hides the Sun/Earth naturally.
const W = 900, H = 300, PAD = 28

export default function SkyDome({ site, i }) {
  const polar = Math.abs(site.site.lat) > 60
  const [elMin, elMax] = polar ? [-6, 14] : [-15, 90]
  const x = (az) => PAD + (((az % 360) + 360) % 360) / 360 * (W - 2 * PAD)
  const y = (el) => H - PAD - ((el - elMin) / (elMax - elMin)) * (H - 2 * PAD)
  const pxPerDeg = (H - 2 * PAD) / (elMax - elMin)

  const terrain = useMemo(() => {
    const m = site.mask.el, step = site.mask.az_step_deg
    let d = `M ${x(0)} ${H - PAD}`
    for (let k = 0; k <= m.length; k++) d += ` L ${PAD + (k * step) / 360 * (W - 2 * PAD)} ${y(Math.max(elMin, m[k % m.length]))}`
    return d + ` L ${W - PAD} ${H - PAD} Z`
  }, [site])

  // Sun path for the next 30 days (one dot every 6 h)
  const trail = useMemo(() => {
    const out = [], every = Math.max(1, Math.round(360 / site.step_min))
    for (let k = i; k < Math.min(site.n, i + (30 * 1440) / site.step_min); k += every)
      out.push([site.sun.az[k], site.sun.el[k]])
    return out
  }, [site, i])

  const sAz = site.sun.az[i], sEl = site.sun.el[i]
  const eAz = site.earth.az[i], eEl = site.earth.el[i]
  const rSun = Math.max(7, 0.266 * pxPerDeg), rEarth = Math.max(10, 0.95 * pxPerDeg)
  const lit = site.sun_vis_frac[i] > 0.5

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dome">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#05070d" /><stop offset="100%" stopColor={lit ? '#1b2235' : '#0b0e16'} />
        </linearGradient>
        <radialGradient id="sunGlow"><stop offset="0%" stopColor="#fff6c8" /><stop offset="55%" stopColor="#ffcc4d" /><stop offset="100%" stopColor="#ffcc4d00" /></radialGradient>
        <radialGradient id="earthFill" cx="35%" cy="35%"><stop offset="0%" stopColor="#9fd8ff" /><stop offset="100%" stopColor="#1f6fb2" /></radialGradient>
        <clipPath id="plot"><rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} /></clipPath>
      </defs>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="url(#sky)" />
      <g clipPath="url(#plot)">
        {trail.map(([a, e], k) => <circle key={k} cx={x(a)} cy={y(e)} r={1.6} fill="#ffcc4d" opacity={0.15 + 0.5 * (1 - k / trail.length)} />)}
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#c94a4a" strokeDasharray="4 4" opacity="0.7" />
        <circle cx={x(eAz)} cy={y(eEl)} r={rEarth} fill="url(#earthFill)" stroke="#bfe6ff" strokeWidth="1" />
        <circle cx={x(sAz)} cy={y(sEl)} r={rSun * 2.2} fill="url(#sunGlow)" />
        <circle cx={x(sAz)} cy={y(sEl)} r={rSun} fill="#fff3b0" />
        <path d={terrain} fill="#4a4d55" stroke="#8a8f99" strokeWidth="1" />
      </g>
      {[[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']].map(([a, t]) =>
        <text key={t} x={x(a)} y={H - 8} className="axis" textAnchor="middle">{t}</text>)}
      {[elMin, 0, polar ? 5 : 30, polar ? 10 : 60].map((e) =>
        <text key={e} x={PAD - 6} y={y(e) + 4} className="axis" textAnchor="end">{e}°</text>)}
      <text x={W - PAD} y={PAD - 8} className="axis" textAnchor="end">
        <tspan fill="#ffcc4d">● Sun {sEl.toFixed(2)}°</tspan>{'   '}
        <tspan fill="#7cc4ff">● Earth {eEl.toFixed(2)}°</tspan>{'   '}
        <tspan fill="#c94a4a">- - flat horizon</tspan>
      </text>
      <text x={PAD} y={PAD - 8} className="axis">Dots: Sun path, next 30 days{polar ? '. At the pole the Sun circles the horizon.' : ''}</text>
    </svg>
  )
}

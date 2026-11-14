import { useMemo, useState } from 'react'
import { GROUP_COLORS } from '../lib.js'
import { LAYERS, useHeatmap, renderLayer, gradientCss } from '../heatmap.js'

// South polar stereographic map, 0°E at top, 90°E to the right (same as LOLA polar products)
const SIZE = 300, R = 135, LIMIT = -79
const scale = R / Math.tan(((90 + LIMIT) * Math.PI) / 360)
function project(lat, lon) {
  const rho = scale * Math.tan(((90 + lat) * Math.PI) / 360)
  const a = (lon * Math.PI) / 180
  return [SIZE / 2 + rho * Math.sin(a), SIZE / 2 - rho * Math.cos(a)]
}

function unproject(px, py) {
  const dx = px - SIZE / 2, dy = SIZE / 2 - py
  const rho = Math.hypot(dx, dy)
  const lat = (2 * Math.atan(rho / scale) * 180) / Math.PI - 90
  const lon = (Math.atan2(dx, dy) * 180) / Math.PI
  return [lat, lon]
}

function toSvg(e) {
  const svg = e.currentTarget
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
  return pt.matrixTransform(svg.getScreenCTM().inverse())
}

export default function PolarMap({ sites, focus, onFocus, custom, onPick, layer = 'none', onLayer }) {
  const polar = sites.filter((s) => s.lat <= LIMIT + 0.5)
  const { heat, progress, error } = useHeatmap(layer !== 'none', { mapLimit: LIMIT })
  const img = useMemo(() => (heat && layer !== 'none' ? renderLayer(heat, layer) : null), [heat, layer])
  const [hover, setHover] = useState(null)
  const click = (e) => {
    const p = toSvg(e)
    const [lat, lon] = unproject(p.x, p.y)
    if (lat <= LIMIT) onPick(lat, lon)
  }
  const move = (e) => {
    if (!heat || layer === 'none') return setHover(null)
    const p = toSvg(e)
    const u = (p.x - SIZE / 2) / R, v = (SIZE / 2 - p.y) / R
    if (u * u + v * v > 1) return setHover(null)
    const N = heat.N, c = Math.floor(((u + 1) / 2) * N), r = Math.floor(((1 - v) / 2) * N)
    const val = heat[layer][r * N + c]
    const [lat, lon] = unproject(p.x, p.y)
    setHover(Number.isNaN(val) ? null : { val, lat, lon })
  }
  const cp = custom && custom.lat <= LIMIT + 0.5 ? project(custom.lat, custom.lon) : null
  return (
    <div className="card">
      <div className="card-head"><h2>South pole</h2><span className="muted">click anywhere to analyse it</span></div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="polar" onClick={click} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <defs>
          <clipPath id="disk"><circle cx={SIZE / 2} cy={SIZE / 2} r={R} /></clipPath>
          <radialGradient id="moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3a3f4b" /><stop offset="100%" stopColor="#1d2029" />
          </radialGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#moon)" stroke="var(--line)" />
        {img && <image href={img} x={SIZE / 2 - R} y={SIZE / 2 - R} width={2 * R} height={2 * R} clipPath="url(#disk)" preserveAspectRatio="none" style={{ imageRendering: 'auto' }} />}
        {[-80, -85, -88].map((lat) => {
          const [, y] = project(lat, 0)
          return <g key={lat}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - y} fill="none" stroke="var(--grid)" strokeDasharray="2 3" />
            <text x={SIZE / 2 + 3} y={y + 10} className="tiny">{lat}°</text>
          </g>
        })}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((lon) => {
          const [x, y] = project(LIMIT, lon)
          return <line key={lon} x1={SIZE / 2} y1={SIZE / 2} x2={x} y2={y} stroke="var(--grid)" />
        })}
        {[[0, '0°'], [90, '90°E'], [180, '180°'], [-90, '90°W']].map(([lon, t]) => {
          const [x, y] = project(LIMIT - 1.2, lon)
          return <text key={t} x={x} y={y} className="tiny" textAnchor="middle" dominantBaseline="middle">{t}</text>
        })}
        <text x={SIZE / 2} y={SIZE / 2 - 5} className="tiny" textAnchor="middle">✕ pole</text>
        {polar.map((s) => {
          const [x, y] = project(s.lat, s.lon)
          const on = s.id === focus
          return <g key={s.id} onClick={(e) => { e.stopPropagation(); onFocus(s.id) }} style={{ cursor: 'pointer' }}>
            <circle cx={x} cy={y} r={on ? 8 : 5.5} fill={GROUP_COLORS[s.group] || '#ccc'} stroke={on ? '#fff' : '#0008'} strokeWidth={on ? 2 : 1} />
            <title>{s.name}</title>
          </g>
        })}
        {cp && <g onClick={(e) => { e.stopPropagation(); onFocus('custom') }} style={{ cursor: 'pointer' }}>
          <circle cx={cp[0]} cy={cp[1]} r={focus === 'custom' ? 9 : 7} fill="none" stroke="#fff" strokeWidth="2" />
          <line x1={cp[0] - 12} x2={cp[0] + 12} y1={cp[1]} y2={cp[1]} stroke="#fff" />
          <line x1={cp[0]} x2={cp[0]} y1={cp[1] - 12} y2={cp[1] + 12} stroke="#fff" />
          <title>Custom point</title>
        </g>}
      </svg>
      <div className="layers">
        <div className="seg">
          <button className={'btn small ' + (layer === 'none' ? 'on' : '')} onClick={() => onLayer?.('none')}>Terrain</button>
          {Object.entries(LAYERS).map(([k, L]) => <button key={k} className={'btn small ' + (layer === k ? 'on' : '')} onClick={() => onLayer?.(k)}>{L.label}</button>)}
        </div>
        {layer !== 'none' && <div className="layer-info">
          {error ? <span className="bad-text">{error}</span>
            : progress < 1 ? <span className="busy">Mapping the whole region… {Math.round(progress * 100)}%</span>
              : hover ? <span className="mono">{LAYERS[layer].fmt(hover.val)} <span className="muted">{LAYERS[layer].unit} at {hover.lat.toFixed(2)}°, {hover.lon.toFixed(1)}°E</span></span>
                : <span className="muted">{LAYERS[layer].unit}, Jan 2026 onward, every 6 h · hover to read, click to analyse</span>}
          <div className="ramp"><span>{LAYERS[layer].fmt(LAYERS[layer].range[0])}</span><i style={{ background: gradientCss(layer) }} /><span>{LAYERS[layer].fmt(LAYERS[layer].range[1])}+</span></div>
        </div>}
      </div>
    </div>
  )
}

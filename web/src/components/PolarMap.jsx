import { GROUP_COLORS } from '../lib.js'

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

export default function PolarMap({ sites, focus, onFocus, custom, onPick }) {
  const polar = sites.filter((s) => s.lat <= LIMIT + 0.5)
  const click = (e) => {
    const svg = e.currentTarget
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    const [lat, lon] = unproject(p.x, p.y)
    if (lat <= LIMIT) onPick(lat, lon)
  }
  const cp = custom && custom.lat <= LIMIT + 0.5 ? project(custom.lat, custom.lon) : null
  return (
    <div className="card">
      <div className="card-head"><h2>South pole</h2><span className="muted">click anywhere to analyse it</span></div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="polar" onClick={click}>
        <defs>
          <radialGradient id="moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3a3f4b" /><stop offset="100%" stopColor="#1d2029" />
          </radialGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#moon)" stroke="var(--line)" />
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
    </div>
  )
}

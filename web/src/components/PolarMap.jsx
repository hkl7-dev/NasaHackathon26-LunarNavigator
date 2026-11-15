import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { GROUP_COLORS } from '../lib.js'
import { LAYERS, useHeatmap, renderLayer, gradientCss } from '../heatmap.js'

// Polar stereographic maps, 90°E to the right, as in the LOLA polar products:
// south pole with 0°E at the top, north pole with 0°E at the bottom. sg = -1 south, +1 north.
const SIZE = 300, R = 135, EDGE = 79   // map reaches 79° latitude
const POLES = {
  south: { sg: -1, limit: -EDGE, title: 'South pole' },
  north: { sg: 1, limit: EDGE, title: 'North pole' },
}
const scale = R / Math.tan(((90 - EDGE) * Math.PI) / 360)
function project(lat, lon, sg) {
  const rho = scale * Math.tan(((90 - sg * lat) * Math.PI) / 360)
  const a = (lon * Math.PI) / 180
  return [SIZE / 2 + rho * Math.sin(a), SIZE / 2 + sg * rho * Math.cos(a)]
}

function unproject(px, py, sg) {
  const dx = px - SIZE / 2, dy = SIZE / 2 - py
  const rho = Math.hypot(dx, dy)
  const lat = sg * (90 - (2 * Math.atan(rho / scale) * 180) / Math.PI)
  const lon = (Math.atan2(dx, -sg * dy) * 180) / Math.PI
  return [lat, lon]
}

// Named north polar craters (approximate centres), shown as labels; clicking one analyses it
export const NORTH_FEATURES = [
  { id: 'feat:peary', name: 'Peary (rim lit, floor dark)', lat: 88.63, lon: 24.4 },
  { id: 'feat:whipple', name: 'Whipple (shadowed)', lat: 89.1, lon: 118.2 },
  { id: 'feat:hermite', name: 'Hermite (~25 K)', lat: 86.04, lon: -89.9 },
  { id: 'feat:rozhdestvenskiy', name: 'Rozhdestvenskiy (shadowed floor)', lat: 85.2, lon: -155 },
  { id: 'feat:byrd', name: 'Byrd', lat: 85.3, lon: 9.8 },
  { id: 'feat:plaskett', name: 'Plaskett', lat: 82.1, lon: 174.3 },
].map((f) => ({ ...f, group: 'Shadowed crater' }))

const Terrain3D = lazy(() => import('./Terrain3D.jsx'))

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
function savedView() {
  try { const v = localStorage.getItem('mapView'); if (v === '2d' || v === '3d') return v } catch { /* storage blocked */ }
  return hasWebGL() ? '3d' : '2d'
}

// layer value at a lat/lon (same grid as the worker: map-normalised u, v in [-1, 1])
function valueAt(heat, layer, lat, lon, sg) {
  const rho = Math.tan(((90 - sg * lat) * Math.PI) / 360) / Math.tan(((90 - EDGE) * Math.PI) / 360)
  const a = (lon * Math.PI) / 180, u = rho * Math.sin(a), v = -sg * rho * Math.cos(a)
  if (u * u + v * v > 1) return NaN
  const N = heat.N, c = Math.min(N - 1, Math.floor(((u + 1) / 2) * N)), r = Math.min(N - 1, Math.floor(((1 - v) / 2) * N))
  return heat[layer][r * N + c]
}

function toSvg(e) {
  const svg = e.currentTarget
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
  return pt.matrixTransform(svg.getScreenCTM().inverse())
}

export default function PolarMap({ sites, focus, onFocus, custom, onPick, layer = 'none', onLayer, time }) {
  const [pole, setPole] = useState(() => (custom && custom.lat > 0 && location.hash.includes('site=custom') ? 'north' : 'south'))
  const { sg, limit: LIMIT, title } = POLES[pole]
  const inside = (lat, pad = 0) => sg * lat >= sg * LIMIT - pad
  const polar = useMemo(() => (pole === 'north'
    ? [...sites.filter((s) => s.lat >= EDGE - 0.5), ...NORTH_FEATURES]
    : sites.filter((s) => s.lat <= -EDGE + 0.5)), [sites, pole])
  const { heat, progress, error } = useHeatmap(layer !== 'none', { mapLimit: LIMIT, pole })
  // named craters are not curated sites: clicking one runs the full analysis at that spot
  const focusOrPick = useCallback((id) => {
    const f = NORTH_FEATURES.find((x) => x.id === id)
    if (f) onPick(f.lat, f.lon); else onFocus(id)
  }, [onFocus, onPick])
  const switchPole = (p) => {
    if (p === pole) return
    setPole(p); setHover(null); setFail3d(null)
    if (p === 'north' && (layer === 'none' || layer === 'score')) onLayer?.('ice')
  }
  const [view, setViewRaw] = useState(savedView)
  const [fail3d, setFail3d] = useState(null)
  const [big, setBig] = useState(false)
  const is3d = view === '3d' && !fail3d
  const img = useMemo(() => (heat && layer !== 'none' && !is3d ? renderLayer(heat, layer) : null), [heat, layer, is3d])
  const [hover, setHover] = useState(null)
  const setView = (v) => { setViewRaw(v); try { localStorage.setItem('mapView', v) } catch { /* ignore */ } }
  useEffect(() => {
    if (!big) return
    const k = (e) => e.key === 'Escape' && setBig(false)
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [big])
  const hover3d = useCallback((p) => {
    if (!p || !heat || layer === 'none') return setHover(null)
    const val = valueAt(heat, layer, p.lat, p.lon, sg)
    setHover(Number.isNaN(val) ? null : { val, lat: p.lat, lon: p.lon, slope: valueAt(heat, 'slope', p.lat, p.lon, sg) })
  }, [heat, layer, sg])
  const click = (e) => {
    const p = toSvg(e)
    const [lat, lon] = unproject(p.x, p.y, sg)
    if (inside(lat)) onPick(lat, lon)
  }
  const move = (e) => {
    if (!heat || layer === 'none') return setHover(null)
    const p = toSvg(e)
    const u = (p.x - SIZE / 2) / R, v = (SIZE / 2 - p.y) / R
    if (u * u + v * v > 1) return setHover(null)
    const N = heat.N, c = Math.floor(((u + 1) / 2) * N), r = Math.floor(((1 - v) / 2) * N)
    const val = heat[layer][r * N + c]
    const [lat, lon] = unproject(p.x, p.y, sg)
    setHover(Number.isNaN(val) ? null : { val, lat, lon, slope: heat.slope?.[r * N + c] })
  }
  const cp = custom && inside(custom.lat, 0.5) ? project(custom.lat, custom.lon, sg) : null
  return (
    <div className={'card map-card' + (big ? ' big' : '')}>
      <div className="card-head">
        <h2>{title}</h2>
        <div className="seg">
          <button className={'btn small ' + (pole === 'south' ? 'on' : '')} onClick={() => switchPole('south')} title="South polar region">S</button>
          <button className={'btn small ' + (pole === 'north' ? 'on' : '')} onClick={() => switchPole('north')} title="North polar region: water ice in permanent shadow">N</button>
          <span className="seg-gap" />
          <button className={'btn small ' + (is3d ? 'on' : '')} onClick={() => { setFail3d(null); setView('3d') }} title="3D terrain lit by the real Sun">3D</button>
          <button className={'btn small ' + (!is3d ? 'on' : '')} onClick={() => setView('2d')} title="Flat polar map">2D</button>
          <button className="btn small" onClick={() => setBig((b) => !b)} title={big ? 'Back to the sidebar (Esc)' : 'Enlarge the map'}>{big ? '✕' : '⤢'}</button>
        </div>
      </div>
      <div className="muted map-hint">{is3d ? 'drag to orbit · right-drag to pan · scroll to zoom · click the ground to analyse it' : 'click anywhere to analyse it'}</div>
      {fail3d && <div className="muted bad-text">3D view unavailable ({pole === 'north' && /missing|404/.test(fail3d) ? 'north pole terrain not exported yet: run python -m engine.export_north' : fail3d}), showing the 2D map.</div>}
      {is3d ? (
        <Suspense fallback={<div className="t3d-wrap"><div className="t3d"><div className="t3d-loading busy">Loading 3D view…</div></div></div>}>
          <Terrain3D key={pole} pole={pole} sites={polar} focus={focus} custom={custom} onFocus={focusOrPick} onPick={onPick} onHover={hover3d}
            heat={heat} layer={layer} time={time} limit={LIMIT} expanded={big} onFail={setFail3d} />
        </Suspense>
      ) : <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="polar" onClick={click} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <defs>
          <clipPath id="disk"><circle cx={SIZE / 2} cy={SIZE / 2} r={R} /></clipPath>
          <radialGradient id="moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3a3f4b" /><stop offset="100%" stopColor="#1d2029" />
          </radialGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#moon)" stroke="var(--line)" />
        {img && <image href={img} x={SIZE / 2 - R} y={SIZE / 2 - R} width={2 * R} height={2 * R} clipPath="url(#disk)" preserveAspectRatio="none" style={{ imageRendering: 'auto' }} />}
        {[80, 85, 88].map((a) => {
          const lat = sg * a, r = scale * Math.tan(((90 - a) * Math.PI) / 360)
          return <g key={lat}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--grid)" strokeDasharray="2 3" />
            <text x={SIZE / 2 + 3} y={SIZE / 2 - r + 10} className="tiny">{lat}°</text>
          </g>
        })}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((lon) => {
          const [x, y] = project(LIMIT, lon, sg)
          return <line key={lon} x1={SIZE / 2} y1={SIZE / 2} x2={x} y2={y} stroke="var(--grid)" />
        })}
        {[[0, '0°'], [90, '90°E'], [180, '180°'], [-90, '90°W']].map(([lon, t]) => {
          const [x, y] = project(LIMIT - sg * 1.2, lon, sg)
          return <text key={t} x={x} y={y} className="tiny" textAnchor="middle" dominantBaseline="middle">{t}</text>
        })}
        <text x={SIZE / 2} y={SIZE / 2 - 5} className="tiny" textAnchor="middle">✕ pole</text>
        {polar.map((s) => {
          const [x, y] = project(s.lat, s.lon, sg)
          const on = s.id === focus
          return <g key={s.id} onClick={(e) => { e.stopPropagation(); focusOrPick(s.id) }} style={{ cursor: 'pointer' }}>
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
      </svg>}
      {pole === 'north' && <div className="ice-note">
        <b>Water ice, but no power.</b> Crater floors here never see the Sun and some stay near 25 K (−248 °C), cold enough to trap water ice.
        NASA's M³ instrument (Chandrayaan-1) detected surface ice in such shadowed spots at both poles.
        No Sun also means no solar power, rarely a view of Earth, and steep walls: great science, hard landing.
        Icy blue = never sunlit in our 3-year run.
      </div>}
      <div className="layers">
        <div className="seg">
          <button className={'btn small ' + (layer === 'none' ? 'on' : '')} onClick={() => onLayer?.('none')}>Terrain</button>
          {Object.entries(LAYERS).map(([k, L]) => <button key={k} className={'btn small ' + (layer === k ? 'on' : '')} onClick={() => onLayer?.(k)}>{L.label}</button>)}
        </div>
        {layer !== 'none' && <div className="layer-info">
          {error ? <span className="bad-text">{error}</span>
            : progress < 1 ? <span className="busy">Mapping the whole region… {Math.round(progress * 100)}%</span>
              : hover ? <span className="mono">{LAYERS[layer].fmt(hover.val)} <span className="muted">{layer === 'score' ? `· mean slope ${hover.slope?.toFixed(1)}°` : layer === 'ice' ? '' : LAYERS[layer].unit} at {hover.lat.toFixed(2)}°, {hover.lon.toFixed(1)}°E</span></span>
                : <span className="muted">{LAYERS[layer].unit}, Jan 2026 onward, every 6 h · hover to read, click to analyse</span>}
          <div className="ramp"><span>{LAYERS[layer].fmt(LAYERS[layer].range[0])}</span><i style={{ background: gradientCss(layer) }} /><span>{LAYERS[layer].fmt(LAYERS[layer].range[1])}+</span></div>
        </div>}
      </div>
    </div>
  )
}

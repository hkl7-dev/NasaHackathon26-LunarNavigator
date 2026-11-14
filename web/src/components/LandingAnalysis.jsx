import { useEffect, useMemo, useRef, useState } from 'react'
import { DATA } from '../lib.js'

// Advanced "good landing dates" analysis: launch windows, calendar heatmap, battery margin, Earth contact, multi-site
const STATUS = {
  good: { color: '#59d6a4', label: 'Good', icon: '✓', text: 'Survives 14 days and has Earth contact after landing' },
  warn: { color: '#ffb35c', label: 'Marginal', icon: '~', text: 'Survives, but weak Earth contact in the first 48 h' },
  bad: { color: '#ff6b6b', label: 'Fails', icon: '✕', text: 'Battery runs below the safe floor within 14 days' },
}
const status = (d) => (!d.survives ? 'bad' : d.comms_48h > 0.8 ? 'good' : 'warn')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const cache = {}
function useLanding(site, id) {
  const [scan, setScan] = useState(site?.landing || cache[id] || null)
  useEffect(() => {
    if (site?.landing) { setScan(site.landing); return }
    if (cache[id]) { setScan(cache[id]); return }
    setScan(null)
    let alive = true
    fetch(`${DATA}/extra/landing_${id}.json`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) cache[id] = d; if (alive) setScan(d) }).catch(() => alive && setScan(null))
    return () => { alive = false }
  }, [id, site])
  return scan
}

function enrich(scan) {
  const t0 = Date.parse(scan.t0), stepMs = scan.step_min * 60000
  return scan.days.map((d) => ({ ...d, date: new Date(t0 + d.start_i * stepMs), st: status(d) }))
}

function longestWindow(days) {
  let best = null, s = null
  days.forEach((d, k) => {
    if (d.st === 'good') { if (s === null) s = k } else s = null
    if (s !== null && (!best || k - s + 1 > best.len)) best = { start: days[s], end: d, len: k - s + 1 }
  })
  return best
}

const fmt = (d) => d.toISOString().slice(0, 10)

// ---------- tooltip ----------
function useTip() {
  const [tip, setTip] = useState(null)
  const ref = useRef()
  const show = (e, lines) => {
    const r = ref.current.getBoundingClientRect()
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines })
  }
  const el = tip && (
    <div className="tip" style={{ left: Math.min(tip.x + 14, (ref.current?.clientWidth || 600) - 230), top: tip.y + 14 }}>
      {tip.lines.map(([v, l, c], k) => (
        <div key={k} className="tip-row">{c && <span className="tip-key" style={{ background: c }} />}<strong>{v}</strong><span>{l}</span></div>
      ))}
    </div>
  )
  return { ref, show, hide: () => setTip(null), el }
}

const dayTip = (d) => [
  [fmt(d.date), 'landing date'],
  [`${STATUS[d.st].icon} ${STATUS[d.st].label}`, STATUS[d.st].text, STATUS[d.st].color],
  [`${Math.round(d.min_soc * 100)}%`, 'lowest battery during mission'],
  [`${Math.round(d.comms_48h * 100)}%`, 'Earth contact, first 48 h'],
]

// ---------- calendar heatmap ----------
function Calendar({ days, i, onSeek }) {
  const years = [...new Set(days.map((d) => d.date.getUTCFullYear()))]
  const curYear = days.find((d) => d.start_i >= i)?.date.getUTCFullYear() ?? years[0]
  const [year, setYear] = useState(curYear)
  useEffect(() => setYear(curYear), [curYear])
  const tip = useTip()
  const W = 900, LBL = 44, CW = (W - LBL - 4) / 31, CH = 20, H = 12 * CH + 22
  const inYear = days.filter((d) => d.date.getUTCFullYear() === year)
  const cur = days.reduce((a, d) => (d.start_i <= i ? d : a), days[0])
  return (
    <div className="chart-block" ref={tip.ref}>
      <div className="chart-title">
        <span>Landing calendar</span>
        <div className="seg">{years.map((y) => <button key={y} className={'btn small ' + (y === year ? 'on' : '')} onClick={() => setYear(y)}>{y}</button>)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseLeave={tip.hide}>
        {Array.from({ length: 31 }, (_, d) => (d % 5 === 0 || d === 30) &&
          <text key={d} x={LBL + d * CW + CW / 2} y={10} className="axis" textAnchor="middle">{d + 1}</text>)}
        {MONTHS.map((m, k) => <text key={m} x={LBL - 8} y={20 + k * CH + CH / 2 + 4} className="axis" textAnchor="end">{m}</text>)}
        {inYear.map((d) => {
          const m = d.date.getUTCMonth(), dd = d.date.getUTCDate() - 1
          const isCur = d === cur
          return <rect key={d.start_i} x={LBL + dd * CW + 1} y={20 + m * CH + 1} width={CW - 2} height={CH - 2} rx={3}
            fill={STATUS[d.st].color} opacity={isCur ? 1 : 0.78} stroke={isCur ? '#fff' : 'none'} strokeWidth={2}
            className="cell" onMouseMove={(e) => tip.show(e, dayTip(d))} onClick={() => onSeek(d.start_i)} />
        })}
      </svg>
      {tip.el}
    </div>
  )
}

// ---------- single-series line with threshold + crosshair ----------
function MarginChart({ days, i, onSeek, title, get, floor, floorLabel, color }) {
  const tip = useTip()
  const [hx, setHx] = useState(null)
  const W = 900, L = 44, Rt = 10, T = 10, H = 150, B = 22
  const x = (k) => L + (k / Math.max(1, days.length - 1)) * (W - L - Rt)
  const y = (v) => T + (1 - v) * (H - T - B)
  const path = days.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(get(d)).toFixed(1)}`).join('')
  const area = `${path}L${x(days.length - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const curK = days.reduce((a, d, k) => (d.start_i <= i ? k : a), 0)
  const ticks = days.map((d, k) => [d, k]).filter(([d], k) => d.date.getUTCDate() === 1 && d.date.getUTCMonth() % 3 === 0)
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * W
    const k = Math.max(0, Math.min(days.length - 1, Math.round(((fx - L) / (W - L - Rt)) * (days.length - 1))))
    setHx(k); tip.show(e, dayTip(days[k]))
  }
  const click = () => hx != null && onSeek(days[hx].start_i)
  return (
    <div className="chart-block" ref={tip.ref}>
      <div className="chart-title"><span>{title}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseMove={move} onMouseLeave={() => { setHx(null); tip.hide() }} onClick={click}>
        {[0, 0.5, 1].map((v) => <g key={v}>
          <line x1={L} x2={W - Rt} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
          <text x={L - 6} y={y(v) + 4} className="axis" textAnchor="end">{v * 100}%</text></g>)}
        {ticks.map(([d, k]) => <text key={k} x={x(k)} y={H - 6} className="axis" textAnchor="middle">{MONTHS[d.date.getUTCMonth()]} {String(d.date.getUTCFullYear()).slice(2)}</text>)}
        <path d={area} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <line x1={L} x2={W - Rt} y1={y(floor)} y2={y(floor)} stroke="#ff6b6b" strokeDasharray="5 4" />
        <text x={W - Rt - 4} y={y(floor) - 5} className="axis" textAnchor="end">{floorLabel}</text>
        <line x1={x(curK)} x2={x(curK)} y1={T} y2={H - B} stroke="#fff" strokeWidth={1.5} />
        {hx != null && <><line x1={x(hx)} x2={x(hx)} y1={T} y2={H - B} stroke="#ffffff88" />
          <circle cx={x(hx)} cy={y(get(days[hx]))} r={4.5} fill={color} stroke="var(--panel)" strokeWidth={2} /></>}
      </svg>
      {tip.el}
    </div>
  )
}

// ---------- multi-site comparison strips ----------
function SiteRow({ id, name, site, W, L, y, onHover, onSeek }) {
  const scan = useLanding(site, id)
  const days = useMemo(() => (scan ? enrich(scan) : null), [scan])
  if (!days) return <text x={L} y={y + 13} className="axis">{name}: no landing data</text>
  const bw = (W - L - 10) / days.length
  return <g>
    <text x={L - 8} y={y + 13} className="axis" textAnchor="end">{name.length > 22 ? name.slice(0, 21) + '…' : name}</text>
    {days.map((d, k) => <rect key={k} x={L + k * bw} y={y} width={bw + 0.4} height={18} fill={STATUS[d.st].color} opacity={0.85}
      onMouseMove={(e) => onHover(e, [[name, 'site'], ...dayTip(d)])} onClick={() => onSeek(d.start_i)} />)}
  </g>
}

function MultiSite({ ids, cacheSites, i, onSeek, refDays }) {
  const tip = useTip()
  const W = 900, L = 170, RH = 26
  const H = ids.length * RH + 10
  const curK = refDays.reduce((a, d, k) => (d.start_i <= i ? k : a), 0)
  return (
    <div className="chart-block" ref={tip.ref}>
      <div className="chart-title"><span>Compare sites: which ones are open on the same dates?</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseLeave={tip.hide}>
        {ids.map((id, r) => <SiteRow key={id} id={id} name={cacheSites[id]?.site.name || id} site={cacheSites[id]}
          W={W} L={L} y={4 + r * RH} onHover={tip.show} onSeek={onSeek} />)}
        <line x1={L + (curK / refDays.length) * (W - L - 10)} x2={L + (curK / refDays.length) * (W - L - 10)} y1={0} y2={H} stroke="#fff" strokeWidth={1.5} />
      </svg>
      {tip.el}
    </div>
  )
}

// ---------- main ----------
export default function LandingAnalysis({ site, i, onSeek, compare, cacheSites }) {
  const scan = useLanding(site, site.site.id)
  const days = useMemo(() => (scan ? enrich(scan) : null), [scan])
  if (!days) return <p className="muted">Landing-date data not generated yet (run <code>python -m analysis.landing_dates</code>).</p>

  const counts = days.reduce((a, d) => ({ ...a, [d.st]: (a[d.st] || 0) + 1 }), {})
  const win = longestWindow(days)
  const cur = days.reduce((a, d) => (d.start_i <= i ? d : a), days[0])
  const next = days.find((d) => d.start_i >= i && d.st === 'good')
  const others = compare.filter((id) => id !== site.site.id)

  return (
    <div className="landing">
      <div className="tiles">
        <div className="tile"><div className="mk">Selected landing day</div>
          <div className="mv mono"><span style={{ color: STATUS[cur.st].color }}>{STATUS[cur.st].icon}</span> {STATUS[cur.st].label}</div>
          <div className="ms">{fmt(cur.date)} · battery low point {Math.round(cur.min_soc * 100)}%</div></div>
        <div className="tile"><div className="mk">Next good landing day</div>
          <div className="mv mono">{next ? fmt(next.date) : 'none in data'}</div>
          <div className="ms">{next ? (next.start_i === cur.start_i ? 'today is good' : `${Math.round((next.date - cur.date) / 864e5)} days later`) : 'try another site'}</div></div>
        <div className="tile"><div className="mk">Longest launch window</div>
          <div className="mv mono">{win ? `${win.len} days` : '0 days'}</div>
          <div className="ms">{win ? `${fmt(win.start.date)} → ${fmt(win.end.date)}` : 'no consecutive good days'}</div></div>
        <div className="tile"><div className="mk">Good days overall</div>
          <div className="mv mono">{Math.round(((counts.good || 0) / days.length) * 100)}%</div>
          <div className="ms">{counts.good || 0} good · {counts.warn || 0} marginal · {counts.bad || 0} fail</div></div>
      </div>

      <div className="legend">
        {Object.values(STATUS).map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.icon} {s.label}: {s.text}</span>)}
      </div>

      <Calendar days={days} i={i} onSeek={onSeek} />
      <div className="two">
        <MarginChart days={days} i={i} onSeek={onSeek} title="Battery margin: lowest charge during a 14-day mission" get={(d) => d.min_soc}
          floor={0.2} floorLabel="safe floor 20%" color="#c89bff" />
        <MarginChart days={days} i={i} onSeek={onSeek} title="Earth contact in the first 48 hours after landing" get={(d) => d.comms_48h}
          floor={0.8} floorLabel="needed 80%" color="#5ea9ff" />
      </div>
      {others.length > 0
        ? <MultiSite ids={[site.site.id, ...others]} cacheSites={{ ...cacheSites, [site.site.id]: site }} i={i} onSeek={onSeek} refDays={days} />
        : <p className="muted">Tick other sites in the list to compare their landing dates here.</p>}
    </div>
  )
}

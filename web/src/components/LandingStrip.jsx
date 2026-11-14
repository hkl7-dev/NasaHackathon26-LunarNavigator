import { useEffect, useState } from 'react'
import { DATA, fmtDate, timeAt } from '../lib.js'

// "Good landing dates": one bar per possible landing day (from analysis/landing_dates.py)
const W = 900, H = 46, PAD = 6

function status(d) {
  if (!d.survives) return 'bad'
  return d.comms_48h > 0.8 ? 'good' : 'warn'
}
const COLORS = { good: '#59d6a4', warn: '#ffb35c', bad: '#ff6b6b' }

export default function LandingStrip({ site, i, onSeek }) {
  const [scan, setScan] = useState(null)
  useEffect(() => {
    if (site.landing) { setScan(site.landing); return }   // computed in the browser (custom point / panel height)
    setScan(null)
    fetch(`${DATA}/extra/landing_${site.site.id}.json`).then((r) => (r.ok ? r.json() : null)).then(setScan).catch(() => setScan(null))
  }, [site])

  if (!scan) return <p className="muted">Landing-date data not generated yet (run <code>python -m analysis.landing_dates</code>).</p>
  const days = scan.days
  const first = days[0].start_i, last = days[days.length - 1].start_i
  const x = (k) => PAD + ((k - first) / Math.max(1, last - first)) * (W - 2 * PAD)
  const bw = Math.max(1, (W - 2 * PAD) / days.length)
  // landing day at the current time
  let cur = days[0]
  for (const d of days) { if (d.start_i <= i) cur = d; else break }
  const counts = days.reduce((a, d) => ({ ...a, [status(d)]: (a[status(d)] || 0) + 1 }), {})

  const click = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * W
    onSeek(Math.round(first + ((fx - PAD) / (W - 2 * PAD)) * (last - first)))
  }
  const st = status(cur)
  const label = { good: 'Good landing day', warn: 'Survives, but weak Earth contact after landing', bad: 'Mission would not survive 14 days' }[st]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline" onClick={click}>
        {days.map((d) => <rect key={d.start_i} x={x(d.start_i)} y={6} width={bw} height={H - 18} fill={COLORS[status(d)]} opacity={0.85} />)}
        <line x1={x(i)} x2={x(i)} y1={0} y2={H - 8} stroke="#fff" strokeWidth="2" />
      </svg>
      <div className="landing-row">
        <span className={`pill ${st}`}>{label}</span>
        <span className="muted mono">Land {fmtDate(timeAt(site, cur.start_i)).slice(0, 10)} · min battery {Math.round(cur.min_soc * 100)}% · Earth contact first 48 h {Math.round(cur.comms_48h * 100)}%</span>
        <span className="muted">{counts.good || 0} good · {counts.warn || 0} marginal · {counts.bad || 0} bad days</span>
      </div>
    </div>
  )
}

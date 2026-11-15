// Surface temperature at the site: now, over the next 30 days, and whether water ice could survive there.
import { ICE_STABLE_K, toC } from '../thermal.js'
import { timeAt } from '../lib.js'
import PngButton from './PngButton.jsx'

const W = 760, H = 190, PL = 44, PR = 10, PT = 10, PB = 24, TMAX = 400
const ELEC_K = 233   // −40 °C: lower limit for most unheated electronics

export default function Thermal({ site, i, temps }) {
  if (!temps) return null
  const { T, min, max, iceStable } = temps
  const span = Math.min(site.n - 1, Math.round((30 * 24 * 60) / site.step_min))
  const a = Math.max(0, Math.min(i, site.n - 1 - span)), b = a + span
  const x = (k) => PL + ((k - a) / span) * (W - PL - PR), y = (t) => PT + (1 - t / TMAX) * (H - PT - PB)
  let d = ''
  const every = Math.max(1, Math.round(span / 600))
  for (let k = a; k <= b; k += every) d += `${k === a ? 'M' : 'L'}${x(k).toFixed(1)} ${y(T[k]).toFixed(1)}`
  let cold = 0
  for (let k = 0; k < site.n; k++) if (T[k] < ELEC_K) cold++
  const now = T[Math.min(i, site.n - 1)]
  const days = [0, 10, 20, 30].map((dd) => a + Math.round((dd * 24 * 60) / site.step_min))
  return (
    <section className="card" id="sec-thermal">
      <div className="card-head">
        <h2>Surface temperature</h2>
        <span className="muted">model driven by the same Sun and horizon data · <PngButton name={`${site.site.name} temperature`} /></span>
      </div>
      <div className="metrics thermal-cards">
        <div className={'metric ' + (now < 110 ? 'warn' : now > 360 ? 'bad' : 'good')}><div className="mk">Ground now</div><div className="mv mono">{Math.round(now)} K</div><div className="ms">{Math.round(toC(now))} °C</div></div>
        <div className="metric"><div className="mk">Range, 2026 to 2028</div><div className="mv mono">{Math.round(min)} to {Math.round(max)} K</div><div className="ms">{Math.round(toC(min))} to {Math.round(toC(max))} °C</div></div>
        <div className={'metric ' + (iceStable ? 'good' : '')}><div className="mk">Water ice cold trap?</div><div className="mv">{iceStable ? 'Yes' : 'No'}</div><div className="ms">{iceStable ? `never above ${ICE_STABLE_K} K, ice can survive` : `warms above ${ICE_STABLE_K} K, surface ice would escape`}</div></div>
        <div className={'metric ' + (cold / site.n > 0.3 ? 'bad' : cold > 0 ? 'warn' : 'good')}><div className="mk">Below −40 °C</div><div className="mv mono">{Math.round((cold / site.n) * 100)}%</div><div className="ms">of the time: electronics need heaters</div></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart thermal-chart">
        {[0, 100, 200, 300, 400].map((t) => <g key={t}><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--grid)" /><text x={PL - 6} y={y(t) + 4} className="axis" textAnchor="end">{t} K</text></g>)}
        <line x1={PL} x2={W - PR} y1={y(ICE_STABLE_K)} y2={y(ICE_STABLE_K)} stroke="#7fd3ff" strokeDasharray="4 3" />
        <text x={W - PR - 4} y={y(ICE_STABLE_K) - 4} className="axis" textAnchor="end" fill="#7fd3ff" style={{ fill: '#7fd3ff' }}>ice stable below 110 K</text>
        <line x1={PL} x2={W - PR} y1={y(ELEC_K)} y2={y(ELEC_K)} stroke="#ffb35c" strokeDasharray="4 3" opacity="0.7" />
        <text x={W - PR - 4} y={y(ELEC_K) - 4} className="axis" textAnchor="end" style={{ fill: '#ffb35c' }}>−40 °C</text>
        <path d={d} fill="none" stroke="#ff8a5c" strokeWidth="2" />
        <line x1={x(Math.min(Math.max(i, a), b))} x2={x(Math.min(Math.max(i, a), b))} y1={PT} y2={H - PB} stroke="#fff" opacity="0.6" />
        {days.map((k, j) => <text key={j} x={x(k)} y={H - 6} className="axis" textAnchor={j === 0 ? 'start' : j === 3 ? 'end' : 'middle'}>{timeAt(site, k).toISOString().slice(5, 10)}</text>)}
      </svg>
      <p className="muted small-note">Flat ground, two-layer regolith model with Diviner-derived properties (Hayne et al. 2017): albedo 0.12, emissivity 0.95, interior heat flow 0.018 W/m². It matches the equator's measured 95 to 390 K swing. Light and heat bounced from nearby crater walls are left out, so permanently shadowed floors come out at the 24 K floor set by interior heat; Diviner measures 25 to 70 K in those cold traps. Ice stability limit from Vasavada et al. 1999.</p>
    </section>
  )
}

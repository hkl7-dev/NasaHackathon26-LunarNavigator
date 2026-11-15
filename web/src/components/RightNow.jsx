// "Right now": live conditions at every site for the current real-world time, recomputed each minute.
import { useEffect, useState } from 'react'
import { loadDem, loadVectors, computeSite, demCovers, poleOf } from '../engine.js'
import { surfaceTemps } from '../thermal.js'
import { windowState, fmtDuration, fmtDate } from '../lib.js'

export const nowIndex = (t0, stepMin, n) => {
  const k = Math.round((Date.now() - Date.parse(t0)) / (stepMin * 60000))
  return k >= 0 && k < n ? k : null
}

export default function RightNow({ sites, onGo }) {
  const [rows, setRows] = useState({})
  const [clock, setClock] = useState(Date.now())
  const [vec, setVec] = useState(null)
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (!sites.length) return
    let alive = true
    loadVectors().then(async (v) => {
      setVec(v)
      for (const s of sites) {
        await new Promise((r) => setTimeout(r, 30))   // let the page breathe between sites
        if (!alive) return
        const dem = demCovers(s.lat) ? await loadDem(poleOf(s.lat)).catch(() => null) : null
        const d = computeSite(s, v, dem)
        const th = surfaceTemps(d)
        setRows((m) => ({ ...m, [s.id]: { d, T: th.T } }))
      }
    })
    return () => { alive = false }
  }, [sites])
  const k = vec ? nowIndex(vec.t0, vec.step_min, vec.n) : null
  return (
    <section className="card" id="sec-now">
      <div className="card-head">
        <h2>Right now on the Moon</h2>
        <span className="muted mono">{fmtDate(new Date(clock))}</span>
      </div>
      {vec && k == null && <p className="muted">Today is outside the 2026 to 2028 ephemeris, so live conditions are not available.</p>}
      {k != null && <div className="table-wrap">
        <table className="cmp now-table">
          <thead><tr><th>Site</th><th>Sun</th><th>Earth</th><th>Solar power</th><th>Ground</th><th>Next change</th><th /></tr></thead>
          <tbody>{sites.map((s) => {
            const r = rows[s.id]
            if (!r) return <tr key={s.id}><td>{s.name}</td><td colSpan={6} className="busy">computing…</td></tr>
            const d = r.d, lit = d.sun_vis_frac[k] > 0.5, up = d.sun.el[k] > 0, earth = d.earth_visible[k]
            const sw = windowState(d.sun_windows, k, d.step_min, d.n)
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><span className={'dot ' + (lit ? 'good' : 'bad')} />{lit ? 'sunlit' : up ? 'in shadow' : 'night'} <span className="muted">{d.sun.el[k].toFixed(1)}°</span></td>
                <td><span className={'dot ' + (earth ? 'good' : 'bad')} />{earth ? 'in view' : 'hidden'}</td>
                <td className="mono">{Math.round(d.power_w[k])} W</td>
                <td className="mono">{Math.round(r.T[k])} K <span className="muted">{Math.round(r.T[k] - 273.15)} °C</span></td>
                <td className="muted">{sw.untilChange == null ? (lit ? 'Sun stays up' : 'stays dark') : `${lit ? 'sunset' : 'sunrise'} in ${fmtDuration(sw.untilChange)}`}</td>
                <td><button className="btn small" onClick={() => onGo(s.id)}>Open now</button></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>}
      <p className="muted small-note">Real current time, the same terrain horizons as the site analysis (2 m panel height). "Open now" jumps that site's analysis to this moment.</p>
    </section>
  )
}

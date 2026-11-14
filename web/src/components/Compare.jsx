import { windowState, fmtDuration } from '../lib.js'

const ROWS = [
  ['Sunlit (all dates)', (d) => d.summary.pct_sunlit, (v) => `${Math.round(v * 100)}%`, 'max'],
  ['Earth visible (all dates)', (d) => d.summary.pct_earth_visible, (v) => `${Math.round(v * 100)}%`, 'max'],
  ['Sun + Earth together', (d) => d.summary.pct_both, (v) => `${Math.round(v * 100)}%`, 'max'],
  ['Longest night', (d) => d.summary.longest_dark_h, fmtDuration, 'min'],
  ['Battery to survive it', (d) => d.summary.battery_mass_kg, (v) => `${v} kg`, 'min'],
  ['Mean power', (d) => d.summary.mean_power_w, (v) => `${Math.round(v)} W`, 'max'],
  ['Sun now', (d, i) => d.sun.el[i], (v) => `${v.toFixed(2)}°`, 'max'],
  ['Next sunset / sunrise', (d, i) => { const w = windowState(d.sun_windows, i, d.step_min, d.n); return w.untilChange == null ? null : (w.on ? 1 : -1) * w.untilChange }, (v) => v == null ? '—' : v >= 0 ? `sets in ${fmtDuration(v)}` : `rises in ${fmtDuration(-v)}`, null],
  ['Next Earthset / rise', (d, i) => { const w = windowState(d.earth_windows, i, d.step_min, d.n); return w.untilChange == null ? null : (w.on ? 1 : -1) * w.untilChange }, (v) => v == null ? '—' : v >= 0 ? `sets in ${fmtDuration(v)}` : `rises in ${fmtDuration(-v)}`, null],
]

export default function Compare({ ids, cache, i }) {
  const cols = ids.map((id) => cache[id]).filter(Boolean)
  if (cols.length < 2) return <section className="card muted">Tick up to 3 sites in the list to compare them side by side.</section>
  return (
    <section className="card">
      <div className="card-head"><h2>Compare</h2><span className="muted">best value highlighted</span></div>
      <div className="table-wrap">
        <table className="cmp">
          <thead><tr><th></th>{cols.map((d) => <th key={d.site.id}>{d.site.name}</th>)}</tr></thead>
          <tbody>
            {ROWS.map(([label, get, fmt, best]) => {
              const vals = cols.map((d) => get(d, i))
              const nums = vals.filter((v) => v != null)
              const target = best === 'max' ? Math.max(...nums) : best === 'min' ? Math.min(...nums) : null
              return <tr key={label}><td>{label}</td>{vals.map((v, k) =>
                <td key={k} className={'mono ' + (best && v === target && nums.length > 1 ? 'best' : '')}>{fmt(v)}</td>)}</tr>
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

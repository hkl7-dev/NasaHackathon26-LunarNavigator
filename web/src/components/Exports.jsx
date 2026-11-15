// Downloads for the selected site: hourly timeline (CSV), summary (JSON), and PNG snapshots of every chart.
import { downloadText, savePng, slug } from '../export.js'
import { timeAt } from '../lib.js'

export default function Exports({ site, temps, i }) {
  const name = slug(site.site.name)
  const csv = () => {
    const head = ['time_utc', 'sun_az_deg', 'sun_el_deg', 'sun_visible_frac', 'earth_az_deg', 'earth_el_deg', 'earth_horizon_el_deg', 'earth_visible', 'solar_power_w', 'battery_soc', 'comms_rate_kbps', 'surface_temp_k']
    const f = (v, d) => (v == null || Number.isNaN(+v) ? '' : (+v).toFixed(d))
    const lines = [head.join(',')]
    for (let k = 0; k < site.n; k++) {
      lines.push([timeAt(site, k).toISOString().slice(0, 16) + 'Z', f(site.sun.az[k], 2), f(site.sun.el[k], 3), f(site.sun_vis_frac[k], 3), f(site.earth.az[k], 2), f(site.earth.el[k], 3),
        f(site.earth_mask_el[k], 3), site.earth_visible[k] ? 1 : 0, f(site.power_w[k], 1), f(site.soc[k], 3), f(site.rate_kbps[k], 1), f(temps?.T[k], 1)].join(','))
    }
    downloadText(`${name}_hourly.csv`, lines.join('\n'))
  }
  const json = () => downloadText(`${name}_summary.json`, JSON.stringify({
    site: site.site, period: { start: site.t0, hours: (site.n * site.step_min) / 60, step_min: site.step_min },
    summary: site.summary, design: site.design || null,
    temperature_k: temps ? { min: +temps.min.toFixed(1), max: +temps.max.toFixed(1), ice_stable: temps.iceStable } : null,
    sun_windows: site.sun_windows.map((w) => ({ start: timeAt(site, w.start_i).toISOString(), end: timeAt(site, w.end_i).toISOString(), hours: w.hours })),
    earth_windows: site.earth_windows.map((w) => ({ start: timeAt(site, w.start_i).toISOString(), end: timeAt(site, w.end_i).toISOString(), hours: w.hours })),
    horizon_mask: { az_step_deg: site.mask.az_step_deg, el_deg: Array.from(site.mask.el, (v) => +(+v).toFixed(3)) },
    generated: new Date().toISOString(), tool: 'moonle, Lunar Landing Site Navigator',
  }, null, 1), 'application/json')
  const allPng = async () => {
    for (const id of ['sec-map', 'sec-dome', 'sec-thermal', 'sec-safety', 'sec-landing']) {
      const el = document.getElementById(id)
      if (el) { await savePng(el, `${name}_${id.slice(4)}`).catch(() => {}); await new Promise((r) => setTimeout(r, 300)) }
    }
  }
  return (
    <section className="card" id="sec-export">
      <div className="card-head"><h2>Download this site</h2><span className="muted">{site.site.name} · {site.n.toLocaleString()} hourly steps</span></div>
      <div className="downloads">
        <button className="btn small" onClick={csv}>Hourly timeline (CSV)</button>
        <button className="btn small" onClick={json}>Summary, windows and horizon (JSON)</button>
        <button className="btn small" onClick={allPng}>All charts and the map (PNG)</button>
      </div>
      <p className="muted small-note">The CSV has Sun and Earth position, visibility, solar power, battery, data rate and ground temperature for every hour of 2026 to 2028, ready for Excel or Python. Every chart also has its own ⤓ PNG button. Region-wide map layers are under Data sources below.</p>
    </section>
  )
}

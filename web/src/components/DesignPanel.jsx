import { useMemo } from 'react'
import { DEFAULT_DESIGN, PRESETS, SLIDERS, isDefault } from '../design.js'
import { landingScan } from '../engine.js'
import { fmtDuration, fmtDate, timeAt } from '../lib.js'

// slider position <-> value (log scale for battery capacity)
const toPos = (s, v) => (s.log ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min))
const fromPos = (s, p) => {
  const raw = s.log ? s.min * Math.pow(s.max / s.min, p) : s.min + p * (s.max - s.min)
  return Math.round(raw / s.step) * s.step
}

export default function DesignPanel({ design, onChange, site }) {
  const s = site?.summary
  const set = (k, v) => onChange({ ...design, [k]: v })
  const preset = PRESETS.find((p) => Object.keys(DEFAULT_DESIGN).every((k) => p.d[k] === design[k]))
  const scan = useMemo(() => site && (site.landing || landingScan(site, design.mission_days)), [site])
  const days = scan?.days
  const good = days ? days.filter((d) => d.survives && d.comms_48h > 0.8).length : null
  const surv = days ? days.filter((d) => d.survives).length : null
  const peak = 1361 * design.area_m2 * 0.3 * 0.85
  const packKg = design.capacity_wh / 150
  const fits = s && s.battery_wh_needed <= design.capacity_wh

  return (
    <section className="card design">
      <div className="card-head">
        <h2>Design your lander</h2>
        <span className="muted">every chart below re-runs with these numbers{!isDefault(design) && <> · <button className="btn small" onClick={() => onChange(DEFAULT_DESIGN)}>reset</button></>}</span>
      </div>
      <div className="seg presets">
        {PRESETS.map((p) => <button key={p.id} title={p.note} className={'btn small ' + (preset?.id === p.id ? 'on' : '')} onClick={() => onChange(p.d)}>{p.label}</button>)}
      </div>
      <div className="design-grid">
        <div className="sliders">
          {SLIDERS.map((sl) => (
            <label key={sl.k} className="srow">
              <span>{sl.label}</span>
              <input type="range" min={0} max={1000} value={Math.round(toPos(sl, design[sl.k]) * 1000)}
                onChange={(e) => set(sl.k, Math.min(sl.max, Math.max(sl.min, fromPos(sl, +e.target.value / 1000))))} />
              <span className="mono">{sl.fmt(design[sl.k])}</span>
            </label>
          ))}
          <p className="muted small-note">Peak array output ≈ {Math.round(peak)} W (30% cells, 0.85 derate). Battery pack ≈ {packKg.toFixed(1)} kg at 150 Wh/kg. Panels at polar sites track the Sun on a vertical mast; elsewhere they lie flat.</p>
        </div>
        {s && <div className="verdict">
          <div className={'big ' + (s.survives_default ? 'good' : 'bad')}>
            <div className="mk">Survives the whole data span at {site.site.name}?</div>
            <div className="mv">{s.survives_default ? '✓ Yes' : '✕ No'}</div>
            <div className="ms">{s.survives_default ? 'battery never drops below the 20% safe floor'
              : s.first_failure_i >= 0 ? `first drops below the safe floor on ${fmtDate(timeAt(site, s.first_failure_i)).slice(0, 10)}` : 'battery drops below the 20% safe floor'}</div>
          </div>
          <div className="vrow"><span>Longest night</span><b className="mono">{fmtDuration(s.longest_dark_h)}</b></div>
          <div className={'vrow ' + (fits ? 'ok' : 'no')}><span>Battery to survive it</span><b className="mono">{(s.battery_wh_needed / 1000).toFixed(1)} kWh · {s.battery_mass_kg} kg</b></div>
          <div className="vrow"><span>Mean array power</span><b className="mono">{Math.round(s.mean_power_w)} W</b></div>
          {days && <div className="vrow"><span>{design.mission_days}-day missions that survive</span><b className="mono">{Math.round((surv / days.length) * 100)}%</b></div>}
          {days && <div className="vrow"><span>Good landing days</span><b className="mono">{good} of {days.length}</b></div>}
        </div>}
      </div>
    </section>
  )
}

import { windowState, fmtDuration } from '../lib.js'

export default function Metrics({ site, i }) {
  const sun = windowState(site.sun_windows, i, site.step_min, site.n)
  const earth = windowState(site.earth_windows, i, site.step_min, site.n)
  const s = site.summary
  const p = site.power_w[i], soc = site.soc[i], rate = site.rate_kbps[i]
  const cards = [
    { k: 'Sun', v: `${site.sun.el[i].toFixed(2)}°`, sub: sun.untilChange == null ? (sun.on ? 'Up for rest of data' : 'Never rises in data') : sun.on ? `Sunset in ${fmtDuration(sun.untilChange)}` : `Sunrise in ${fmtDuration(sun.untilChange)}`, tone: sun.on ? 'good' : 'bad' },
    { k: 'Earth', v: `${site.earth.el[i].toFixed(2)}°`, sub: earth.untilChange == null ? (earth.on ? 'Always visible' : 'Never visible: needs relay') : earth.on ? `Earthset in ${fmtDuration(earth.untilChange)}` : `Earthrise in ${fmtDuration(earth.untilChange)}`, tone: earth.on ? 'good' : 'bad' },
    { k: 'Solar power', v: `${Math.round(p)} W`, sub: (site.panel_mode || '').replace('_', ' ') + ' panel', tone: p > 50 ? 'good' : 'bad' },
    { k: 'Battery', v: `${Math.round(soc * 100)}%`, sub: s.survives_default ? (site.design ? 'Survives with your pack' : 'Survives with default pack') : (site.design ? 'Your pack runs flat' : 'Default pack runs flat'), tone: soc > 0.3 ? 'good' : 'bad' },
    { k: 'Comms to Earth', v: rate > 0 ? (rate >= 1000 ? `${(rate / 1000).toFixed(1)} Mbps` : `${Math.round(rate)} kbps`) : 'No link', sub: 'direct-to-Earth', tone: rate > 0 ? 'good' : 'bad' },
    { k: 'Longest night', v: fmtDuration(s.longest_dark_h), sub: `≈ ${s.battery_mass_kg} kg battery to survive`, tone: s.longest_dark_h < 150 ? 'good' : 'warn' },
  ]
  return (
    <section className="metrics">
      {cards.map((c) => (
        <div key={c.k} className={`metric ${c.tone}`}>
          <div className="mk">{c.k}</div>
          <div className="mv mono">{c.v}</div>
          <div className="ms">{c.sub}</div>
        </div>
      ))}
    </section>
  )
}

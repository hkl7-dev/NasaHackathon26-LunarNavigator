import { GROUP_COLORS } from '../lib.js'

export default function SiteList({ sites, focus, compare, onFocus, onToggle }) {
  return (
    <div className="card">
      <div className="card-head"><h2>Sites</h2><span className="muted">☑ = compare (max 3)</span></div>
      <ul className="sites">
        {sites.map((s) => (
          <li key={s.id} className={s.id === focus ? 'on' : ''} onClick={() => onFocus(s.id)}>
            <input type="checkbox" checked={compare.includes(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(s.id)} />
            <span className="dot" style={{ background: GROUP_COLORS[s.group] || '#ccc' }} />
            <span className="name">{s.name}<small>{s.group} · {s.lat.toFixed(1)}°, {s.lon.toFixed(1)}°</small></span>
            <span className="pct mono" title="Fraction of time sunlit">☀ {Math.round(s.summary.pct_sunlit * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

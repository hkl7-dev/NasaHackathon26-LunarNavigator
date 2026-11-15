// Landing safety: slope map around the spot plus a GO / CAUTION / NO-GO verdict for landing at the chosen time.
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadDem, demCovers, poleOf } from '../engine.js'
import { terrainSafety, verdict, SAFETY_COLOR, SAFE } from '../safety.js'
import { timeAt, fmtDate } from '../lib.js'
import PngButton from './PngButton.jsx'

const LABEL = { go: 'GO', caution: 'CAUTION', nogo: 'NO-GO' }

function SlopeMap({ t }) {
  const ref = useRef()
  useEffect(() => {
    const cv = ref.current, n = t.n
    cv.width = cv.height = n
    const g = cv.getContext('2d'), img = g.createImageData(n, n)
    for (let k = 0; k < n * n; k++) {
      const [r, gg, b] = SAFETY_COLOR(t.slope[k])
      img.data.set([r, gg, b, 255], k * 4)
    }
    g.putImageData(img, 0, 0)
  }, [t])
  const ring = (500 / (2 * t.half)) * 100
  return (
    <div className="slope-map">
      <canvas ref={ref} />
      <div className="slope-ring" style={{ width: `${2 * ring}%`, height: `${2 * ring}%` }} />
      <div className="slope-cross" />
      <span className="slope-n">N</span>
      <span className="slope-scale">{((2 * t.half) / 1000).toFixed(1)} km across</span>
    </div>
  )
}

export default function LandingSafety({ site, i, temps }) {
  const { lat, lon } = site.site
  const polar = demCovers(lat)
  const [dem, setDem] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    setDem(null); setErr(null)
    if (polar) loadDem(poleOf(lat)).then(setDem).catch((e) => setErr(e.message))
  }, [polar, lat > 0])
  const terrain = useMemo(() => (dem ? terrainSafety(dem, lat, lon) : null), [dem, lat, lon])
  const k = Math.min(i, site.n - 1)
  const cond = { lat, lit: site.sun_vis_frac[k] > 0.5, sunEl: site.sun.el[k], earth: !!site.earth_visible[k], tempK: temps?.T[k] }
  const v = verdict(terrain, cond)
  return (
    <section className="card" id="sec-safety">
      <div className="card-head">
        <h2>Landing safety</h2>
        <span className="muted">landing at {fmtDate(timeAt(site, k))} · <PngButton name={`${site.site.name} slope map`} /></span>
      </div>
      <div className="safety">
        <div className="safety-left">
          <div className={`verdict ${v.worst}`}>{LABEL[v.worst]}</div>
          {polar ? terrain ? <SlopeMap t={terrain} /> : <p className="busy">{err ? `Terrain not available: ${err}` : 'Reading LOLA terrain…'}</p>
            : <p className="muted">No high-resolution terrain this far from the pole, so only the landing conditions are checked.</p>}
          {terrain && <div className="legend-row muted"><i style={{ background: 'rgb(62,201,120)' }} /> &lt; {SAFE.go}° <i style={{ background: 'rgb(245,184,75)' }} /> {SAFE.go} to {SAFE.nogo}° <i style={{ background: 'rgb(230,80,80)' }} /> &gt; {SAFE.nogo}° · circle = 500 m</div>}
        </div>
        <table className="cmp safety-table">
          <thead><tr><th>Check</th><th>Value</th><th>Status</th><th>Why it matters</th></tr></thead>
          <tbody>{v.checks.map((c) => (
            <tr key={c.k}><td>{c.k}</td><td className="mono">{c.v}</td><td><span className={`pill ${c.lvl}`}>{LABEL[c.lvl]}</span></td><td className="muted wrap">{c.why}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="muted small-note">Slope measured over 480 m on NASA's 240 m LOLA terrain, the same way as the landing map. It cannot see boulders or small craters, so a GO here means "worth imaging at higher resolution" (LROC NAC, 0.5 m), not "cleared to land". Move the time slider to see how lighting, Earth view and temperature change the verdict.</p>
    </section>
  )
}

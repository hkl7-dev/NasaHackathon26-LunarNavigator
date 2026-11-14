import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchJSON, timeAt, fmtDate } from './lib.js'
import PolarMap from './components/PolarMap.jsx'
import SiteList from './components/SiteList.jsx'
import SkyDome from './components/SkyDome.jsx'
import Metrics from './components/Metrics.jsx'
import Timeline from './components/Timeline.jsx'
import Compare from './components/Compare.jsx'

const SPEEDS = [1, 6, 24]  // hours advanced per animation tick

export default function App() {
  const [sites, setSites] = useState([])
  const [focus, setFocus] = useState(null)
  const [compare, setCompare] = useState([])
  const [cache, setCache] = useState({})
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6)
  const [error, setError] = useState(null)

  // Load the site index
  useEffect(() => {
    fetchJSON('sites.json')
      .then((s) => {
        setSites(s)
        const first = s.find((x) => x.id === 'shackleton_ridge') || s[0]
        if (first) { setFocus(first.id); setCompare([first.id]) }
      })
      .catch((e) => setError(`Could not load data/sites.json (${e.message}). Run "python -m engine.build" first.`))
  }, [])

  // Lazy-load per-site data
  const need = useMemo(() => [...new Set([focus, ...compare].filter(Boolean))], [focus, compare])
  useEffect(() => {
    need.filter((id) => !cache[id]).forEach((id) =>
      fetchJSON(`${id}.json`).then((d) => setCache((c) => ({ ...c, [id]: d }))).catch((e) => setError(e.message)))
  }, [need, cache])

  const site = focus ? cache[focus] : null
  const n = site?.n ?? 1
  const stepMin = site?.step_min ?? 60

  // Playback
  const raf = useRef()
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now) => {
      if (now - last > 60) {
        last = now
        setI((v) => (v + Math.max(1, Math.round((speed * 60) / stepMin))) % n)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, speed, n, stepMin])

  const jump = (hours) => setI((v) => Math.min(n - 1, Math.max(0, v + Math.round((hours * 60) / stepMin))))

  const toggleCompare = (id) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3)))

  const onDate = (e) => {
    if (!site) return
    const t = Date.parse(e.target.value + 'T00:00:00Z')
    const idx = Math.round((t - Date.parse(site.t0)) / (stepMin * 60000))
    setI(Math.min(n - 1, Math.max(0, idx)))
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Lunar Landing Site Navigator</h1>
          <p className="sub">Sun, Earth, power and comms at any lunar landing site and date. Terrain from LOLA, ephemeris validated against JPL Horizons.</p>
        </div>
        {site && <div className="now mono">{fmtDate(timeAt(site, i))}</div>}
      </header>

      {error && <div className="error">{error}</div>}

      <div className="layout">
        <aside className="side">
          <PolarMap sites={sites} focus={focus} onFocus={setFocus} />
          <SiteList sites={sites} focus={focus} compare={compare} onFocus={setFocus} onToggle={toggleCompare} />
        </aside>

        <main className="main">
          <section className="card controls">
            <button className="btn" onClick={() => jump(-24 * 7)} title="Back 1 week">⏪ 1w</button>
            <button className="btn" onClick={() => jump(-24)} title="Back 1 day">◀ 1d</button>
            <button className="btn primary" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="btn" onClick={() => jump(24)} title="Forward 1 day">1d ▶</button>
            <button className="btn" onClick={() => jump(24 * 7)} title="Forward 1 week">1w ⏩</button>
            <select className="btn" value={speed} onChange={(e) => setSpeed(+e.target.value)} title="Playback speed">
              {SPEEDS.map((s) => <option key={s} value={s}>{s} h / tick</option>)}
            </select>
            <input type="date" className="btn" onChange={onDate}
              value={site ? timeAt(site, i).toISOString().slice(0, 10) : ''} />
            <input className="slider" type="range" min={0} max={n - 1} value={i} onChange={(e) => setI(+e.target.value)} />
          </section>

          {site ? (
            <>
              <section className="card">
                <div className="card-head">
                  <h2>{site.site.name}</h2>
                  <span className="muted mono">{site.site.lat.toFixed(2)}°, {site.site.lon.toFixed(2)}°E · {site.site.terrain ? 'LOLA terrain horizon' : 'smooth horizon (outside polar DEM)'}</span>
                </div>
                <SkyDome site={site} i={i} />
              </section>
              <Metrics site={site} i={i} />
              <section className="card">
                <div className="card-head"><h2>Next 30 days</h2><span className="muted">click to jump</span></div>
                <Timeline site={site} i={i} onSeek={setI} />
              </section>
            </>
          ) : !error && <div className="card muted">Loading…</div>}

          <Compare ids={compare} cache={cache} i={i} />
        </main>
      </div>
    </div>
  )
}

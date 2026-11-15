import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchJSON, timeAt, fmtDate } from './lib.js'
import { loadDem, loadVectors, computeSite, landingScan, demCovers, poleOf } from './engine.js'
import PolarMap from './components/PolarMap.jsx'
import SiteList from './components/SiteList.jsx'
import SkyDome from './components/SkyDome.jsx'
import Metrics from './components/Metrics.jsx'
import Timeline from './components/Timeline.jsx'
import Compare from './components/Compare.jsx'
import LandingAnalysis from './components/LandingAnalysis.jsx'
import { Callout, Intro } from './components/Explain.jsx'
import DesignPanel from './components/DesignPanel.jsx'
import Tour from './components/Tour.jsx'
import DataPanel from './components/DataPanel.jsx'
import logo from './assets/moonle-logo.png'
import { DEFAULT_DESIGN, PRESETS, applyDesign, isDefault, designKey } from './design.js'

const SPEEDS = [1, 6, 24]  // hours advanced per animation tick
const DEFAULT_MAST = 2

// ---- shareable URL: #site=...&t=...&mast=...&lat=...&lon=... ----
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1))
  const num = (k) => (p.has(k) && isFinite(+p.get(k)) ? +p.get(k) : null)
  return { site: p.get('site'), t: num('t'), mast: num('mast'), lat: num('lat'), lon: num('lon'), explain: p.get('explain'), layer: p.get('layer'), design: p.get('design'), tour: p.has('tour') }
}
const START = readHash()
function parseDesign(str) {
  if (!str) return DEFAULT_DESIGN
  const v = str.split('|').map(Number), keys = Object.keys(DEFAULT_DESIGN)
  return v.length === keys.length && v.every(isFinite) ? Object.fromEntries(keys.map((k, j) => [k, v[j]])) : DEFAULT_DESIGN
}

async function analyse(meta, mast) {
  // no terrain file for this pole yet -> smooth-horizon analysis instead of an error
  const [vec, dem] = await Promise.all([loadVectors(), demCovers(meta.lat) ? loadDem(poleOf(meta.lat)).catch(() => null) : null])
  const d = computeSite(meta, vec, dem, mast)
  d.landing = landingScan(d)
  return d
}

export default function App() {
  const [sites, setSites] = useState([])
  const [focus, setFocus] = useState(null)
  const [compare, setCompare] = useState([])
  const [cache, setCache] = useState({})
  const [i, setI] = useState(START.t ?? 0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6)
  const [error, setError] = useState(null)
  const [explain, setExplain] = useState(START.explain !== '0')
  const [custom, setCustom] = useState(START.lat != null && START.lon != null
    ? { id: 'custom', name: 'Custom point', lat: START.lat, lon: START.lon, group: 'Custom' } : null)
  const [mast, setMast] = useState(START.mast ?? DEFAULT_MAST)
  const [override, setOverride] = useState(null)   // {id, mast, data} for a curated site at non-default height
  const [busy, setBusy] = useState(false)
  const [layer, setLayer] = useState(START.layer || 'none')   // region-wide map overlay
  const [design, setDesign] = useState(() => parseDesign(START.design))   // "design your lander" what-if
  const [tour, setTour] = useState(START.tour ? 0 : null)   // guided demo step, null = off

  // Load the site index
  useEffect(() => {
    fetchJSON('sites.json')
      .then((s) => {
        setSites(s)
        const want = START.site === 'custom' && custom ? 'custom' : s.find((x) => x.id === START.site)?.id
        const first = want || (s.find((x) => x.id === 'shackleton_ridge') || s[0])?.id
        if (first) { setFocus(first); setCompare([first]) }
      })
      .catch((e) => setError(`Could not load data/sites.json (${e.message}). Run "python -m engine.build" first.`))
  }, [])

  // Lazy-load per-site data (precomputed files)
  const need = useMemo(() => [...new Set([focus, ...compare].filter((x) => x && x !== 'custom'))], [focus, compare])
  useEffect(() => {
    need.filter((id) => !cache[id]).forEach((id) =>
      fetchJSON(`${id}.json`).then((d) => setCache((c) => ({ ...c, [id]: d }))).catch((e) => setError(e.message)))
  }, [need, cache])

  // In-browser analysis: custom point, or a curated polar site at a different panel height
  const focusMeta = focus === 'custom' ? custom : sites.find((s) => s.id === focus)
  useEffect(() => {
    if (!focusMeta) return
    const runCustom = focus === 'custom'
    const runMast = !runCustom && mast !== DEFAULT_MAST && demCovers(focusMeta.lat)
    if (!runCustom && !runMast) { setOverride(null); return }
    let alive = true
    setBusy(true)
    const timer = setTimeout(() => {
      analyse(focusMeta, mast).then((d) => {
        if (!alive) return
        if (runCustom) setCache((c) => ({ ...c, custom: d }))
        else setOverride({ id: focus, mast, data: d })
      }).catch((e) => setError(`${e.message}`)).finally(() => alive && setBusy(false))
    }, 120)
    return () => { alive = false; clearTimeout(timer) }
  }, [focus, mast, custom?.lat, custom?.lon, sites.length])

  const baseSite = override && override.id === focus && override.mast === mast ? override.data : focus ? cache[focus] : null
  const site = useMemo(() => applyDesign(baseSite, design), [baseSite, design])
  const designedCache = useMemo(() => Object.fromEntries(Object.entries(cache).map(([k, d]) => [k, applyDesign(d, design)])), [cache, design])
  const n = site?.n ?? 1
  const stepMin = site?.step_min ?? 60

  // Keep the URL in sync so any view can be shared or bookmarked
  useEffect(() => {
    if (!focus) return
    const p = new URLSearchParams({ site: focus, t: String(i) })
    if (mast !== DEFAULT_MAST) p.set('mast', String(mast))
    if (custom) { p.set('lat', custom.lat.toFixed(3)); p.set('lon', custom.lon.toFixed(3)) }
    if (!explain) p.set('explain', '0')
    if (layer !== 'none') p.set('layer', layer)
    if (!isDefault(design)) p.set('design', designKey(design))
    history.replaceState(null, '', '#' + p.toString())
  }, [focus, i, mast, custom, explain, layer, design])

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

  const onPick = (lat, lon) => {
    setCustom({ id: 'custom', name: 'Custom point', lat, lon, group: 'Custom' })
    setCache((c) => { const { custom: _, ...rest } = c; return rest })
    setFocus('custom')
  }

  const tourApi = {
    focus: setFocus, mast: setMast, layer: setLayer, playing: setPlaying, speed: setSpeed, compare: setCompare,
    design: (id) => setDesign(id ? PRESETS.find((p) => p.id === id).d : DEFAULT_DESIGN),
  }

  const listed = custom ? [{ ...custom, summary: cache.custom?.summary }, ...sites] : sites
  const polarSite = site && demCovers(site.site.lat)

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1 className="brand"><img src={logo} alt="moonle, Lunar Landing Site Navigator" /></h1>
          <p className="sub">Sun, Earth, power and comms at any lunar landing site and date. Terrain from LOLA, ephemeris validated against JPL Horizons.</p>
        </div>
        <div className="top-right">
          <button className="btn primary" onClick={() => setTour(0)} title="A 2-minute guided walk through the app">▶ Demo tour</button>
          <button className={'btn toggle ' + (explain ? 'on' : '')} onClick={() => setExplain((v) => !v)}>{explain ? '✓ Explain mode' : 'Explain mode'}</button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(location.href)} title="Copy a link to exactly this view">🔗 Copy link</button>
          {site && <div className="now mono">{fmtDate(timeAt(site, i))}</div>}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="layout">
        <aside className="side">
          <div id="sec-map"><PolarMap sites={sites} focus={focus} onFocus={setFocus} custom={custom} onPick={onPick} layer={layer} onLayer={setLayer} time={site ? timeAt(site, i).getTime() : null} /></div>
          <SiteList sites={listed} focus={focus} compare={compare} onFocus={setFocus} onToggle={toggleCompare} />
        </aside>

        <main className="main">
          <Intro on={explain} onClose={() => setExplain(false)} />
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
              <section className="card" id="sec-dome">
                <div className="card-head">
                  <h2>{site.site.name}{busy && <span className="busy"> · computing…</span>}</h2>
                  <span className="muted mono">{site.site.lat.toFixed(2)}°, {site.site.lon.toFixed(2)}°E · {site.site.terrain ? 'LOLA terrain horizon' : 'smooth horizon (outside polar DEM)'}</span>
                </div>
                {polarSite && (
                  <div className="mast">
                    <label htmlFor="mast">Solar panel / antenna height</label>
                    <input id="mast" type="range" min={2} max={100} step={1} value={mast} onChange={(e) => setMast(+e.target.value)} />
                    <span className="mono">{mast} m</span>
                    {mast !== DEFAULT_MAST && <button className="btn small" onClick={() => setMast(DEFAULT_MAST)}>reset</button>}
                    {explain && <span className="muted">Raise the panel on a mast to see over nearby hills: watch the longest night shrink.</span>}
                  </div>
                )}
                <Callout on={explain} k="dome" />
                <SkyDome site={site} i={i} />
              </section>
              <Callout on={explain} k="metrics" />
              <Metrics site={site} i={i} />
              <Callout on={explain} k="design" />
              <div id="sec-design"><DesignPanel design={design} onChange={setDesign} site={site} /></div>
              <section className="card">
                <div className="card-head"><h2>Next 30 days</h2><span className="muted">click to jump</span></div>
                <Callout on={explain} k="timeline" />
                <Timeline site={site} i={i} onSeek={setI} />
              </section>
              <section className="card" id="sec-landing">
                <div className="card-head"><h2>When should we land?</h2><span className="muted">{design.mission_days}-day mission from each possible landing day · hover for details, click to jump</span></div>
                <Callout on={explain} k="landing" />
                <LandingAnalysis site={site} i={i} onSeek={setI} compare={compare} cacheSites={designedCache} />
              </section>
            </>
          ) : !error && <div className="card muted">{focus === 'custom' ? 'Analysing this point…' : 'Loading…'}</div>}

          {explain && compare.length > 1 && <Callout on k="compare" />}
          <div id="sec-compare"><Compare ids={compare} cache={designedCache} i={i} /></div>
          <DataPanel site={site} onPick={onPick} />
          {tour != null && <Tour step={tour} setStep={setTour} api={tourApi} />}
        </main>
      </div>
    </div>
  )
}

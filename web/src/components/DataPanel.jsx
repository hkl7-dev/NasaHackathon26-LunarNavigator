// "Data, validation & uncertainty": the evidence behind the maps.
// 1. Artemis III candidate regions scored with our data   2. our maps vs independent NASA maps
// 3. how much the answers move with terrain resolution     4. every dataset used, with downloads
import { useEffect, useMemo, useState } from 'react'
import { useHeatmap, loadRegions, loadRef } from '../heatmap.js'
import { validate } from '../validation.js'
import { loadDem, loadVectors, computeSite, demCovers, poleOf } from '../engine.js'
import { DATA, fetchJSON } from '../lib.js'

const EDGE = 79, R = 1737400
const pct = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`)
const num = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d))

function cellAt(heat, key, lat, lon) {
  const sg = Math.sign(lat)
  const rho = Math.tan(((90 - sg * lat) * Math.PI) / 360) / Math.tan(((90 - EDGE) * Math.PI) / 360)
  const a = (lon * Math.PI) / 180, u = rho * Math.sin(a), v = -sg * rho * Math.cos(a)
  if (!heat || u * u + v * v > 1) return NaN
  const N = heat.N, c = Math.min(N - 1, Math.floor(((u + 1) / 2) * N)), r = Math.min(N - 1, Math.floor(((1 - v) / 2) * N))
  return heat[key]?.[r * N + c]
}

function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Scatter({ x, y, max, label, unit }) {
  const S = 200, P = 26, k = (S - 2 * P) / max
  const pts = useMemo(() => {
    let d = ''
    for (let i = 0; i < x.length; i++) d += `M${(P + Math.min(max, x[i]) * k).toFixed(1)} ${(S - P - Math.min(max, y[i]) * k).toFixed(1)}h1.6`
    return d
  }, [x, y, max])
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="scatter">
      <rect x={P} y={P} width={S - 2 * P} height={S - 2 * P} fill="none" stroke="var(--line)" />
      <line x1={P} y1={S - P} x2={S - P} y2={P} stroke="#ffffff30" strokeDasharray="3 3" />
      <path d={pts} stroke="#ffcc4d" strokeWidth="1.6" opacity="0.35" />
      <text x={S / 2} y={S - 6} className="axis" textAnchor="middle">ours ({unit})</text>
      <text x={10} y={S / 2} className="axis" textAnchor="middle" transform={`rotate(-90 10 ${S / 2})`}>{label}</text>
      <text x={P} y={S - P + 12} className="axis" textAnchor="middle">0</text>
      <text x={S - P} y={S - P + 12} className="axis" textAnchor="middle">{max}</text>
    </svg>
  )
}

function Regions({ regions, listed, source, onPick }) {
  if (!listed.length) return <p className="muted">No region coordinates yet: add the centre latitude and longitude of each region to <code>public/data/artemis3_regions.json</code>.</p>
  if (!regions) return <p className="busy">Scoring {listed.length} regions on 49 spots each, with 240 m and 960 m terrain…</p>
  const rows = [...regions].sort((a, b) => b.best.score - a.best.score)
  return (
    <div className="table-wrap">
      <table className="cmp">
        <thead><tr><th>#</th><th>Region</th><th>Best spot</th><th>Area average</th><th>± terrain res.</th><th>Sunlit</th><th>Earth</th><th>Shortest worst night</th><th>Flat &lt; 8°</th><th /></tr></thead>
        <tbody>{rows.map((g, k) => (
          <tr key={g.id}>
            <td>{k + 1}</td><td>{g.name}</td>
            <td className={k === 0 ? 'best' : ''}>{Math.round(g.best.score * 100)}/100 <span className="muted">at {g.best.lat.toFixed(2)}°, {g.best.lon.toFixed(1)}°E</span></td>
            <td>{Math.round(g.score * 100)}/100</td>
            <td className="muted">±{Math.round(g.scoreDiff * 100)}</td>
            <td>{pct(g.sun)}</td><td>{pct(g.earth)}</td><td>{num(g.nightMin, 1)} d</td><td>{pct(g.flat)}</td>
            <td><button className="btn small" onClick={() => onPick(g.best.lat, g.best.lon)}>Analyse best spot</button></td>
          </tr>))}
        </tbody>
      </table>
      <p className="muted small-note">Ranked by the best spot in each search area (spots about 5 km apart, each scored for slope, Sun, Earth and night length). "Area average" covers the whole search area, including crater floors. "± terrain res." is how much the score moves when the same spots are recomputed with 960 m terrain instead of 240 m. Placement: {source || 'see artemis3_regions.json'}.</p>
    </div>
  )
}

function Validation({ v, refData: ref, pole, horizons }) {
  const ephem = horizons && Math.max(...horizons.map((h) => Math.max(h.max_del_deg, h.max_daz_deg)))
  return (
    <div className="val-grid">
      <div className="tile">
        <div className="mk">Sun & Earth positions vs JPL Horizons</div>
        <div className="mv">{ephem != null ? `${(ephem * 3600).toFixed(2)}″` : '—'}</div>
        <div className="ms">largest difference over {horizons ? horizons.length / 2 : 0} sites × 120 epochs. Independent check of our ephemeris (DE421 via Skyfield).</div>
      </div>
      {!ref && <div className="tile">
        <div className="mk">Maps vs NASA LOLA maps ({pole})</div>
        <div className="mv">not imported</div>
        <div className="ms">Download the LOLA illumination, PSR and slope maps into <code>dem/ref/</code> and run <code>python -m engine.import_reference</code>.</div>
      </div>}
      {v?.sun && <div className="tile val-wide">
        <div className="mk">Sunlight map vs LOLA average illumination (Mazarico et al.)</div>
        <div className="val-row">
          <Scatter x={v.sun.x} y={v.sun.y} max={1} label="LOLA" unit="fraction lit" />
          <div>
            <div className="mv">r = {num(v.sun.r)}</div>
            <div className="ms">mean difference {pct(v.sun.mae, 1)} of the time, bias {v.sun.bias >= 0 ? '+' : ''}{pct(v.sun.bias, 1)} · {v.sun.n} cells</div>
            <p className="ms">Different on purpose in two ways: LOLA averages a full 18.6-year precession cycle, ours covers 2026 to 2028 (the years a mission would fly), and ours uses a 2 m mast and a faster 150 km horizon.</p>
          </div>
        </div>
      </div>}
      {v?.psr && <div className="tile">
        <div className="mk">Never-sunlit cells vs {v.psr.ref}</div>
        <div className="mv">{pct(v.psr.agree)} agree</div>
        <div className="ms">overlap (IoU) {pct(v.psr.iou)}, we find {pct(v.psr.recall)} of LOLA's dark cells; {pct(v.psr.precision)} of ours are dark in LOLA too.</div>
      </div>}
      {v?.earth && <div className="tile">
        <div className="mk">Earth visibility vs LOLA</div>
        <div className="mv">r = {num(v.earth.r)}</div>
        <div className="ms">mean difference {pct(v.earth.mae, 1)}, {v.earth.n} cells</div>
      </div>}
      {v?.slope && <div className="tile">
        <div className="mk">Slope vs LOLA slope map</div>
        <div className="mv">r = {num(v.slope.r)}</div>
        <div className="ms">mean difference {num(v.slope.mae, 1)}°, bias {v.slope.bias >= 0 ? '+' : ''}{num(v.slope.bias, 1)}° · ours: LOLA terrain gradient over 480 m; LOLA's map: laser-shot slopes over 30 to 120 m, so it is steeper by design and shows roughness our terrain grid cannot.</div>
      </div>}
      {v?.cold && <div className="tile">
        <div className="mk">Never-sunlit vs Diviner cold traps (&lt; 110 K)</div>
        <div className="mv">{pct(v.cold.agree)} agree</div>
        <div className="ms">IoU {pct(v.cold.iou)}: shadow from geometry vs temperature measured from orbit.</div>
      </div>}
    </div>
  )
}

function Uncertainty({ site, heat }) {
  const [res, setRes] = useState(null)
  const polar = site && demCovers(site.site.lat)
  useEffect(() => {
    setRes(null)
    if (!polar) return
    let on = true
    const t = setTimeout(() => {
      const meta = { id: site.site.id, name: site.site.name, lat: site.site.lat, lon: site.site.lon, group: site.site.group }
      Promise.all([loadVectors(), loadDem(poleOf(meta.lat))]).then(([vec, dem]) => {
        const fine = computeSite(meta, vec, dem, site.site.mast_m ?? 2).summary
        const coarse = computeSite(meta, vec, { ...dem, fine: null }, site.site.mast_m ?? 2).summary
        if (on) setRes({ fine, coarse })
      }).catch(() => {})
    }, 300)
    return () => { on = false; clearTimeout(t) }
  }, [site?.site.id, site?.site.lat, site?.site.lon, polar])
  if (!site) return null
  if (!polar) return <p className="muted">Pick a site near a pole to see how its numbers depend on the terrain data.</p>
  const mapSun = cellAt(heat, 'sun', site.site.lat, site.site.lon)
  const rows = res && [
    ['Sunlit', pct(res.fine.pct_sunlit, 1), pct(res.coarse.pct_sunlit, 1), `${((res.coarse.pct_sunlit - res.fine.pct_sunlit) * 100).toFixed(1)} pts`],
    ['Earth in view', pct(res.fine.pct_earth_visible, 1), pct(res.coarse.pct_earth_visible, 1), `${((res.coarse.pct_earth_visible - res.fine.pct_earth_visible) * 100).toFixed(1)} pts`],
    ['Longest night', `${(res.fine.longest_dark_h / 24).toFixed(1)} d`, `${(res.coarse.longest_dark_h / 24).toFixed(1)} d`, `${((res.coarse.longest_dark_h - res.fine.longest_dark_h) / 24).toFixed(1)} d`],
    ['Battery needed', `${res.fine.battery_mass_kg} kg`, `${res.coarse.battery_mass_kg} kg`, `${(res.coarse.battery_mass_kg - res.fine.battery_mass_kg).toFixed(1)} kg`],
  ]
  return (
    <div>
      <p className="muted small-note">{site.site.name}: the same analysis run on two versions of NASA's LOLA terrain. A big change means the answer depends on detail the coarser data cannot see.</p>
      {rows ? <table className="cmp"><thead><tr><th /><th>240 m terrain</th><th>960 m terrain</th><th>change</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table>
        : <p className="busy">Re-running the analysis on 960 m terrain…</p>}
      {!Number.isNaN(mapSun) && heat && !heat.partial && <p className="muted small-note">Region map at this spot (6-hourly, 2° horizon, one 8 km cell): sunlit {pct(mapSun, 1)} vs {pct(site.summary.pct_sunlit, 1)} from the full hourly analysis. Use the map to find areas, the site analysis for numbers.</p>}
    </div>
  )
}

const SOURCES = [
  ['LOLA polar topography', 'LRO LOLA, LDEM_75S/75N_240M', '240 m (960 m beyond 85°)', 'Terrain horizons, 3D map, slope', 'https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/', null],
  ['Sun & Earth ephemeris', 'JPL DE421 + Moon ME frame (Skyfield)', 'hourly, 2026 to 2028', 'Sun / Earth position for every site and hour', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/', null],
  ['JPL Horizons', 'NASA JPL', '120 epochs × 3 sites', 'Validation of our ephemeris', 'https://ssd.jpl.nasa.gov/horizons/', null],
  ['LOLA average illumination', 'Mazarico et al. 2011, AVGVISIB_65*_240M', '240 m, 18.6-yr average', 'Validation of our sunlight map', 'https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/', 'lola_sun'],
  ['LOLA average Earth visibility', 'AVGVISIB_65*_240M_EARTH', '240 m', 'Validation of our Earth map', 'https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/', 'lola_earth'],
  ['LOLA permanently shadowed regions', 'LPSR_65*_240M', '240 m', 'Validation + ice evidence', 'https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/', 'lola_psr'],
  ['LOLA slope', 'LDSM_75S/75N_240M', '240 m', 'Validation of our slope', 'https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/', 'lola_slope'],
  ['Diviner max temperature', 'LRO Diviner Polar Resource Product', 'mesh, to 80°', 'Cold traps < 110 K, ice evidence', 'https://pds-geosciences.wustl.edu/lro/lro-l-dlre-4-rdr-v1/lrodlr_1001/data/prp/', 'diviner_tmax'],
  ['Regolith thermal properties', 'Hayne et al. 2017, from LRO Diviner', 'global', 'Surface temperature model (albedo, emissivity, heat flow)', 'https://doi.org/10.1002/2017JE005387', null],
  ['Artemis III candidate regions', 'NASA, Oct 2024 (9 regions)', '≈15 km regions', 'Scored and ranked with our model', 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/', null],
]

const REFERENCES = [
  ['Smith, D. E. et al. (2010). The Lunar Orbiter Laser Altimeter investigation on the Lunar Reconnaissance Orbiter mission. Space Science Reviews 150, 209–241.', 'https://doi.org/10.1007/s11214-009-9512-y'],
  ['Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081.', 'https://doi.org/10.1016/j.icarus.2010.10.030'],
  ['Paige, D. A. et al. (2010). Diviner Lunar Radiometer observations of cold traps in the Moon\'s south polar region. Science 330, 479–482.', 'https://doi.org/10.1126/science.1187726'],
  ['Hayne, P. O. et al. (2017). Global regolith thermophysical properties of the Moon from the Diviner Lunar Radiometer Experiment. JGR Planets 122, 2371–2400.', 'https://doi.org/10.1002/2017JE005387'],
  ['Vasavada, A. R., Paige, D. A., Wood, S. E. (1999). Near-surface temperatures on Mercury and the Moon and the stability of polar ice deposits. Icarus 141, 179–193.', 'https://doi.org/10.1006/icar.1999.6175'],
  ['Li, S. et al. (2018). Direct evidence of surface exposed water ice in the lunar polar regions. PNAS 115, 8907–8912.', 'https://doi.org/10.1073/pnas.1802345115'],
  ['Folkner, W. M., Williams, J. G., Boggs, D. H. (2009). The Planetary and Lunar Ephemeris DE 421. IPN Progress Report 42-178.', 'https://ipnpr.jpl.nasa.gov/progress_report/42-178/178C.pdf'],
  ['Acton, C. H. (1996). Ancillary data services of NASA\'s Navigation and Ancillary Information Facility. Planetary and Space Science 44, 65–70.', 'https://doi.org/10.1016/0032-0633(95)00107-7'],
  ['Rhodes, B. (2019). Skyfield: High precision research-grade positions for planets and Earth satellites generator. Astrophysics Source Code Library, ascl:1907.024.', 'https://rhodesmill.org/skyfield/'],
  ['NASA (2024). NASA provides update on Artemis III Moon landing regions. News release, 28 October 2024.', 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/'],
  ['USGS / IAU Gazetteer of Planetary Nomenclature (feature positions used to place the regions).', 'https://planetarynames.wr.usgs.gov/'],
]

function Sources({ refs, heat, pole, regions, site }) {
  const csv = () => {
    const N = heat.N, ref = refs[pole]?.layers || {}, sg = pole === 'north' ? 1 : -1
    const rhoMax = 2 * R * Math.tan(((90 - EDGE) * Math.PI) / 360)
    const extra = Object.keys(ref)
    const head = ['lat', 'lon', 'sun_frac', 'earth_frac', 'sun_and_earth_frac', 'longest_night_days', 'slope_deg', 'landing_score', 'ice_evidence', ...extra.map((k) => `ref_${k}`)]
    const lines = [head.join(',')]
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const k = r * N + c
      if (Number.isNaN(heat.sun[k])) continue
      const x = (((c + 0.5) / N) * 2 - 1) * rhoMax, y = (1 - ((r + 0.5) / N) * 2) * rhoMax
      const lat = sg * (90 - (2 * Math.atan(Math.hypot(x, y) / (2 * R)) * 180) / Math.PI), lon = (Math.atan2(x, -sg * y) * 180) / Math.PI
      const f = (v, d = 4) => (v == null || Number.isNaN(v) ? '' : (+v).toFixed(d))
      lines.push([f(lat, 4), f(lon, 3), f(heat.sun[k]), f(heat.earth[k]), f(heat.both[k]), f(heat.night[k], 2), f(heat.slope[k], 2), f(heat.score[k], 3), f(heat.evidence?.[k], 3),
        ...extra.map((e) => f(ref[e].center?.[k] ?? ref[e].mean?.[k] ?? ref[e].frac?.[k]))].join(','))
    }
    download(`lunar_${pole}_pole_layers.csv`, lines.join('\n'))
  }
  const regionsJson = () => download('artemis3_regions_scored.geojson', JSON.stringify({
    type: 'FeatureCollection',
    features: regions.map((g) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [g.lon, g.lat] }, properties: { ...g } })),
  }, null, 1), 'application/geo+json')
  return (
    <div>
      <div className="table-wrap">
        <table className="cmp">
          <thead><tr><th>Dataset</th><th>Source</th><th>Resolution</th><th>Used for</th><th>In this build</th></tr></thead>
          <tbody>{SOURCES.map(([name, src, res, use, url, key]) => (
            <tr key={name}>
              <td><a href={url} target="_blank" rel="noreferrer">{name}</a></td><td className="muted">{src}</td><td>{res}</td><td>{use}</td>
              <td>{key == null ? <span className="good-text">✓</span> : ['south', 'north'].map((p) => refs[p]?.layers?.[key] ? <span key={p} className="good-text">✓ {p} </span> : null)}
                {key != null && !refs.south?.layers?.[key] && !refs.north?.layers?.[key] && <span className="muted">not imported</span>}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <h3 className="refs-head">References</h3>
      <ol className="refs">{REFERENCES.map(([cite, url]) => <li key={cite}>{cite} {url && <a href={url} target="_blank" rel="noreferrer">{url.replace('https://', '')}</a>}</li>)}</ol>
      <div className="downloads">
        <span className="muted">Download our processed data:</span>
        <button className="btn small" disabled={!heat || heat.partial} onClick={csv}>Map layers, {pole} pole (CSV)</button>
        <button className="btn small" disabled={!regions?.length} onClick={regionsJson}>Scored Artemis III regions (GeoJSON)</button>
        {site && site.site.id !== 'custom' && <a className="btn small" href={`${DATA}/${site.site.id}.json`} download>This site, hourly (JSON)</a>}
        <a className="btn small" href={`${DATA}/vectors.json`} download>Sun & Earth vectors (JSON)</a>
        <a className="btn small" href={`${DATA}/dem_${pole}_960m.bin`} download>Terrain grid, {pole} (int16)</a>
      </div>
    </div>
  )
}

export default function DataPanel({ site, onPick }) {
  const [chosen, setPole] = useState('south')
  const [tab, setTab] = useState('regions')
  // regions are south-pole only; the uncertainty tab follows the selected site
  const pole = tab === 'regions' ? 'south' : tab === 'uncertainty' && site ? poleOf(site.site.lat) : chosen
  const { heat, progress, regions, ref } = useHeatmap(true, { pole, mapLimit: pole === 'north' ? EDGE : -EDGE })
  const [listed, setListed] = useState([])
  const [regionSource, setRegionSource] = useState('')
  const [horizons, setHorizons] = useState(null)
  const [refs, setRefs] = useState({})
  useEffect(() => { loadRegions().then((r) => { setListed((r.regions || []).filter((g) => g.lat != null && g.lon != null)); setRegionSource(r.source) }) }, [])
  useEffect(() => { fetchJSON('validation_horizons.json').then(setHorizons).catch(() => {}) }, [])
  useEffect(() => { loadRef('south').then((r) => setRefs((m) => ({ ...m, south: r }))); loadRef('north').then((r) => setRefs((m) => ({ ...m, north: r }))) }, [])
  const v = useMemo(() => validate(heat, ref), [heat, ref])
  const TABS = [['regions', 'Artemis III regions'], ['validation', 'Validation'], ['uncertainty', 'Uncertainty'], ['sources', 'Data sources']]
  return (
    <section className="card data-panel" id="sec-data">
      <div className="card-head">
        <h2>Data, validation & uncertainty</h2>
        <div className="seg">
          {TABS.map(([k, t]) => <button key={k} className={'btn small ' + (tab === k ? 'on' : '')} onClick={() => setTab(k)}>{t}</button>)}
          <span className="seg-gap" />
          {tab !== 'regions' && tab !== 'uncertainty' && ['south', 'north'].map((p) => <button key={p} className={'btn small ' + (chosen === p ? 'on' : '')} onClick={() => setPole(p)}>{p === 'south' ? 'S' : 'N'}</button>)}
        </div>
      </div>
      {progress < 1 && tab !== 'uncertainty' && <p className="busy small-note">Computing the {pole} pole maps in the background… {Math.round(progress * 100)}%</p>}
      {tab === 'regions' && <Regions regions={regions} listed={listed} source={regionSource} onPick={onPick} />}
      {tab === 'validation' && <Validation v={v} refData={ref} pole={pole} horizons={horizons} />}
      {tab === 'uncertainty' && <Uncertainty site={site} heat={heat} />}
      {tab === 'sources' && <Sources refs={refs} heat={heat} pole={pole} regions={regions} site={site} />}
    </section>
  )
}

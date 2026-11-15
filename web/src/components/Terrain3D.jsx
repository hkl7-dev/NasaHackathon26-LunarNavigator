// 3D south pole: LOLA terrain as a mesh (true lunar curvature, adjustable vertical exaggeration),
// lit by the real Sun direction for the selected date, with shadows cast by the terrain itself.
// Same map frame as PolarMap (south polar stereographic, 0°E "up" = away from the camera, 90°E to the right).
// Scene units are kilometres; +Y is up at the pole.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadDem, loadVectors } from '../engine.js'
import { GROUP_COLORS } from '../lib.js'
import { colorFor } from '../heatmap.js'

const R = 1737400, D2R = Math.PI / 180, R2D = 180 / Math.PI
const RINGS = 300, SECTORS = 720, RING_POW = 1.6   // rings get denser towards the pole, where the sites are

// ---- map projection (metres), same as heatmap.worker.js / engine.js ----
export const rhoOf = (lat) => 2 * R * Math.tan(Math.PI / 4 + (lat * D2R) / 2)
export function toMap(lat, lon) { const r = rhoOf(lat); return [r * Math.sin(lon * D2R), r * Math.cos(lon * D2R)] }
export function fromMap(x, y) { return [(2 * Math.atan(Math.hypot(x, y) / (2 * R)) - Math.PI / 2) * R2D, Math.atan2(x, y) * R2D] }

function sampleGrid(g, x, y) {
  const c = (x - g.x0) / g.pixel_m - 0.5, r = (g.y0 - y) / g.pixel_m - 0.5, n = g.size
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c))), r0 = Math.max(0, Math.min(n - 2, Math.floor(r)))
  const fc = Math.max(0, Math.min(1, c - c0)), fr = Math.max(0, Math.min(1, r - r0))
  const h = g.h, i = r0 * n + c0
  return (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + n] * (1 - fc) + h[i + n + 1] * fc) * fr
}
function makeSampler({ fine, coarse }) {
  const edge = fine.size * fine.pixel_m, m = fine.pixel_m
  const fx0 = fine.x0 + m, fx1 = fine.x0 + edge - m, fy0 = fine.y0 - m, fy1 = fine.y0 - edge + m
  return (x, y) => (x > fx0 && x < fx1 && y < fy0 && y > fy1 ? sampleGrid(fine, x, y) : sampleGrid(coarse, x, y))
}

// Moon-fixed (km) -> scene axes: X = map x, Y = up at the south pole, Z = -map y
const mfToScene = (x, y, z) => new THREE.Vector3(y, -z, -x)

function dotTexture(color, ring = false) {
  const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s
  const g = cv.getContext('2d')
  if (ring) {
    g.strokeStyle = '#fff'; g.lineWidth = 6
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 12, 0, 2 * Math.PI); g.stroke()
    g.lineWidth = 3; g.beginPath(); g.moveTo(2, s / 2); g.lineTo(s - 2, s / 2); g.moveTo(s / 2, 2); g.lineTo(s / 2, s - 2); g.stroke()
  } else {
    g.fillStyle = color; g.strokeStyle = '#000a'; g.lineWidth = 5
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 5, 0, 2 * Math.PI); g.fill(); g.stroke()
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
}
function glowTexture(inner, outer) {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s
  const g = cv.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, '#0000')
  g.fillStyle = gr; g.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
}

function heatTexture(heat, layer) {
  const N = heat.N, arr = heat[layer], data = new Uint8Array(N * N * 4)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = arr[r * N + c], o = ((N - 1 - r) * N + c) * 4   // heat row 0 is the top of the map (v = 1)
    if (Number.isNaN(v)) { data.set([128, 128, 128, 255], o); continue }
    const [R_, G, B] = colorFor(layer, v)
    data.set([R_, G, B, 255], o)
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true
  return t
}

export default function Terrain3D({ sites, focus, custom, onFocus, onPick, onHover, heat, layer, time, limit, expanded, onFail }) {
  const box = useRef(null)
  const W = useRef({})          // three.js world, kept out of React state
  const [ready, setReady] = useState(false)
  const [exag, setExag] = useState(4)
  const [realSun, setRealSun] = useState(true)
  const [sunInfo, setSunInfo] = useState(null)
  const rhoMax = rhoOf(limit)

  // ---------- one-time scene setup ----------
  useEffect(() => {
    const el = box.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch (e) { onFail?.('WebGL is not available in this browser'); return }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x05070d)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 10000)
    camera.position.set(0, 2600, 300)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.08
    controls.minDistance = 8; controls.maxDistance = 2200
    controls.maxPolarAngle = 88 * D2R
    controls.zoomToCursor = true
    controls.screenSpacePanning = false

    // starfield
    const starGeo = new THREE.BufferGeometry(), sp = new Float32Array(1500 * 3)
    for (let k = 0; k < 1500; k++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(6000)
      sp.set([v.x, v.y, v.z], 3 * k)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9aa4bf, size: 1.4, sizeAttenuation: false })))

    const hemi = new THREE.HemisphereLight(0x8fa3c8, 0x000000, 0.25); scene.add(hemi)
    const fill = new THREE.DirectionalLight(0xffffff, 0.0); fill.position.set(0, 1, 0); scene.add(fill)
    const sun = new THREE.DirectionalLight(0xfff4e0, 3.0)
    sun.castShadow = true
    const maxTex = renderer.capabilities.maxTextureSize
    sun.shadow.mapSize.set(Math.min(4096, maxTex), Math.min(4096, maxTex))
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6
    scene.add(sun); scene.add(sun.target)

    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff8d0', '#ffcc4d88'), sizeAttenuation: false, depthWrite: false, fog: false }))
    sunSprite.scale.setScalar(0.09); scene.add(sunSprite)
    const earthSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#9fd8ff', '#1f6fb288'), sizeAttenuation: false, depthWrite: false }))
    earthSprite.scale.setScalar(0.07); scene.add(earthSprite)

    const markers = new THREE.Group(); scene.add(markers)
    const grid = new THREE.Group(); scene.add(grid)

    const w = W.current
    Object.assign(w, { renderer, scene, camera, controls, sun, fill, hemi, sunSprite, earthSprite, markers, grid, dirty: 2, tween: null, labels: [] })

    const resize = () => {
      const r = el.getBoundingClientRect(), wd = Math.max(50, r.width), ht = Math.max(50, r.height)
      renderer.setSize(wd, ht, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      camera.aspect = wd / ht; camera.updateProjectionMatrix(); w.dirty = 2
      w.px = 1 / (ht * 1.1); w.markers.children.forEach((o) => o.userData.px && o.scale.setScalar(o.userData.px * w.px))
      w.sunSprite.scale.setScalar(70 * w.px); w.earthSprite.scale.setScalar(52 * w.px)
    }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()
    controls.addEventListener('change', () => { w.dirty = 2 })

    const v = new THREE.Vector3()
    let raf
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (w.tween) {
        const t = Math.min(1, (now - w.tween.t0) / w.tween.ms), e = 1 - Math.pow(1 - t, 3)
        if (w.tween.cam) camera.position.lerpVectors(w.tween.cam[0], w.tween.cam[1], e)
        controls.target.lerpVectors(w.tween.tgt[0], w.tween.tgt[1], e)
        if (t >= 1) w.tween = null
        w.dirty = 2
      }
      controls.update()
      if (w.dirty <= 0) return
      w.dirty--
      renderer.render(scene, camera)
      // HTML labels follow their 3D anchors
      const rect = el.getBoundingClientRect()
      for (const L of w.labels) {
        v.copy(L.pos).project(camera)
        const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
        L.el.style.display = vis ? '' : 'none'
        if (vis) L.el.style.transform = `translate(${((v.x + 1) / 2) * rect.width}px, ${((1 - v.y) / 2) * rect.height}px)`
      }
    }
    raf = requestAnimationFrame(loop)

    // fly in from far above once the terrain is ready
    w.intro = () => {
      w.tween = { t0: performance.now(), ms: 2200, cam: [camera.position.clone(), new THREE.Vector3(0, 400, 540)], tgt: [controls.target.clone(), new THREE.Vector3(0, -8, 0)] }
    }

    loadDem().then((dem) => {
      if (!w.renderer) return
      w.sample = makeSampler(dem)
      buildTerrain(w, rhoMax)
      setReady(true)
      w.intro()
    }).catch((e) => onFail?.(e.message))

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose()
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose() }) })
      renderer.dispose(); renderer.domElement.remove()
      W.current = {}
    }
  }, [])

  // ---------- vertical exaggeration ----------
  useEffect(() => {
    const w = W.current
    if (!ready) return
    setHeights(w, exag)
    w.exag = exag
    buildGrid(w, rhoMax, limit)
    w.rebuildMarkers?.()
    w.updateSun?.()
    w.dirty = 2
  }, [ready, exag])

  // ---------- heatmap layer as the terrain's colour ----------
  useEffect(() => {
    const w = W.current
    if (!ready) return
    const m = w.terrain.material
    m.map?.dispose()
    if (heat && layer !== 'none') {
      const t = heatTexture(heat, layer)
      m.map = t; m.emissiveMap = t; m.emissive.set(0xffffff); m.emissiveIntensity = 0.55; m.color.set(0xffffff)
    } else {
      m.map = null; m.emissiveMap = null; m.emissive.set(0x000000); m.color.set(0xb3b0aa)
    }
    m.needsUpdate = true; w.dirty = 2
  }, [ready, heat, layer])

  // ---------- markers + labels ----------
  useEffect(() => {
    const w = W.current
    if (!ready) return
    w.rebuildMarkers = () => {
      const g = w.markers
      g.children.slice().forEach((o) => { g.remove(o); o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose() })
      w.labels.forEach((L) => L.el.remove()); w.labels = []
      const layerEl = box.current.querySelector('.t3d-labels')
      const add = (id, name, lat, lon, color, ring) => {
        const p = surfacePoint(w, lat, lon), on = focus === id
        const top = p.clone().add(new THREE.Vector3(0, 2.5 + 1.2 * w.exag, 0))
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, top]), new THREE.LineBasicMaterial({ color: ring ? 0xffffff : color, transparent: true, opacity: 0.8 }))
        g.add(line)
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(color, ring), sizeAttenuation: false, depthTest: false }))
        s.userData.px = on ? 24 : 16; s.scale.setScalar(s.userData.px * w.px); s.position.copy(top); s.renderOrder = 10; s.userData.id = id
        g.add(s)
        const el = document.createElement('div')
        el.className = 't3d-label' + (on ? ' on' : ''); el.textContent = name
        layerEl.appendChild(el)
        w.labels.push({ pos: top, el })
      }
      sites.forEach((s) => add(s.id, s.name, s.lat, s.lon, GROUP_COLORS[s.group] || '#ccc', false))
      if (custom && custom.lat <= limit + 0.5) add('custom', 'Custom point', custom.lat, custom.lon, '#fff', true)
      for (const [lon, t] of [[0, '0°'], [90, '90°E'], [180, '180°'], [-90, '90°W']]) {
        const el = document.createElement('div'); el.className = 't3d-label axis-label'; el.textContent = t
        layerEl.appendChild(el); w.labels.push({ pos: surfacePoint(w, limit + 0.25, lon).add(new THREE.Vector3(0, 3, 0)), el })
      }
      w.dirty = 2
    }
    w.rebuildMarkers()
  }, [ready, sites, focus, custom?.lat, custom?.lon])

  // ---------- glide to the focused site ----------
  const firstFocus = useRef(true)
  useEffect(() => {
    const w = W.current
    if (!ready || !focus) return
    if (firstFocus.current) { firstFocus.current = false; return }   // keep the intro fly-in
    const meta = focus === 'custom' ? custom : sites.find((s) => s.id === focus)
    if (!meta || meta.lat > limit + 0.5) return
    const p = surfacePoint(w, meta.lat, meta.lon)
    const off = new THREE.Vector3().subVectors(p, w.controls.target)
    w.tween = { t0: performance.now(), ms: 900, cam: [w.camera.position.clone(), w.camera.position.clone().add(off)], tgt: [w.controls.target.clone(), p] }
  }, [ready, focus])

  // ---------- Sun + Earth for the current date ----------
  useEffect(() => {
    const w = W.current
    if (!ready) return
    let alive = true
    loadVectors().then((vec) => {
      if (!alive || !w.renderer) return
      w.updateSun = () => {
        const k = Math.max(0, Math.min(vec.n - 1, Math.round(((time ?? Date.parse(vec.t0)) - Date.parse(vec.t0)) / (vec.step_min * 60000))))
        const s = mfToScene(vec.sun.x[k], vec.sun.y[k], vec.sun.z[k]).normalize()
        const e = mfToScene(vec.earth.x[k], vec.earth.y[k], vec.earth.z[k]).normalize()
        const elS = Math.asin(s.y) * R2D, elE = Math.asin(e.y) * R2D
        setSunInfo({ sun: elS, earth: elE })
        // terrain is stretched vertically by `exag`, so stretch the light's slope the same way:
        // shadows then have the same length on the ground as with real heights and the real Sun
        const stretch = (d) => { const h = Math.hypot(d.x, d.z) || 1e-9; const t = Math.tan(Math.asin(Math.max(-0.99, Math.min(0.99, d.y)))) * w.exag; return new THREE.Vector3(d.x / h, t, d.z / h).normalize() }
        const L = realSun ? stretch(s) : new THREE.Vector3(-0.55, 0.62, 0.55).normalize()
        const D = 1200
        w.sun.position.copy(L).multiplyScalar(D); w.sun.target.position.set(0, 0, 0); w.sun.target.updateMatrixWorld()
        const cam = w.sun.shadow.camera, ext = rhoMax / 1000 + 20, elv = Math.abs(L.y)
        cam.left = -ext; cam.right = ext
        cam.top = ext * elv + 70; cam.bottom = -(ext * elv + 70)
        cam.near = D - ext - 50; cam.far = D + ext + 50; cam.updateProjectionMatrix()
        w.sun.intensity = realSun ? 3.2 : 2.4
        w.fill.intensity = realSun ? 0.12 : 0.45
        w.hemi.intensity = realSun ? 0.22 : 0.35
        w.sunSprite.position.copy(stretch(s).multiplyScalar(900)); w.sunSprite.visible = realSun
        w.earthSprite.position.copy(stretch(e).multiplyScalar(900))
        w.dirty = 2
      }
      w.updateSun()
    })
    return () => { alive = false }
  }, [ready, time, realSun])

  // ---------- pointer: hover readout + click to analyse ----------
  useEffect(() => {
    const w = W.current
    if (!ready) return
    const cv = w.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let down = null, lastMove = 0
    const pick = (e) => {
      const r = cv.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, w.camera)
      const m = ray.intersectObjects(w.markers.children.filter((o) => o.isSprite), false)[0]
      if (m) return { marker: m.object.userData.id }
      const t = ray.intersectObject(w.terrain, false)[0]
      if (!t) return null
      const [lat, lon] = fromMap(t.point.x * 1000, -t.point.z * 1000)
      return { lat, lon }
    }
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return }
      down = null
      const p = pick(e)
      if (!p) return
      if (p.marker) onFocus(p.marker)
      else if (p.lat <= limit) onPick(p.lat, p.lon)
    }
    const onMove = (e) => {
      if (e.buttons) return
      const now = performance.now(); if (now - lastMove < 70) return; lastMove = now
      const p = pick(e)
      cv.style.cursor = p?.marker ? 'pointer' : p ? 'crosshair' : 'grab'
      onHover?.(p && !p.marker ? p : null)
    }
    const onLeave = () => onHover?.(null)
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', onLeave)
    return () => {
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave)
    }
  }, [ready, onFocus, onPick, onHover])

  useEffect(() => { if (W.current.renderer) W.current.dirty = 2 }, [expanded])

  const resetView = () => {
    const w = W.current
    if (!w.camera) return
    w.tween = { t0: performance.now(), ms: 1000, cam: [w.camera.position.clone(), new THREE.Vector3(0, 400, 540)], tgt: [w.controls.target.clone(), new THREE.Vector3(0, -8, 0)] }
  }

  return (
    <div className="t3d-wrap">
      <div className="t3d" ref={box}>
        <div className="t3d-labels" />
        {!ready && <div className="t3d-loading busy">Building 3D terrain from LOLA…</div>}
        {ready && sunInfo && <div className="t3d-hud mono">
          <span style={{ color: '#ffcc4d' }}>☀ {sunInfo.sun.toFixed(2)}°</span>
          <span style={{ color: '#7cc4ff' }}>⊕ {sunInfo.earth.toFixed(2)}°</span>
          <span className="muted">at the pole</span>
        </div>}
      </div>
      <div className="t3d-ctrl">
        <label title="Heights are stretched so the relief is visible; shadows are corrected to stay true to length">
          Relief ×<span className="mono">{exag}</span>
          <input type="range" min={1} max={10} step={1} value={exag} onChange={(e) => setExag(+e.target.value)} />
        </label>
        <button className={'btn small ' + (realSun ? 'on' : '')} onClick={() => setRealSun((v) => !v)} title="Light the terrain with the real Sun for the selected date, or with an overhead studio light">
          {realSun ? '☀ Real Sun' : '☀ Studio light'}
        </button>
        <button className="btn small" onClick={resetView} title="Back to the overview">⟲ View</button>
      </div>
    </div>
  )
}

// ---------- geometry helpers ----------
function buildTerrain(w, rhoMax) {
  const nV = 1 + RINGS * SECTORS
  const pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2)
  const h = new Float32Array(nV), curv = new Float32Array(nV)
  const put = (k, x, y) => {
    pos[3 * k] = x / 1000; pos[3 * k + 2] = -y / 1000
    uv[2 * k] = (x / rhoMax + 1) / 2; uv[2 * k + 1] = (y / rhoMax + 1) / 2
    h[k] = w.sample(x, y); curv[k] = (x * x + y * y) / (2 * R)
  }
  put(0, 0, 0)
  for (let i = 1; i <= RINGS; i++) {
    const rho = rhoMax * Math.pow(i / RINGS, RING_POW)
    for (let j = 0; j < SECTORS; j++) {
      const a = (j / SECTORS) * 2 * Math.PI
      put(1 + (i - 1) * SECTORS + j, rho * Math.sin(a), rho * Math.cos(a))
    }
  }
  const idx = new Uint32Array((SECTORS + (RINGS - 1) * SECTORS * 2) * 3)
  let n = 0
  const at = (i, j) => 1 + (i - 1) * SECTORS + (j % SECTORS)
  for (let j = 0; j < SECTORS; j++) { idx[n++] = 0; idx[n++] = at(1, j + 1); idx[n++] = at(1, j) }
  for (let i = 1; i < RINGS; i++) for (let j = 0; j < SECTORS; j++) {
    const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1)
    idx[n++] = a; idx[n++] = b; idx[n++] = c
    idx[n++] = b; idx[n++] = d; idx[n++] = c
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  const mat = new THREE.MeshLambertMaterial({ color: 0xb3b0aa, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true; mesh.receiveShadow = true
  w.scene.add(mesh)

  // dark rim wall so the cut-out reads as a slab of Moon
  const sk = new THREE.BufferGeometry(), sp = new Float32Array(SECTORS * 2 * 3), si = []
  for (let j = 0; j < SECTORS; j++) {
    si.push(j * 2, j * 2 + 1, ((j + 1) % SECTORS) * 2, j * 2 + 1, ((j + 1) % SECTORS) * 2 + 1, ((j + 1) % SECTORS) * 2)
  }
  sk.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sk.setIndex(si)
  const skirt = new THREE.Mesh(sk, new THREE.MeshBasicMaterial({ color: 0x15171d, side: THREE.DoubleSide }))
  w.scene.add(skirt)

  Object.assign(w, { terrain: mesh, skirt, base: { h, curv, at } })
}

function setHeights(w, exag) {
  const { h, curv, at } = w.base
  const pos = w.terrain.geometry.attributes.position
  for (let k = 0; k < h.length; k++) pos.array[3 * k + 1] = (h[k] * exag - curv[k]) / 1000
  pos.needsUpdate = true
  w.terrain.geometry.computeVertexNormals()
  w.terrain.geometry.computeBoundingSphere(); w.terrain.geometry.computeBoundingBox()
  const sp = w.skirt.geometry.attributes.position
  for (let j = 0; j < SECTORS; j++) {
    const a = at(RINGS, j)
    const x = pos.array[3 * a], y = pos.array[3 * a + 1], z = pos.array[3 * a + 2]
    sp.array.set([x, y, z, x, y - 25, z], j * 6)
  }
  sp.needsUpdate = true; w.skirt.geometry.computeBoundingSphere()
}

function heightAt(w, x, y) { return (w.sample(x, y) * w.exag - (x * x + y * y) / (2 * R)) / 1000 }
function surfacePoint(w, lat, lon) {
  const [x, y] = toMap(lat, lon)
  return new THREE.Vector3(x / 1000, heightAt(w, x, y), -y / 1000)
}

function buildGrid(w, rhoMax, limit) {
  const g = w.grid
  g.children.slice().forEach((o) => { g.remove(o); o.geometry.dispose(); o.material.dispose() })
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false })
  const lift = 0.15 + 0.05 * w.exag
  const pt = (x, y) => new THREE.Vector3(x / 1000, heightAt(w, x, y) + lift, -y / 1000)
  for (const lat of [-80, -85, -88]) {
    const r = rhoOf(lat), pts = []
    for (let a = 0; a <= 360; a += 1) pts.push(pt(r * Math.sin(a * D2R), r * Math.cos(a * D2R)))
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
  }
  for (let lon = 0; lon < 360; lon += 30) {
    const pts = []
    for (let k = 0; k <= 160; k++) { const r = (k / 160) * rhoMax; pts.push(pt(r * Math.sin(lon * D2R), r * Math.cos(lon * D2R))) }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
  }
}

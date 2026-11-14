// 30-day strip: sunlight, Earth visibility, power and battery
const W = 900, LABEL = 90, ROW = 22, DAYS = 30

export default function Timeline({ site, i, onSeek }) {
  const per = 1440 / site.step_min
  const start = Math.max(0, Math.min(i - Math.round(per * 2), site.n - DAYS * per))
  const end = Math.min(site.n, start + DAYS * per)
  const len = end - start
  const xs = (k) => LABEL + ((k - start) / len) * (W - LABEL - 10)
  const bw = (W - LABEL - 10) / len + 0.5
  const maxP = Math.max(1, ...site.power_w.slice(start, end))
  const H = ROW * 3 + 90

  const band = (arr, row, color, fn = (v) => v) => {
    const rects = []
    for (let k = start; k < end; k++) {
      const v = fn(arr[k])
      if (v > 0.02) rects.push(<rect key={k} x={xs(k)} y={10 + row * (ROW + 4)} width={bw} height={ROW} fill={color} opacity={v} />)
    }
    return rects
  }
  const line = (arr, scale, y0, h) => arr.slice(start, end).map((v, k) => `${k ? 'L' : 'M'}${xs(start + k)},${y0 + h - (v / scale) * h}`).join(' ')

  const click = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * W
    if (fx > LABEL) onSeek(Math.round(start + ((fx - LABEL) / (W - LABEL - 10)) * len))
  }

  const ticks = []
  for (let d = 0; d <= DAYS; d += 5) ticks.push(start + d * per)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="timeline" onClick={click}>
      {['Sunlit', 'Earth in view', 'Comms link'].map((t, r) => (
        <g key={t}>
          <rect x={LABEL} y={10 + r * (ROW + 4)} width={W - LABEL - 10} height={ROW} fill="#ffffff08" />
          <text x={LABEL - 8} y={10 + r * (ROW + 4) + 15} className="axis" textAnchor="end">{t}</text>
        </g>
      ))}
      {band(site.sun_vis_frac, 0, '#ffcc4d')}
      {band(site.earth_visible, 1, '#5ea9ff')}
      {band(site.comms_up, 2, '#59d6a4')}
      <text x={LABEL - 8} y={ROW * 3 + 40} className="axis" textAnchor="end">Power</text>
      <text x={LABEL - 8} y={ROW * 3 + 56} className="axis" textAnchor="end" fill="#c89bff">Battery</text>
      <path d={line(site.power_w, maxP, ROW * 3 + 22, 52)} fill="none" stroke="#ffcc4d" strokeWidth="1.5" />
      <path d={line(site.soc, 1, ROW * 3 + 22, 52)} fill="none" stroke="#c89bff" strokeWidth="1.5" />
      {ticks.map((k) => <text key={k} x={xs(k)} y={H - 4} className="axis" textAnchor="middle">
        {new Date(Date.parse(site.t0) + k * site.step_min * 60000).toISOString().slice(5, 10)}</text>)}
      <line x1={xs(i)} x2={xs(i)} y1={4} y2={H - 16} stroke="#fff" strokeWidth="1.5" />
    </svg>
  )
}

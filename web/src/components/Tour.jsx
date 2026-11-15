import { useEffect } from 'react'

// Guided demo: a scripted walk through the app for judges / a pitch video.
// Each step drives the real app state (site, time, map layer, mast, lander design) and highlights one section.
export const STEPS = [
  {
    title: 'Why the lunar south pole?',
    text: 'Artemis and most new missions are heading for the Moon\'s south pole: water ice in shadowed craters, and ridges with almost constant sunlight. But the light there is extreme and changes over a few kilometres. This tool shows exactly what a lander would see, anywhere and at any date.',
    target: 'sec-dome', go: (a) => { a.focus('shackleton_ridge'); a.mast(2); a.layer('none'); a.playing(false); a.design(null) },
  },
  {
    title: 'The Sun never sets the normal way',
    text: 'This is the 360° view from the Shackleton ridge. The grey shape is the real horizon from NASA\'s LOLA laser altimeter. Watch the Sun skim along the horizon and circle all the way round once a month, slipping behind distant mountains.',
    target: 'sec-dome', go: (a) => { a.speed(6); a.playing(true) },
  },
  {
    title: 'Sunlight across the whole region',
    text: 'We computed a terrain horizon for thousands of points around the pole and checked the Sun every 6 hours for three years. Bright ridges and crater rims are lit most of the time; crater floors stay dark. Hover the map to read any spot, click it for a full analysis.',
    target: 'sec-map', go: (a) => { a.playing(false); a.layer('sun') },
  },
  {
    title: 'Where the Sun never shines',
    text: 'Haworth crater floor is in permanent shadow: the Sun never clears the crater rim in our data. That is why ice can survive there for billions of years, and why a solar-powered lander cannot.',
    target: 'sec-dome', go: (a) => { a.focus('haworth'); a.layer('sun') },
  },
  {
    title: 'Raise the panel, shorten the night',
    text: 'Back on the ridge, we put the solar panel on a 30 m mast. The app recomputes the horizon from the terrain in your browser: the panel now sees over nearby hills. The ridge is already sunlit about 92% of the time, so the gain here is modest: the longest night drops from about 4 days to under 3, and the battery needed falls from roughly 33 kg to about 24 kg.',
    target: 'sec-dome', go: (a) => { a.focus('shackleton_ridge'); a.mast(30) },
  },
  {
    title: 'Design your own lander',
    text: 'Every number is driven by a power, battery and comms model. Change the array, battery and loads and the whole app re-runs. Here a big 25 kWh pack carries the lander through the longest night at the ridge.',
    target: 'sec-design', go: (a) => { a.mast(2); a.design('night') },
  },
  {
    title: 'My launch slipped: when can I land?',
    text: 'Each square is a possible landing day. Green: the mission survives on battery and talks to Earth in its first 48 hours. If the launch slips, you can see at a glance which new dates still work and how long the next launch window is.',
    target: 'sec-landing', go: (a) => { a.design(null) },
  },
  {
    title: 'Polar ridge vs. Apollo',
    text: 'Side by side: an Artemis III candidate ridge, the Malapert massif and Apollo 11 near the equator. Apollo sites get two-week nights every month; good polar ridges trade that for low Sun and Earth that bobs below the horizon.',
    target: 'sec-compare', go: (a) => { a.compare(['shackleton_ridge', 'malapert_massif', 'apollo11']) },
  },
  {
    title: 'Your turn',
    text: 'The green map shows where the lander has both sunlight and a radio link to Earth. Click anywhere on it to analyse a brand-new landing site, scrub to any date, and share the exact view with the Copy link button.',
    target: 'sec-map', go: (a) => { a.layer('both') },
  },
]

export default function Tour({ step, setStep, api }) {
  const s = STEPS[step]
  useEffect(() => {
    if (!s) return
    s.go(api)
    const t = setTimeout(() => {
      const el = document.getElementById(s.target)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('tour-focus')
    }, 250)
    return () => { clearTimeout(t); document.querySelectorAll('.tour-focus').forEach((e) => e.classList.remove('tour-focus')) }
  }, [step])
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowRight') setStep((v) => Math.min(STEPS.length - 1, v + 1))
      else if (e.key === 'ArrowLeft') setStep((v) => Math.max(0, v - 1))
      else if (e.key === 'Escape') setStep(null)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])
  if (!s) return null
  const last = step === STEPS.length - 1
  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      <div className="tour-head">
        <span className="muted mono">{step + 1} / {STEPS.length}</span>
        <div className="tour-dots">{STEPS.map((_, k) => <i key={k} className={k === step ? 'on' : ''} onClick={() => setStep(k)} />)}</div>
        <button className="btn small" onClick={() => setStep(null)} title="Exit tour (Esc)">✕</button>
      </div>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      <div className="tour-nav">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
        <button className="btn primary" onClick={() => setStep(last ? null : step + 1)}>{last ? 'Finish' : 'Next →'}</button>
      </div>
    </div>
  )
}

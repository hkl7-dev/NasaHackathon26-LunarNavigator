// Plain-language callouts shown when "Explain" mode is on. Aimed at educators, the public and judges.
export const TEXT = {
  intro: {
    title: 'Why is landing at the lunar south pole so hard?',
    points: [
      ['☀️ The Sun never gets high', 'At the pole the Sun sits within a few degrees of the horizon and slowly circles around it once a month. A small hill or crater rim can block it for days.'],
      ['🌍 Earth bobs up and down', 'The Moon wobbles slightly (libration), so from the pole Earth rises and sets about every two weeks. No Earth in the sky means no direct radio contact.'],
      ['🌑 Light and shadow are extreme', 'With no air to scatter light, shadow is total darkness at about −170 °C or colder. Some crater floors have not seen sunlight for billions of years, which is why water ice survives there.'],
      ['📍 A few km changes everything', 'A ridge can be sunlit most of the time while a crater floor nearby is in permanent shadow. That is why choosing the exact site and date matters so much.'],
    ],
  },
  dome: 'This is the view from the landing site, looking all the way around (N, E, S, W). The grey shape is the real horizon from NASA\'s LOLA laser altimeter. The Sun (yellow) and Earth (blue) are drawn behind the terrain, so you can watch them set behind mountains. Press Play to see the Sun circle the horizon.',
  metrics: 'Key numbers for this moment. Green means good for the mission, red means a problem. "Longest night" is the longest stretch of darkness the lander must survive on battery power.',
  timeline: 'The next 30 days at a glance. Yellow is sunlight, blue is Earth above the horizon, green is a working radio link. The lines show solar power and battery charge. Click anywhere to jump there.',
  landing: 'Every square in the calendar is one possible landing day. Green means a 14-day mission that lands that day keeps its battery alive and can talk to Earth in its first 48 hours; amber survives but with poor contact; red fails. The two charts show why: how low the battery gets, and how much Earth contact there is. If your launch slips, this shows which new dates still work, and the bottom chart shows which other sites are open on the same days.',
  compare: 'Ticked sites side by side. Green marks the best value in each row. The trade-off is often sunlight versus Earth contact: few places have plenty of both.',
}

export function Callout({ on, k }) {
  if (!on) return null
  return <div className="callout"><span className="ci">i</span><p>{TEXT[k]}</p></div>
}

export function Intro({ on, onClose }) {
  if (!on) return null
  return (
    <section className="card intro">
      <div className="card-head"><h2>{TEXT.intro.title}</h2><button className="btn" onClick={onClose}>Hide</button></div>
      <div className="intro-grid">
        {TEXT.intro.points.map(([h, p]) => <div key={h}><h3>{h}</h3><p>{p}</p></div>)}
      </div>
    </section>
  )
}

# Web app

Vite + React (plain JavaScript, no other libraries). It reads the engine's output straight from `../public/data`. No copying is needed, because `vite.config.js` sets `publicDir: '../public'`.

## Run it
You need Node.js 18 or newer. On a Mac: `brew install node`, or download it from https://nodejs.org.
```
cd web
npm install
npm run dev
```
Then open the URL it prints (http://localhost:5173).

No real data yet? From the repo root, run `python -m models.fake_data && python -m engine.build`.

## What's where
| File | What it does |
|---|---|
| `src/App.jsx` | Layout, time state, playback, loading site files |
| `src/components/PolarMap.jsx` | South pole stereographic map; click a site to focus it |
| `src/components/SiteList.jsx` | All sites; checkbox to add to the comparison (max 3) |
| `src/components/SkyDome.jsx` | Horizon panorama: LOLA terrain, Sun, Earth, 30-day Sun path |
| `src/components/Metrics.jsx` | Sunset/Earthset countdowns, power, battery, comms, longest night |
| `src/components/Timeline.jsx` | 30-day strip: sunlit, Earth in view, comms, power and battery lines |
| `src/components/Compare.jsx` | Side-by-side table, with the best value highlighted |
| `src/lib.js` | Time and window helpers |
| `src/styles.css` | Theme |

## Deploy (static)
```
npm run build
```
Upload `web/dist/` to Netlify Drop (https://app.netlify.com/drop), or use Vercel with root `web/`, build command `npm run build` and output `dist`.

## Ideas for the next hours
- "Explain" mode for the public: tooltips on why the pole is different
- A landing-date heatmap (`models.battery.landing_date_scan`)
- Custom coordinates (a small Flask endpoint that runs the engine for one point)
- 3D terrain view (react-three-fiber with a downsampled DEM)

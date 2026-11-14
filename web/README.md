# Web app (step 2, starts about 7 PM)

Suggested stack: **Vite + React + TypeScript**, with Recharts (timelines), D3 or plain SVG (sky dome, polar map), and optionally react-three-fiber (3D terrain).

```bash
npm create vite@latest . -- --template react-ts
npm install recharts d3
```
Copy or symlink `../public/data` to `web/public/data`, then load it with `fetch('/data/sites.json')` and `fetch('/data/<id>.json')`. All fields are described in `../docs/CONTRACTS.md`.

You can start building before the real data exists:
```bash
python -m models.fake_data && python -m engine.build   # makes public/data/fake_*.json
```
Deploy: Vercel, Netlify or GitHub Pages (static build).

# Next Plan: Oliwier (Mast Study, Sizing, Comms, Validation, Deck)

**Lunar Landing Site Navigator · NASA Space Apps 2026 · HackAthlone**
**Window:** tonight until about 2:00 AM, then Sunday morning before the 7:00 AM practice deck.
**Your role:** turn the app's numbers into the engineering story judges remember, and prove those numbers are right. Everything you make ends up as a chart on a slide, a line in `docs/METHODS.md`, or a small JSON file the app can show later.

---

## 0. What changed in the app since your last plan (read this first, 3 minutes)

Hanok's side added four things. You don't need to touch them, but your work should back them up.

| New in the app | What it does | What it needs from you |
|---|---|---|
| **Region map layers** (South pole card: Sunlight, Earth in view, Sun + Earth, Longest night) | Computes a terrain horizon for ~5,500 points around the pole in the browser, then checks Sun and Earth every 6 h for 3 years. Coarser than the engine: 2° azimuth bins, 90 ranges out to 150 km. | **Validation** (task 4): does the coarse map agree with the full engine and with LROC? |
| **Design your lander** panel | Sliders for array area, battery, science load, survival load and mission length. Every chart re-runs live. Four presets: Baseline, Small CubeSat-class, Rover-class, Survive the night. | **Realistic numbers with sources** for the presets (task 5). |
| **Guided demo tour** (▶ Demo tour button) | 9 scripted steps for judges and the pitch video. Step 5 says: on Shackleton ridge, a **30 m mast cuts the longest night from about 18 days to under 3**, and battery from about 150 kg to about 25 kg. | **Confirm or correct that headline** with the Python engine (task 1). If your numbers differ, tell Hanok and he'll change the text. |
| **Landing calendar** now always works | `public/data/extra/landing_<id>.json` was never generated, so the app now runs the 14-day scan in the browser. If your file exists, the app uses yours instead. | Optional (task 6). |

**One finding you should know about:** your `sizing.json` shows polar sites needing about **23 kWh (≈ 155 kg)**, slightly *more* than Apollo 11 (≈ 148 kg). That's real, not a bug: at 2 m height and 240 m terrain, the Shackleton ridge still has an **18-day** winter night in 2026–28. It only becomes the "polar ridges are amazing" story once the panel goes up a mast. **That makes the mast study the most important thing you do tonight.**

---

## Ground rules (unchanged)
- **You own:** `models/`, `analysis/`, `deck_assets/`, `public/data/extra/`, `docs/METHODS.md`, `docs/REFERENCE_LANDERS.md`, `analysis/FINDINGS.md`.
- **Don't edit:** `web/` or `engine/`. If you need an engine change or a web text change, message Hanok with the exact change.
- `git pull` before you start; commit and push at every ✅. Small commits, clear messages.
- Charts: PNG at `dpi=200` in `deck_assets/`, dark background (`plt.style.use("dark_background")`), title, axis labels with units.
- Run everything from the repo root as `python -m analysis.xxx`.

### Quick housekeeping (5 minutes)
- `models/_init_.py` has one underscore on each side. Rename it to `models/__init__.py` (`git mv models/_init_.py models/__init__.py`). It works today only because Python treats the folder as a namespace package.
- Check your geometry files exist: `ls data/geometry/*.json` should list 9 sites. If not: `python -m engine.run_geometry && python -m engine.build`.

---

## Priority order
If you run out of time, stop at the end of any task: each one is useful on its own.

| # | Task | Time | Deck slide |
|---|---|---|---|
| 1 | Mast trade study | 60 min | **Headline slide** |
| 2 | Battery mass vs mast height (sizing v2) | 40 min | Headline slide, right half |
| 3 | Comms and relay analysis | 45 min | Comms slide |
| 4 | Validate the region map | 40 min | Accuracy backup slide |
| 5 | Reference landers for the design panel | 30 min | Backup slide + app presets |
| 6 | Landing-date files + calendar chart | 25 min | Optional |
| 7 | Sensitivity tornado | 30 min | Backup slide |
| 8 | METHODS.md | 45 min | Submission text |
| 9 | Deck package + speaker notes | 30 min | Your 60 seconds |

---

## 1. Mast trade study (60 min): the headline result

**Question:** at the polar sites, how much does raising the solar panel shorten the longest night?

Create `analysis/mast_study.py`. The engine already has everything you need:

```python
"""Mast height trade study. python -m analysis.mast_study"""
import json
import numpy as np
import matplotlib.pyplot as plt
from engine.horizon import DEM, horizon_mask
from engine.visibility import sun_visible_fraction, earth_visibility, windows
from engine.io import read_json

SITES = ["shackleton_ridge", "malapert_massif", "mons_mouton", "im1_malapert_a"]
HEIGHTS = [2, 5, 10, 20, 30, 50, 100]   # metres above local ground

dem = DEM()
rows = []
for sid in SITES:
    g = read_json(f"data/geometry/{sid}.json")
    s, sun, earth = g["site"], g["sun"], g["earth"]
    for h in HEIGHTS:
        mask, _ = horizon_mask(dem, s["lat"], s["lon"], h_obs_extra=h)
        vis = np.asarray(sun_visible_fraction(sun["el"], sun["az"], sun["dist_au"], mask))
        _, ev = earth_visibility(earth["el"], earth["az"], mask)
        lit = vis > 0.5
        dark = [w["hours"] for w in windows(~lit, g["step_min"])]
        rows.append({"site": sid, "mast_m": h, "pct_sunlit": round(float(lit.mean()), 3),
                     "longest_dark_h": float(max(dark or [0])), "pct_earth": round(float(np.mean(ev)), 3)})
        print(rows[-1])

json.dump(rows, open("public/data/extra/mast_study.json", "w"), indent=1)
# plot: 2 panels, x = mast height (log), y = longest night (days) and sunlit (%), one line per site
```

Check the exact signatures in `engine/horizon.py` and `engine/visibility.py` before running (they may return arrays or tuples slightly differently from this sketch).

**Outputs**
- `deck_assets/mast_study.png`: left panel longest night (days) vs height, right panel sunlit % vs height, log x-axis, one line per site.
- `public/data/extra/mast_study.json` in exactly the format above (a list of rows). Hanok may add a small chart in the app from it later, so **don't rename the fields**.
- `analysis/FINDINGS.md`: one sentence, e.g. "On the Shackleton–de Gerlache ridge, a 10 m mast cuts the longest night from X to Y days; 30 m gets it to Z."

**Cross-check against the app:** open the app, pick Shackleton ridge, drag *Solar panel / antenna height* to 30 m, and read *Longest night* (the app showed **2d 19h** at 30 m and **18d 2h** at 2 m). The app uses a coarser 960 m + 240 m grid, so a difference of a few hours to a day is expected. If yours differs by more than ~25%, tell Hanok, because the tour quotes that number.

**Caveat for METHODS.md:** 240 m/px terrain smooths anything within ~1 km (boulders, small craters). The far horizon, which dominates at the pole, is captured well.

✅ **Checkpoint 1:** PNG, JSON and the one-line finding pushed. **Message Hanok the headline numbers.**

---

## 2. Battery mass vs mast height (40 min)

Re-use your `analysis/sizing.py` bisection, but for the polar sites run it at several mast heights. You'll need the power series for each height, so compute `sun_vis_frac` from the mask of task 1 and feed it to `panel_power_w` (vertical tracking).

- Output `public/data/extra/sizing_mast.json`: `[{site, mast_m, min_battery_wh, battery_kg}]`.
- Chart `deck_assets/battery_vs_mast.png`: grouped bars, x = site, bars for 2 m / 10 m / 30 m, plus one Apollo 11 bar as the reference. Label the bars in kg.
- **This is the slide's punchline:** "At 2 m, a polar lander needs as much battery as Apollo. Put the array on a 10–30 m mast and it needs a fraction of it." Use your real numbers.
- Keep Haworth as "∞ (permanent shadow)": no mast height will save it, and that's the point.

✅ **Checkpoint 2:** pushed. Take charts 1 and 2 to a mentor if one is around, and ask: "Is 150 W science / 40 W survival a fair load for a small polar lander?"

---

## 3. Comms and relay analysis (45 min)

Using `public/data/<id>.json` for every site:
- **% time Earth visible** (already in `summary.pct_earth_visible`)
- **Longest comms blackout** in hours (longest run of `comms_up == 0`)
- **Data returned per lunar day (GB)**, with `models.comms.data_per_lunar_day_gb`
- **S-band vs X-band**: re-run the link budget with `{**COMMS_CFG, "band": "S"}` and report both rates

Outputs:
- `analysis/comms_table.md`: one row per site.
- `deck_assets/comms_blackouts.png`: horizontal bars, longest blackout per site (days).
- `public/data/extra/comms.json`: `[{site, pct_earth, longest_blackout_h, gb_per_lunar_day_x, gb_per_lunar_day_s}]`.

The story for the slide: Chang'e-6 (far side) and the Haworth floor have **0% direct-to-Earth**, which is why Chang'e-6 used the Queqiao-2 relay and why NASA (LCRNS) and ESA (Moonlight) are planning lunar relay services. Polar ridges get multi-day blackouts every ~2 weeks because of libration. Double-check those mission names and facts against a source before they go on a slide.

✅ **Checkpoint 3:** pushed.

---

## 4. Validate the region map (40 min): "how accurate is the heatmap?"

Judges may ask whether the colourful map is real. Back it up.

1. Pick ~12 points across the map: the 5 polar curated sites plus 7 others, e.g. a few crater floors (Shoemaker, Faustini, de Gerlache interior), a few rims, and points at −80°, −83°, −86° on different longitudes.
2. For each point, compute the **full-engine** sunlit % and longest night (same code as task 1 at 2 m).
3. In the app, select the *Sunlight* layer and hover each point to read the map's value. Do the same for *Longest night*. (Hover shows lat/lon, so you can line them up.)
4. Write `analysis/heatmap_validation.md`: a table of point, engine value, map value, difference, plus a one-line verdict (e.g. "map within ±N percentage points at 10 of 12 points").
5. **External cross-check:** compare Shackleton ridge and Malapert to published illumination numbers: the LROC Quickmap illumination layer (https://quickmap.lroc.asu.edu) and/or Mazarico et al. 2011, *Illumination conditions of the lunar polar regions using LOLA topography* (Icarus). Note that they use different heights, time spans and resolutions, so agreement within ~10–15 points is good.

✅ **Checkpoint 4:** validation table pushed. If any point is badly off, tell Hanok which one and by how much.

---

## 5. Reference landers for the design panel (30 min)

The design panel's presets are labelled "illustrative". Make them defensible.

Write `docs/REFERENCE_LANDERS.md`: a table of 4–6 real or proposed polar/lunar spacecraft with **published** numbers and a source link for each: array power or area, battery capacity, typical operating load, mission length. Good candidates: Intuitive Machines IM-1/IM-2, Chandrayaan-3 Vikram, NASA VIPER, Astrobotic Peregrine/Griffin, ispace Hakuto-R. If a number isn't published, write "not published", don't guess.

Then send Hanok a short message: "Set preset X to these values: area_m2=…, capacity_wh=…, load_day_w=…, load_night_w=…, mission_days=…" (the fields in `web/src/design.js`). He'll update the code. Rename presets after real missions only if the numbers are close.

✅ **Checkpoint 5:** pushed and message sent.

---

## 6. Landing-date files + calendar chart (25 min, optional)

The app now computes this itself, so this is only for the deck and as a Python cross-check.
- Add `landing_date_scan(power_w, step_min, cfg, mission_days=14, every_h=24)` to `models/battery.py`, returning `[{start_i, survives, min_soc}]` (loop over `mission_window_ok`).
- Run the `analysis/landing_dates.py` script from your evening plan. It writes `public/data/extra/landing_<id>.json` with `{site, t0, step_min, mission_days, days: [{start_i, survives, min_soc, comms_48h}]}`. **Keep exactly those field names**: the app loads this file automatically if it exists.
- Chart `deck_assets/landing_calendar.png`: one row per site, one column per day, green/amber/red.
- Sanity check: for Shackleton ridge, the app shows **181 good · 334 marginal · 567 fail** days (14-day mission, default lander). Your numbers should be very close.

---

## 7. Sensitivity tornado (30 min)

For Shackleton ridge (at 2 m and at your recommended mast height) and Apollo 11: vary each assumption ±20% one at a time (`efficiency`, `derate`, `area_m2`, `load_night_w`, `load_day_w`, `specific_energy_wh_kg`, `dod_max`) and record the battery mass needed. Chart: `deck_assets/sensitivity_tornado.png`. One-line takeaway in `FINDINGS.md` ("survival load dominates; cell efficiency barely matters", or whatever the data says).

---

## 8. METHODS.md (45 min)

Same outline as your evening plan (ephemeris, validation table from `data/validation.json`, terrain, visibility, models, limitations, cross-check), plus two new sections:

- **In-browser analysis.** Clicked points and the mast slider re-run the same horizon and model code in JavaScript (`web/src/engine.js`) on a 960 m grid to 75°S plus the full 240 m grid near the pole. The region map (`web/src/heatmap.worker.js`) is a faster, coarser version: 2° azimuth, 90 log-spaced ranges from 0.7 to 150 km, Sun/Earth sampled every 6 h, panel at 2 m. Quote your task 4 validation result here.
- **Lander design panel.** Power scales linearly with array area; the battery model is re-run with the user's capacity and loads, using exactly the `models/battery.py` rules (day/night load switch at 20% of day load, 80% DoD, 95% charge/discharge efficiency).

---

## 9. Deck package + your speaker notes (30 min)

- Copy the best 5 charts into `deck_assets/final/`: mast study, battery vs mast, comms blackouts, heatmap validation (a table is fine as an image), sensitivity tornado.
- `deck_assets/SPEAKER_NOTES_OLIWIER.md`: 3–4 bullets per chart for **your ~60 seconds**. Lead with the mast result, then battery mass, then comms. Every bullet should contain a number.
- The live demo follows the app's built-in tour (▶ Demo tour), so your charts are the "here's the engineering behind it" part. Step 5 of the tour (the mast) is where your headline slide fits best.

---

## Files you will create (summary)
```
analysis/mast_study.py            public/data/extra/mast_study.json
analysis/sizing_mast.py           public/data/extra/sizing_mast.json
analysis/comms.py                 public/data/extra/comms.json
analysis/landing_dates.py         public/data/extra/landing_<id>.json   (optional)
analysis/sensitivity.py
analysis/FINDINGS.md  analysis/comms_table.md  analysis/heatmap_validation.md
docs/METHODS.md  docs/REFERENCE_LANDERS.md
deck_assets/mast_study.png  battery_vs_mast.png  comms_blackouts.png
deck_assets/landing_calendar.png  sensitivity_tornado.png  deck_assets/final/
deck_assets/SPEAKER_NOTES_OLIWIER.md
```
None of these touch `web/` or `engine/`, so there's no merge-conflict risk with Hanok.

## If something breaks
| Problem | Fix |
|---|---|
| `ModuleNotFoundError: engine` | Run from the repo root with `python -m analysis.xxx` |
| `data/geometry/...json` missing | `python -m engine.run_geometry`, then `python -m engine.build` |
| DEM "No such file" | `dem/LDEM_75S_240M.IMG` and `.LBL` must both be in `dem/` |
| Mast study too slow | Start with `HEIGHTS = [2, 10, 30]` and 2 sites, then add more |
| Your numbers disagree with the app | Normal within a few %. Bigger than ~25%: send Hanok the site, the two numbers and your settings |
| Merge conflict | You should only touch your own folders. If it happens, message Hanok before resolving |

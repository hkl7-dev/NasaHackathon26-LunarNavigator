# 🌒 Lunar Landing Site Navigator

**NASA Space Apps Challenge 2026 · HackAthlone (TUS Athlone, Ireland)**
Challenge: *Lunar Landing Site Navigator*

> Pick a landing site on the Moon and a date. Instantly see where the Sun and Earth are against the **real terrain horizon**, how much **power** your lander gets, whether its **battery survives the night**, and when it can **talk to Earth**. Compare sites side by side in seconds instead of hours.

## Why
Missions to the lunar south pole (Artemis, CLPS) face extreme lighting: the Sun skims the horizon, mountains cast shadows for days, and Earth bobs above and below the horizon every ~2 weeks. Tools like JPL Horizons, Quickmap and Moon Trek hold the data but are built for specialists. When a launch slips, planners need fast answers: *"Is a site 10 km away, or a date 2 weeks later, still viable?"*

## What it does
- 🗺️ **Site picker:** curated Apollo, CLPS, Artemis III, ISRO and CNSA sites, plus custom coordinates
- 📅 **Date slider and timeline:** scrub through lunar days; see "sunset in 3d 4h" and "Earthset in 19h"
- 🌄 **Sky dome view:** Sun and Earth plotted over the LOLA-derived terrain horizon
- ⚡ **Power and battery:** solar output for 3 panel configurations; longest night; battery mass needed
- 📡 **Comms:** direct-to-Earth windows and achievable data rate (link budget)
- ⚖️ **Compare:** 2 or 3 site and date combinations side by side
- ✅ **Validated** against JPL Horizons (see `data/validation.json`)

## Team
| Name | Role |
|---|---|
| Hanok | Computer Science: ephemeris, terrain horizons, data pipeline, web app |
| Oliwier | Electronic Engineering: power, battery and communications models |

## Architecture
```
SPICE kernels + LOLA DEM
        │
engine/ephemeris.py ─┐
engine/horizon.py   ─┼─► data/geometry/<site>.json   (contract A)
engine/visibility.py ┘            │
                                  ▼
          models/power.py, battery.py, comms.py   (contract B)
                                  │
engine/build.py ─────────────────► public/data/<site>.json + sites.json (contract C)
                                  │
                         web/ (React app reads static JSON)
```
Everything heavy is **precomputed**, so the web app is a fast static site with no backend.
Full field definitions: [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Quick start
```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 1. Download data (see docs/DATA_SOURCES.md): SPICE kernels -> engine/kernels/, LOLA DEM -> dem/
# 2. Geometry for all sites (Sun/Earth + terrain horizon)
python -m engine.run_geometry            # add --no-terrain to skip the DEM
# 3. Validate against JPL Horizons
python -m engine.validate
# 4. Power, battery and comms, then export for the web app
python -m engine.build
# Tests for the EE models
pytest models -q
```

## Data sources
- **JPL DE421 ephemeris** and **NAIF lunar frame kernels** (Mean Earth frame), via [Skyfield](https://rhodesmill.org/skyfield/)
- **LOLA** (Lunar Orbiter Laser Altimeter) polar DEM, from the PDS Geosciences Node
- **JPL Horizons API**, for validation
- **LROC Quickmap** and **NASA Moon Trek**, for visual cross-checks

See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Assumptions and limitations
- Engineering parameters (panel area, efficiency, radio power, DSN G/T) are **representative estimates**, not a specific lander's specs. See `models/config.py`.
- Terrain horizons use a 120–240 m/px DEM; near-field boulders and small craters are not resolved.
- Sites outside the polar DEM use a smooth-sphere horizon (flagged `"terrain": false`).
- Hourly time steps (10-minute steps for detail views).

## Licence
MIT

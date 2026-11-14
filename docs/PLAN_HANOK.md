# Data Engine Plan: Hanok (Geometry, Terrain, Validation, Export)

**Lunar Landing Site Navigator · NASA Space Apps 2026 · HackAthlone**
**Window:** Saturday 2:30 PM to 7:00 PM (4.5 hours)
**Goal by 7 PM:** one `public/data/` folder of JSON files that the web app can load directly. For every site it holds the Sun and Earth positions hour by hour, the real terrain horizon, the light and comms windows, and the power and comms numbers from your teammate's models.

> Your teammate has a matching plan, `data-engine-plan-teammate.md`. The **interface contract** (section 3) is the same in both files. If you change it, tell them straight away.

---

## 0. The big picture (read this first, 2 minutes)

```
          ┌──────────────────────── YOU ────────────────────────┐
 kernels ─►  ephemeris.py   Sun/Earth az, el, distance per hour  │
 LOLA DEM ─► horizon.py     terrain horizon mask per site        │
          │  visibility.py  sun_vis_frac, earth_visible, events  │
 Horizons ─► validate.py    proves we match JPL (pitch slide)    │
          └───────────────┬──────────────────────────────────────┘
                          │  data/geometry/<site_id>.json   (contract A)
                          ▼
          ┌──────────────── TEAMMATE (EE) ─────────────────┐
          │  models/power.py   panel W per hour             │
          │  models/battery.py state of charge, night survival │
          │  models/comms.py   link budget, max data rate   │
          └───────────────┬────────────────────────────────┘
                          │  Python functions (contract B)
                          ▼
              build.py (YOU)  ─►  public/data/<site_id>.json + sites.json
                                   (contract C, what the web app reads)
```

**Why precompute?** The app never does astronomy in the browser. Instead it loads small JSON files and just scrubs through time, so it's fast and impossible to break during the demo. The "custom coordinates" feature can come later: either a tiny Flask endpoint that runs the same code, or a coarser grid we precompute.

---

## 1. Setup (2:30 to 2:50 PM)

### 1.1 Repo layout
```
lunar-navigator/
├── engine/
│   ├── sites.py          # curated site list (section 2)
│   ├── ephemeris.py      # Skyfield Sun/Earth positions
│   ├── horizon.py        # LOLA terrain horizon masks
│   ├── visibility.py     # combine mask + ephemeris -> windows/events
│   ├── validate.py       # JPL Horizons cross-check
│   ├── build.py          # final export, calls teammate's models
│   └── kernels/          # downloaded SPICE files (gitignored)
├── models/               # TEAMMATE owns this folder
│   ├── power.py
│   ├── battery.py
│   └── comms.py
├── dem/                  # LOLA files (gitignored, large)
├── data/geometry/        # your intermediate output (contract A)
├── public/data/          # final output the web app reads (contract C)
└── requirements.txt
```
Create a GitHub repo and add your teammate as a collaborator. Add `dem/` and `engine/kernels/` to `.gitignore`.

### 1.2 Environment
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install skyfield numpy scipy pyproj rasterio requests matplotlib
pip freeze > requirements.txt
```
If `rasterio` won't install on Windows, use `conda install -c conda-forge rasterio`, or skip it and read the raw `.IMG` with numpy (section 5.2 shows how).

### 1.3 Downloads (start these NOW, in the background, before you write code)
**SPICE kernels.** Skyfield's `load()` fetches these automatically on first run, but the venue Wi-Fi can be slow, so grab them up front into `engine/kernels/`:
| File | URL | Size |
|---|---|---|
| `de421.bsp` | https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp | ~17 MB |
| `moon_pa_de421_1900-2050.bpc` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc | ~1.7 MB |
| `moon_080317.tf` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf | small |
| `pck00008.tpc` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00008.tpc | small |

**LOLA south polar DEM.** This is the biggest download, so start it first. Go to the PDS LOLA polar GDR directory, https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/, and take a file that **reaches 75°S or 80°S** at **120 to 240 m/pixel**. Names look like `LDEM_75S_240M.IMG` (check the listing for the exact name) and come with a matching `.LBL` label. Download both into `dem/`.
- Why that coverage: the horizon at the pole is set by mountains up to about 150 to 200 km away (Malapert massif, for example). A small high-res tile right at the pole misses them.
- Why not 5 or 20 m: those files are GB-sized and we have hours, not days. 240 m is plenty for a horizon mask.
- Plan B if imbrium is slow: in Moon Trek (https://trek.nasa.gov/moon), use the layer manager, pick a "LOLA DEM South Pole" layer, then "Download" to get a GeoTIFF. rasterio reads it the same way.

✅ **Checkpoint 0 (2:50 PM):** venv works, `python -c "import skyfield, rasterio"` passes, and the DEM download is running.

---

## 2. Curated sites (`engine/sites.py`, 2:50 to 3:00 PM)

Coordinates are **approximate, from published mission reports**. Spend 5 minutes in Quickmap (https://quickmap.lroc.asu.edu) checking each south pole one. Use **planetocentric latitude and east longitude (−180 to 180)**.

```python
SITES = [
  # id,                     name,                            lat,      lon,     group
  ("shackleton_ridge",  "Shackleton–de Gerlache ridge",     -89.45,  -137.3,  "Artemis III region"),
  ("haworth",           "Haworth (Artemis III region)",      -87.45,    -5.0,  "Artemis III region"),
  ("malapert_massif",   "Malapert Massif",                   -86.0,      2.9,  "Artemis III region"),
  ("mons_mouton",       "Mons Mouton (IM-2 / ex-VIPER)",     -84.79,    29.19, "CLPS"),
  ("im1_malapert_a",    "IM-1 Odysseus (Malapert A)",        -80.13,     1.44, "CLPS"),
  ("chandrayaan3",      "Chandrayaan-3 Shiv Shakti point",   -69.373,   32.319,"ISRO"),
  ("change6",           "Chang'e-6 (Apollo basin, far side)",-41.64,  -153.99, "CNSA"),
  ("apollo11",          "Apollo 11 Tranquility Base",          0.6741,  23.4730,"Apollo"),
  ("apollo17",          "Apollo 17 Taurus–Littrow",           20.1908,  30.7717,"Apollo"),
]
```
The Apollo sites and Chang'e-6 are there **for contrast**. Apollo gives the "normal" 14-day-day, 14-day-night pattern. Chang'e-6 is on the far side, so Earth is **never** visible there. That makes a great demo moment: "this is why you need a relay satellite."

---

## 3. Interface contracts (agree these with your teammate by 3:00 PM)

### Contract A: `data/geometry/<site_id>.json` (you write it, your teammate reads it)
```json
{
  "site": {"id": "haworth", "name": "...", "lat": -87.45, "lon": -5.0, "elev_m": 1234.0},
  "t0": "2026-01-01T00:00:00Z",
  "step_min": 60,
  "n": 26304,
  "sun":   {"az": [...], "el": [...], "dist_au": [...]},
  "earth": {"az": [...], "el": [...], "dist_km": [...]},
  "mask":  {"az_step_deg": 0.5, "el": [ ...720 values... ]},
  "sun_vis_frac":     [...],
  "earth_mask_el":    [...],
  "earth_visible":    [...]
}
```
- All angles are in **degrees**. Azimuth: 0° = north, 90° = east (Skyfield's convention, and the mask uses the same one).
- `sun_vis_frac` runs from 0 to 1: the fraction of the solar disk above the terrain horizon (section 6).
- `earth_mask_el` is the terrain horizon elevation in Earth's current direction. Your teammate uses it for the comms elevation margin.
- `earth_visible` is 0 or 1, meaning the centre of Earth is above the terrain horizon.
- Round angles to 3 decimals before writing JSON (`np.round(x, 3).tolist()`), which keeps files small.
- Time index `i` corresponds to `t0 + i*step_min`.

### Contract B: Python functions (your teammate writes them, `build.py` calls them)
```python
# models/power.py
def panel_power_w(sun_el, sun_az, sun_vis_frac, sun_dist_au, cfg) -> np.ndarray  # W, per step
# models/battery.py
def simulate_battery(power_w, step_min, cfg) -> dict  # {"soc": array 0..1, "survives": bool, "min_soc": float, "longest_dark_h": float, "battery_wh_needed": float}
# models/comms.py
def link_rate_bps(earth_dist_km, cfg) -> np.ndarray          # max data rate when link is up
def comms_available(earth_el, earth_mask_el, cfg) -> np.ndarray  # 0/1, with elevation margin
```
The `cfg` dicts are defined in the teammate plan, section 2. Inputs are numpy arrays of length `n`.

### Contract C: `public/data/<site_id>.json` plus `public/data/sites.json` (`build.py` writes them, the web app reads them)
This is contract A, plus `power_w`, `soc`, `comms_up`, `rate_bps`, an `events` list and a `summary` block (section 8).

✅ **Checkpoint A (3:00 PM):** both of you agree on contracts A and B. Commit `engine/sites.py` and a stub `README` that contains the contracts.

---

## 4. Ephemeris (`engine/ephemeris.py`, 3:00 to 3:40 PM)

### 4.1 Core code
```python
import numpy as np
from skyfield.api import load, PlanetaryConstants

KDIR = "engine/kernels"
ld = load  # or: from skyfield.api import Loader; ld = Loader(KDIR)

ts  = ld.timescale()
eph = ld("de421.bsp")                         # valid 1900–2050
pc  = PlanetaryConstants()
pc.read_text(ld("moon_080317.tf"))
pc.read_text(ld("pck00008.tpc"))
pc.read_binary(ld("moon_pa_de421_1900-2050.bpc"))
FRAME = pc.build_frame_named("MOON_ME_DE421")  # Mean Earth frame = what LOLA maps use

MOON, SUN, EARTH = eph["moon"], eph["sun"], eph["earth"]

def time_grid(start=(2026, 1, 1), years=3, step_min=60):
    n = int(years * 365.25 * 24 * 60 / step_min)
    minutes = np.arange(n) * step_min
    return ts.utc(start[0], start[1], start[2], 0, minutes), n

def site_ephemeris(lat, lon, elev_m, t):
    place = MOON + pc.build_latlon_degrees(FRAME, lat, lon, elev_m)
    out = {}
    for name, body in (("sun", SUN), ("earth", EARTH)):
        alt, az, dist = place.at(t).observe(body).apparent().altaz()
        out[name] = {"az": az.degrees, "el": alt.degrees,
                     "dist_au": dist.au, "dist_km": dist.km}
    return out
```
- `observe().apparent()` includes light-time and aberration. There's no atmosphere, so no refraction (what Horizons calls "AIRLESS").
- `altaz()` here is relative to the **smooth sphere** (local horizontal plane). Terrain comes in later, in section 6.
- Speed: 26k times × 2 bodies × 9 sites runs in about 1 to 2 minutes. If it's slow, chunk `t` into one-year pieces.
- `elev_m`: set it to the DEM height at the site + 2 m (solar panel or antenna height), once you have the DEM. Use 0 until then.

### 4.2 Sanity checks (do NOT skip, 10 minutes)
Plot `sun.el` against time for **Apollo 11** and **Haworth** over 60 days with matplotlib:
- Apollo 11: the Sun climbs to about 90° and drops to about −90°, with a period of about **29.5 days** (synodic month). ✓
- Haworth (−87.45°): the Sun sits within about **±4°** of the horizon (pole offset 2.55° + the Moon's 1.54° axial tilt). ✓
- Earth at Apollo 11: elevation stays high and nearly constant (wobbling a few degrees from libration). ✓
- Earth at the south pole: elevation oscillates around 0°, by about ±7°, over **~27.3 days**. So Earth sets and rises roughly every two weeks. **This is a key insight for the pitch.** ✓
- Chang'e-6: Earth elevation is always negative. ✓

If those look right, the frame and longitude sign are right.

### 4.3 Export a SAMPLE file for your teammate (by 3:40 PM, high priority)
Write `data/geometry/haworth.json` in contract A format. Use **mask = all zeros for now**, with `sun_vis_frac` from the smooth-sphere formula in section 6. Push it. Your teammate is waiting on this to test against real numbers.

✅ **Checkpoint 1 (3:40 PM):** a sample geometry JSON is pushed and the sanity plots look right. **Screenshot the Haworth plot for the deck.**

---

## 5. Terrain horizon masks (`engine/horizon.py`, 3:40 to 5:15 PM, the riskiest part)

**Time box:** if masks aren't working by **5:15 PM**, ship with mask = 0 (smooth sphere) and say in the pitch "terrain horizon in progress". Do not let this block the app.

### 5.1 What a horizon mask is
For each azimuth from 0 to 359.5° in steps of 0.5° (720 directions), walk outward from the site across the DEM. At each step, compute the elevation angle to the terrain, including the Moon's curvature. The **maximum** angle along that ray is the horizon elevation in that direction. The Sun is up only where `sun_el > mask(sun_az)`.

### 5.2 Load the DEM
```python
import rasterio, numpy as np
from pyproj import CRS, Transformer

ds  = rasterio.open("dem/LDEM_75S_240M.LBL")   # GDAL reads PDS3 via the .LBL (or open the .IMG)
dem = ds.read(1).astype(np.float32)
```
- **Scaling:** open the `.LBL` in a text editor. If it has `SCALING_FACTOR = 0.5` (typical for LOLA GDR 16-bit), multiply: `dem_m = dem * 0.5 (+ OFFSET if present)`. Heights are **metres relative to a 1737.4 km sphere**. Sanity: values should range from about −5000 to +6000 m.
- **Projection:** polar stereographic centred on the south pole. Build a transformer from lat/lon to map x/y:
```python
R = 1737400.0
crs_dem = ds.crs or CRS.from_proj4(f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={R} +units=m +no_defs")
crs_ll  = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
to_xy   = Transformer.from_crs(crs_ll, crs_dem, always_xy=True)
inv     = ~ds.transform          # affine: (x, y) -> (col, row)
```
If `ds.crs` is None (it can be with PDS3), the proj4 string above is the standard one. **Verify** it by transforming a known feature, for example Shackleton crater's centre (about −89.67, 129.2 E). It should land on the crater in a `plt.imshow(dem)` plot.
- **No-rasterio fallback:** read `.LBL` for `LINE_SAMPLES`, `LINES`, `SAMPLE_TYPE` and `MAP_SCALE`, then `np.fromfile(path, dtype='<i2').reshape(LINES, SAMPLES)`. Build the affine yourself from `LINE_PROJECTION_OFFSET`, `SAMPLE_PROJECTION_OFFSET` and `MAP_SCALE`.

### 5.3 Ray-march in lat/lon space (avoids every azimuth-convention bug)
Generate ray points with the spherical "destination point" formula, so the azimuth is the true geographic azimuth (0 = north, 90 = east), the same convention Skyfield uses. Then project those points into the DEM.

```python
from scipy.ndimage import map_coordinates

AZ = np.arange(0, 360, 0.5)                       # 720 directions
D  = np.geomspace(250, 250_000, 1500)             # metres: 250 m → 250 km, denser near site

def dest_points(lat0, lon0, az_deg, d_m):
    φ1, λ1 = np.radians(lat0), np.radians(lon0)
    θ = np.radians(az_deg)[:, None]; δ = (d_m / R)[None, :]
    φ2 = np.arcsin(np.sin(φ1)*np.cos(δ) + np.cos(φ1)*np.sin(δ)*np.cos(θ))
    λ2 = λ1 + np.arctan2(np.sin(θ)*np.sin(δ)*np.cos(φ1), np.cos(δ) - np.sin(φ1)*np.sin(φ2))
    return np.degrees(φ2), np.degrees(λ2)          # shape (720, 1500)

def sample_dem(lat, lon):
    x, y = to_xy.transform(lon, lat)
    col, row = inv * (x, y)
    return map_coordinates(dem_m, [row, col], order=1, mode="nearest")  # bilinear

def horizon_mask(lat0, lon0, h_obs_extra=2.0):
    h0 = sample_dem(np.array([lat0]), np.array([lon0]))[0] + h_obs_extra
    plat, plon = dest_points(lat0, lon0, AZ, D)
    h  = sample_dem(plat, plon)                     # (720, 1500)
    δ  = D / R
    # exact spherical geometry: elevation angle from observer at radius R+h0 to point at radius R+h
    num = (R + h) * np.cos(δ) - (R + h0)
    den = (R + h) * np.sin(δ)
    elev = np.degrees(np.arctan2(num, den))
    return elev.max(axis=1), h0                     # mask (720,), site height
```
- This takes a few seconds per site. The far end (250 km) only matters near the pole. For sites outside the DEM (Chandrayaan-3, Chang'e-6, Apollo), set **mask = flat** (`-dip`, effectively 0) and flag `"terrain": false` in the output. Be upfront about this in the pitch.
- **Sanity check:** plot each mask as a line (az on x, el on y). Expect jagged profiles of 0 to 5° for ridge sites, and a large wall (10° or more) in some directions for sites in or near craters. **Polar-plot screenshot for the deck.**
- **Cross-check with Quickmap:** Quickmap's illumination layers show the percentage of time each spot is lit. Ridges like Shackleton–de Gerlache should come out at **80 to 90%** lit in our model and in theirs. If ours says 40%, the mask is probably flipped in azimuth.

✅ **Checkpoint 2 (5:15 PM):** masks for all polar sites are saved in contract A, with polar plots for each.

---

## 6. Visibility and events (`engine/visibility.py`, 5:15 to 5:45 PM)

### 6.1 Sun visible fraction (solar disk, not a point)
The solar disk has an angular radius of about **0.266°** (varies slightly with distance: `r = degrees(asin(695700 km / dist_km))`). At the pole the Sun skims the horizon, so partial-disk matters a lot.
```python
mask_at = lambda az: np.interp(az, AZ, mask, period=360)
r_sun   = np.degrees(np.arcsin(695_700 / (sun_dist_au * 1.495978707e8)))
margin  = sun_el - mask_at(sun_az)                       # degrees above local terrain horizon
sun_vis_frac = np.clip((margin + r_sun) / (2 * r_sun), 0, 1)   # linear approx of disk fraction
earth_mask_el = mask_at(earth_az)
earth_visible = (earth_el > earth_mask_el).astype(np.uint8)
```
(If you have spare time, the exact circular-segment area formula is a small upgrade. The linear version is fine to start with.)

### 6.2 Events (what the app shows as "sunset in 3d 4h")
Find transitions in `sun_vis_frac > 0.5` and `earth_visible`:
```python
def windows(flag, t0, step_min):
    d = np.diff(flag.astype(np.int8), prepend=0, append=0)
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
    return [{"start_i": int(s), "end_i": int(e), "hours": (e - s) * step_min / 60} for s, e in zip(starts, ends)]
```
Output `sun_windows` and `earth_windows` lists per site. The web app finds "next sunset after time T" by binary search over these. Hourly resolution is fine for the demo. If you have time, add **10-minute steps for just the chosen landing month** for nicer animation.

---

## 7. Horizons validation (`engine/validate.py`, 5:45 to 6:10 PM, pitch credibility)

JPL Horizons API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
```python
import requests, numpy as np

def horizons_altaz(body, lat, lon, start, stop, step="6 h"):
    params = {
        "format": "json", "COMMAND": f"'{body}'",        # '10' = Sun, '399' = Earth
        "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",                # E-LON, LAT, ALT(km): note order!
        "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'",
    }
    txt = requests.get("https://ssd.jpl.nasa.gov/api/horizons.api", params=params, timeout=60).json()["result"]
    rows = txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    # each row: date, (flags), azimuth, elevation; print a couple and adjust the split indices
    return rows
```
- Compare 3 sites × 2 bodies × one month at 6-hour steps against your Skyfield values at the same timestamps. Report **max |Δel|** and **max |Δaz|**. Expect **under 0.05°** (Horizons uses a slightly different lunar frame realisation, so differences of about 0.01° are normal).
- Print the raw `rows[:3]` first. The column layout has flag characters between the date and the numbers, so adjust the parsing once you've seen it.
- Horizons longitude for the Moon is east-positive. If your Δaz is about 180° or Δel is large, you've swapped lat and lon or flipped the sign.
- **Deck slide:** a table or small plot titled "Validated against JPL Horizons: max error 0.0X°".

✅ **Checkpoint 3 (6:10 PM):** the validation table is printed and saved to `data/validation.json`.

---

## 8. Final build and handoff (`engine/build.py`, 6:10 to 7:00 PM)

```python
from models.power import panel_power_w
from models.battery import simulate_battery
from models.comms import link_rate_bps, comms_available
from models.config import POWER_CFG, BATTERY_CFG, COMMS_CFG   # teammate provides

for site in SITES:
    g = load_geometry(site.id)                                 # contract A
    p = panel_power_w(g.sun.el, g.sun.az, g.sun_vis_frac, g.sun.dist_au, POWER_CFG)
    b = simulate_battery(p, g.step_min, BATTERY_CFG)
    up = comms_available(g.earth.el, g.earth_mask_el, COMMS_CFG)
    rate = link_rate_bps(g.earth.dist_km, COMMS_CFG) * up
    write_public(site, g, p, b, up, rate)
```
**Contract C** adds these to contract A:
```json
"power_w": [...], "soc": [...], "comms_up": [...], "rate_kbps": [...],
"sun_windows": [...], "earth_windows": [...],
"summary": {
  "pct_sunlit": 0.71, "pct_earth_visible": 0.49, "pct_both": 0.33,
  "longest_dark_h": 142.0, "battery_wh_needed": 7100, "survives_default": true,
  "mean_power_w": 210.4, "terrain": true
}
```
And `public/data/sites.json` holds a list of `{id, name, lat, lon, group, summary}` for the map and compare view.

- **File size:** 9 sites × 3 years hourly, at about 8 arrays × 26k values, is roughly 1.5 to 3 MB per site. That's fine. If it's bigger, drop to 2026–2027, or store `int16` of `angle*100` and decode in JS.
- **README section:** document every field (units, conventions). The web app step starts straight after this.

✅ **Final checkpoint (7:00 PM):**
- [ ] `public/data/*.json` exists for all sites and loads in a browser (`python -m http.server`, then open a file)
- [ ] Sanity plots and polar masks are saved to `deck_assets/`
- [ ] The validation result is saved
- [ ] Everything is committed and pushed

---

## 9. Mentor slot (2 PM to 6 PM): go at about 4:00 PM
Bring the sanity plots and ask:
1. "Is the MOON_ME frame and 240 m LOLA good enough for horizon masks, or should we include near-field higher-res terrain?"
2. "For panel height and Earth elevation margin, what values do real CLPS landers use?"
3. "Which metric would mission planners care about most at a glance?"

## 10. Risks and fallbacks
| Risk | Fallback |
|---|---|
| DEM download too slow | Moon Trek GeoTIFF; or ship mask=0 and add terrain overnight |
| rasterio install fails | numpy `fromfile` reader (5.2) |
| Projection confusion | Verify on Shackleton crater; the lat/lon ray method keeps azimuths correct regardless |
| Horizons API rate or format | Only 6 small queries are needed; cache the responses to `data/horizons_cache/` |
| Teammate models not ready at 6:10 | `build.py` uses inline placeholder formulas (P = 1000·sin(max(el,0))·vis) so the app is never blocked |

> Note from Claude: the code above follows Skyfield's documented lunar-surface API and the Horizons API spec, but I couldn't execute it in my own sandbox because it blocks JPL/NASA hosts. Expect to tweak a line or two on first run (especially the Horizons row parsing and the DEM scaling factor).

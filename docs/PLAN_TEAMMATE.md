# Data Engine Plan: EE Teammate (Power, Battery, Comms Models)

**Lunar Landing Site Navigator · NASA Space Apps 2026 · HackAthlone**
**Window:** Saturday 2:30 PM to 7:00 PM (4.5 hours)
**Your job:** turn "where is the Sun and Earth" into the numbers mission planners actually care about. How many watts does the lander get? Does the battery survive the dark? When can we talk to Earth, and how fast?

**Who does what:** Hanok computes the geometry: Sun and Earth positions per hour at each landing site, plus the real terrain horizon from LOLA elevation data. You write three small Python modules that take that geometry and produce power, battery and comms numbers. Hanok's `build.py` calls your functions and exports everything for the web app.

You never need to touch astronomy code. You work only in the `models/` folder.

---

## 0. What you receive (input) and what you deliver (output)

### Input: `data/geometry/<site_id>.json` (from Hanok, sample by about 3:40 PM)
```json
{
  "site": {"id": "haworth", "name": "...", "lat": -87.45, "lon": -5.0, "elev_m": 1234.0},
  "t0": "2026-01-01T00:00:00Z", "step_min": 60, "n": 26304,
  "sun":   {"az": [...], "el": [...], "dist_au": [...]},
  "earth": {"az": [...], "el": [...], "dist_km": [...]},
  "mask":  {"az_step_deg": 0.5, "el": [ ...720 values... ]},
  "sun_vis_frac":  [...],
  "earth_mask_el": [...],
  "earth_visible": [...]
}
```
| Field | Meaning | Units |
|---|---|---|
| `sun.el`, `earth.el` | elevation above the **flat** local horizontal (ignoring terrain) | degrees |
| `sun.az`, `earth.az` | azimuth, 0 = north, 90 = east | degrees |
| `sun_vis_frac` | fraction of the solar disk above the **terrain** horizon (0 = hidden behind a mountain or night, 1 = fully visible) | 0..1 |
| `earth_mask_el` | elevation of the terrain horizon in Earth's direction | degrees |
| `sun.dist_au` | Sun distance (for solar flux) | AU |
| `earth.dist_km` | Earth distance (for the link budget) | km |

Arrays have length `n`, one value per `step_min` minutes, starting at `t0`.

**Until the sample arrives**, generate fake data so you aren't blocked (section 1.3).

### Output: three modules plus one config (contract B, do not rename)
```python
# models/power.py
def panel_power_w(sun_el, sun_az, sun_vis_frac, sun_dist_au, cfg) -> np.ndarray   # W per step
# models/battery.py
def simulate_battery(power_w, step_min, cfg) -> dict
#   returns {"soc": np.ndarray (0..1), "survives": bool, "min_soc": float,
#            "longest_dark_h": float, "battery_wh_needed": float}
# models/comms.py
def link_rate_bps(earth_dist_km, cfg) -> np.ndarray       # max achievable data rate when Earth is in view
def comms_available(earth_el, earth_mask_el, cfg) -> np.ndarray   # 0/1 per step
# models/config.py
POWER_CFG, BATTERY_CFG, COMMS_CFG = {...}, {...}, {...}
```
All inputs are numpy arrays. Use **vectorised numpy, no Python loops** except in the battery simulation, where a loop over about 26k steps is fine.

---

## 1. Setup (2:30 to 2:50 PM)

### 1.1 Get the repo
Hanok will add you as a collaborator on GitHub. Then:
```bash
git clone <repo-url> && cd lunar-navigator
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install numpy matplotlib pytest
mkdir -p models && touch models/__init__.py
```
Work on a branch called `models`, and push often (at least at every checkpoint).

### 1.2 Files you create
```
models/
├── __init__.py
├── config.py       # all assumptions in one place, with sources in comments
├── power.py
├── battery.py
├── comms.py
├── fake_data.py    # synthetic input for testing before the real data arrives
└── test_models.py  # quick pytest sanity checks
```

### 1.3 Fake data (`models/fake_data.py`) so you can start immediately
```python
import numpy as np
def fake_polar(n=24*60, step_min=60):
    t_h = np.arange(n) * step_min / 60
    sun_el  = 1.5 * np.sin(2*np.pi*t_h/(29.53*24)) + 0.5*np.sin(2*np.pi*t_h/24/365*12)
    sun_az  = (360 * t_h / (29.53*24)) % 360          # Sun circles the horizon once a month at the pole
    vis     = np.clip((sun_el - 0.3 + 0.266) / 0.532, 0, 1)
    earth_el = 6.5 * np.sin(2*np.pi*t_h/(27.32*24))
    return dict(sun_el=sun_el, sun_az=sun_az, sun_vis_frac=vis,
                sun_dist_au=np.full(n, 1.0), earth_el=earth_el,
                earth_mask_el=np.full(n, 0.8), earth_dist_km=384_400 + 21_000*np.sin(2*np.pi*t_h/(27.55*24)))
```
**Key fact about the south pole:** the Sun is always within a few degrees of the horizon and **circles around it** every lunar day (about 29.5 Earth days). That's why panel orientation matters hugely. A flat panel is nearly useless, while a **vertical** panel is excellent.

✅ **Checkpoint 0 (2:50 PM):** the repo is cloned, the fake data runs, and contract B function names are agreed with Hanok.

---

## 2. Config (`models/config.py`, 2:50 to 3:05 PM)

Every assumption goes here, with a comment saying where it came from. Judges will ask, and "here's our assumption and why" is a strong answer.

```python
SOLAR_CONSTANT = 1361.0            # W/m² at 1 AU (NASA/NOAA TSI)

POWER_CFG = {
    "mode": "vertical_tracking",   # "horizontal" | "vertical_fixed" | "vertical_tracking"
    "area_m2": 2.0,                # array area; CLPS-class landers are ~1–4 m²
    "efficiency": 0.30,            # triple-junction GaAs space cells, BOL ~29–32%
    "derate": 0.85,                # temperature, dust, wiring, MPPT losses
    "fixed_az_deg": 0.0,           # only used for vertical_fixed: direction the panel faces
}

BATTERY_CFG = {
    "capacity_wh": 3000.0,         # nominal pack size
    "dod_max": 0.80,               # don't drain below 20% SOC (Li-ion life)
    "charge_eff": 0.95, "discharge_eff": 0.95,
    "load_day_w": 150.0,           # ops: instruments, avionics, comms
    "load_night_w": 40.0,          # survival: heaters + keep-alive electronics
    "specific_energy_wh_kg": 150.0,# space-qualified Li-ion pack level (cells ~250)
    "soc0": 1.0,
}

COMMS_CFG = {
    "band": "X",                   # "S" (2.2 GHz) or "X" (8.4 GHz)
    "freq_hz": {"S": 2.25e9, "X": 8.45e9},
    "tx_power_w": 15.0,            # lander RF output
    "tx_gain_dbi": {"S": 6.0, "X": 20.0},        # S: patch/low-gain; X: small HGA ~20 cm dish
    "tx_losses_db": 2.0,           # cables, pointing
    "rx_g_over_t_dbk": {"S": 41.0, "X": 53.0},   # DSN 34 m BWG, approx; cite DSN 810-005
    "required_ebn0_db": 2.5,       # rate-1/2 conv/LDPC coded BPSK, BER 1e-5 approx
    "margin_db": 3.0,              # standard link margin
    "min_elev_margin_deg": 1.0,    # Earth must be this far above the terrain (multipath, antenna pattern)
    "max_rate_bps": 2_000_000,     # radio's hardware cap
}
```
These are **reasonable engineering estimates, not one specific lander's specs**. Say that clearly in the presentation. Spend 10 minutes during the 2 PM to 6 PM mentor slot checking them with a mentor.

---

## 3. Power model (`models/power.py`, 3:05 to 3:50 PM)

### 3.1 Physics
Solar flux at the Moon: `S = 1361 / d_AU²` W/m². That's about 1361 ± 3%, since the Moon is about 1 AU from the Sun. There's no atmosphere, so **no air-mass loss** as there would be on Earth.

Panel power: `P = S · A · η · derate · cos(θᵢ) · vis`, where θᵢ is the angle of incidence between the Sun and the panel normal, and `vis` is `sun_vis_frac` (terrain blocking).

For a Sun at elevation `e` and azimuth `a`:
| Mode | cos(θᵢ) | When it's used |
|---|---|---|
| `horizontal` (panel facing up) | `sin(e)` | equatorial sites (Apollo); terrible at the pole (sin 2° ≈ 0.035!) |
| `vertical_fixed`, facing azimuth α | `cos(e) · cos(a − α)` (clamp ≥ 0) | simple polar lander; only works half the month |
| `vertical_tracking` (rotates to face Sun azimuth) | `cos(e)` | best for the pole (cos 2° ≈ 0.999), similar to the VIPER and Artemis approach |

### 3.2 Code
```python
import numpy as np
from .config import SOLAR_CONSTANT

def panel_power_w(sun_el, sun_az, sun_vis_frac, sun_dist_au, cfg):
    e, a = np.radians(sun_el), np.radians(sun_az)
    flux = SOLAR_CONSTANT / np.asarray(sun_dist_au) ** 2
    mode = cfg["mode"]
    if mode == "horizontal":
        cosi = np.sin(e)
    elif mode == "vertical_fixed":
        cosi = np.cos(e) * np.cos(a - np.radians(cfg["fixed_az_deg"]))
    elif mode == "vertical_tracking":
        cosi = np.cos(e)
    else:
        raise ValueError(mode)
    cosi = np.clip(cosi, 0, None)
    lit = np.asarray(sun_vis_frac)
    return flux * cfg["area_m2"] * cfg["efficiency"] * cfg["derate"] * cosi * lit
```
**Expected numbers** (2 m², 30%, 0.85 derate): about **694 W** peak with the Sun fully up. At the pole with vertical tracking, about 690 W whenever the Sun clears the terrain. At Apollo 11 with a horizontal panel, about 690 W at noon falling to 0 at sunset.

### 3.3 Extra function for the app (nice to have)
```python
def compare_modes(sun_el, sun_az, vis, dist, cfg):
    return {m: panel_power_w(sun_el, sun_az, vis, dist, {**cfg, "mode": m}).mean()
            for m in ("horizontal", "vertical_fixed", "vertical_tracking")}
```
This lets the app show something like "a horizontal panel at Haworth gets only about 3 to 5% of the energy a vertical one does". That's a great **"why the pole is weird"** moment for the pitch.

✅ **Checkpoint 1 (3:50 PM):** a plot of power over 60 days of fake data for all 3 modes, saved as `deck_assets/power_modes.png`.

---

## 4. Battery model (`models/battery.py`, 3:50 to 4:40 PM)

### 4.1 Logic (energy balance per time step)
Per step of `dt = step_min/60` hours:
- `load = load_day_w if power_w > load_day_w*0.2 else load_night_w`. Run science when the Sun is up, switch to survival mode in the dark. (Simple rule; explain it in the pitch.)
- `net = power_w − load` (W)
- When charging (`net > 0`): `E += net · dt · charge_eff`, capped at capacity
- When discharging (`net < 0`): `E −= |net| · dt / discharge_eff`
- Track `E_min`. The lander **dies** if E < (1 − dod_max) · capacity.

```python
import numpy as np

def simulate_battery(power_w, step_min, cfg):
    dt = step_min / 60.0
    cap = cfg["capacity_wh"]; floor = (1 - cfg["dod_max"]) * cap
    E = cfg["soc0"] * cap
    soc = np.empty(len(power_w))
    dead = False
    for i, p in enumerate(power_w):
        load = cfg["load_day_w"] if p > 0.2 * cfg["load_day_w"] else cfg["load_night_w"]
        net = p - load
        E = min(cap, E + net * dt * cfg["charge_eff"]) if net >= 0 else E + net * dt / cfg["discharge_eff"]
        if E < floor: dead = True
        E = max(E, 0.0)
        soc[i] = E / cap
    dark = power_w < 0.2 * cfg["load_day_w"]
    longest_dark_h = _longest_run(dark) * dt
    wh_needed = longest_dark_h * cfg["load_night_w"] / cfg["discharge_eff"] / cfg["dod_max"]
    return {"soc": soc, "survives": not dead, "min_soc": float(soc.min()),
            "longest_dark_h": float(longest_dark_h), "battery_wh_needed": float(wh_needed),
            "battery_mass_kg": float(wh_needed / cfg["specific_energy_wh_kg"])}

def _longest_run(mask):
    best = cur = 0
    for m in mask:
        cur = cur + 1 if m else 0
        best = max(best, cur)
    return best
```

### 4.2 Headline metrics (these go straight onto the app's dashboard)
- **Longest dark period (hours)**: about 354 h (14.75 days) at Apollo sites. At good polar ridges it can be **under 100 h**. This is *the* reason everyone wants the south pole rim.
- **Battery needed to survive it (Wh)** and **battery mass (kg)**. Example: 354 h × 40 W / 0.95 / 0.8 ≈ 18.6 kWh ≈ **124 kg** of battery for an equatorial night, against a few kg at a good polar ridge. **Put this in the deck.**
- `survives` with the default 3 kWh pack: a yes or no for each site and date.

### 4.3 Landing-date windows (if time allows, about 20 minutes)
Write `def mission_window_ok(power_w, step_min, cfg, start_i, days)`. It runs the battery sim starting at landing index `start_i` for a mission of `days`, and returns survives/min_soc. Hanok's `build.py` can call it for every possible landing day, which gives the app a **"good landing dates" heatmap**. This is exactly the "my launch slipped two weeks, what now?" scenario from the challenge brief.

✅ **Checkpoint 2 (4:40 PM):** an SOC plot on fake data; the Apollo-style vs. polar battery-mass comparison worked out.

---

## 5. Comms model (`models/comms.py`, 4:40 to 5:40 PM)

### 5.1 Visibility
Direct-to-Earth (DTE) is possible only when Earth is above the terrain horizon, with margin:
```python
def comms_available(earth_el, earth_mask_el, cfg):
    return (np.asarray(earth_el) > np.asarray(earth_mask_el) + cfg["min_elev_margin_deg"]).astype(np.uint8)
```
At the south pole Earth bobs up and down around the horizon over about 27.3 days (lunar libration). So comms come and go, roughly 2 weeks on and 2 weeks off, and the terrain makes it worse. At Chang'e-6 (far side) Earth is never visible, which is why a relay satellite is needed.

### 5.2 Link budget → max data rate
Free-space path loss: `FSPL(dB) = 20·log10(4π·d·f / c)`, with d in metres and f in Hz.
Received `Eb/N0 = EIRP − FSPL + G/T − k − 10·log10(R)`, where:
- `EIRP = 10·log10(P_tx) + G_tx − L_tx` (dBW)
- `k = −228.6 dBW/K/Hz` (Boltzmann)
- We need `Eb/N0 ≥ required + margin`. Solve for R:

`10·log10(R_max) = EIRP − FSPL + G/T + 228.6 − (required_ebn0 + margin)`

```python
import numpy as np
C = 299_792_458.0
def link_rate_bps(earth_dist_km, cfg):
    b = cfg["band"]; f = cfg["freq_hz"][b]
    d = np.asarray(earth_dist_km) * 1e3
    fspl = 20 * np.log10(4 * np.pi * d * f / C)
    eirp = 10 * np.log10(cfg["tx_power_w"]) + cfg["tx_gain_dbi"][b] - cfg["tx_losses_db"]
    r_db = eirp - fspl + cfg["rx_g_over_t_dbk"][b] + 228.6 - (cfg["required_ebn0_db"] + cfg["margin_db"])
    return np.minimum(10 ** (r_db / 10), cfg["max_rate_bps"])
```
**Hand-check one case (do this on paper, judges love it):** X-band at 384,400 km gives an FSPL of about 222.7 dB. EIRP = 11.8 + 20 − 2 = 29.8 dBW. Then R_dB = 29.8 − 222.7 + 53 + 228.6 − 5.5 = 83.2 dB, which is about **200 Mbps**. That gets capped by the radio at 2 Mbps, so the real limit is the hardware, not physics. With S-band and low gain it comes out at about 7 Mbps before the cap. Do the paper check and use whichever you trust, then tune the config so the numbers are plausible. **Ask a mentor** about realistic DSN G/T values.

### 5.3 Data volume metric
`data_per_lunar_day_GB = sum(rate · comms_up · dt_s) / 8e9`. This is a nice single number for the compare view.

✅ **Checkpoint 3 (5:40 PM):** comms on/off timeline and data rate plot on Hanok's real Haworth sample, with the hand-check written in `models/README.md`.

---

## 6. Tests and integration (5:40 to 7:00 PM)

### 6.1 `models/test_models.py` (15 minutes, catches silly bugs)
```python
import numpy as np
from models.power import panel_power_w
from models.config import POWER_CFG
def test_sun_overhead_horizontal():
    p = panel_power_w(np.array([90.]), np.array([0.]), np.array([1.]), np.array([1.]), {**POWER_CFG, "mode": "horizontal"})
    assert abs(p[0] - 1361*2*0.30*0.85) < 1
def test_night_zero():
    p = panel_power_w(np.array([-5.]), np.array([0.]), np.array([0.]), np.array([1.]), POWER_CFG)
    assert p[0] == 0
```
Add similar tests: the battery never goes above 1.0 SOC, and comms is 0 when Earth is below the mask. Run `pytest models -q`.

### 6.2 Run on Hanok's real files
```python
import json, numpy as np
g = json.load(open("data/geometry/haworth.json"))
p = panel_power_w(np.array(g["sun"]["el"]), np.array(g["sun"]["az"]),
                  np.array(g["sun_vis_frac"]), np.array(g["sun"]["dist_au"]), POWER_CFG)
```
Check the numbers make sense for at least Haworth and Apollo 11. Then merge your branch into `main` (or open a PR) by **6:30 PM** so Hanok's `build.py` can call you.

### 6.3 Deck assets (6:30 to 7:00 PM)
Save to `deck_assets/`:
1. `power_modes.png`: horizontal vs vertical panels at the pole (the "why it's weird" chart)
2. `battery_mass.png`: battery mass needed by site (bar chart, Apollo vs polar sites)
3. `comms_timeline.png`: Earth-visible windows over 2 months at Haworth vs Apollo 11 vs Chang'e-6
4. `assumptions.md`: a table of every config value and where it came from. This becomes a backup slide.

✅ **Final checkpoint (7:00 PM):**
- [ ] `models/` merged, tests pass
- [ ] Functions match contract B exactly
- [ ] Config values have a comment saying where each came from
- [ ] 3 charts and the assumptions table are in `deck_assets/`

---

## 7. Mentor questions (2 PM to 6 PM slot)
1. "Is 30% cell efficiency and 0.85 derate realistic for a CLPS lander? What survival heater power is typical?"
2. "What G/T should we assume for a DSN 34 m dish at X-band, and what Eb/N0 for a typical coded link?"
3. "Is a 1° Earth elevation margin above the terrain reasonable for a lander antenna?"

## 8. If you finish early
- **Thermal estimate:** the lunar surface goes from about +120 °C in the equatorial day to about −170 °C at night, and polar permanently shadowed regions sit below −230 °C. A simple "hours below −X °C" metric from darkness duration would be a nice extra.
- **Dust and degradation:** a cell degradation factor of about 1% per month of mission.
- Help Hanok with the web app's charts (step 2 starts at 7 PM).

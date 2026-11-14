# Interface contracts

These connect the engine (Hanok), the models (teammate) and the web app. **Don't change a field name without telling the other person.**

Conventions everywhere:
- Angles are in **degrees**. Azimuth: 0 = north, 90 = east, clockwise.
- Coordinates are planetocentric latitude, with **east** longitude in −180..180.
- Time index `i` corresponds to `t0 + i * step_min` minutes (UTC).
- Arrays all have length `n`.

## Contract A: `data/geometry/<site_id>.json` (engine → models)
| Field | Type | Meaning |
|---|---|---|
| `site` | object | `{id, name, lat, lon, group, elev_m, terrain}` |
| `t0` | string | ISO-8601 UTC start, e.g. `2026-01-01T00:00:00Z` |
| `step_min` | int | minutes between samples |
| `n` | int | number of samples |
| `sun.az`, `sun.el` | float[n] | Sun azimuth and elevation above the smooth local horizontal |
| `sun.dist_au` | float[n] | Sun distance, AU |
| `earth.az`, `earth.el` | float[n] | Earth azimuth and elevation |
| `earth.dist_km` | float[n] | Earth distance, km |
| `mask.az_step_deg` | float | 0.5 |
| `mask.el` | float[720] | terrain horizon elevation at az = 0, 0.5, … 359.5 |
| `sun_vis_frac` | float[n] | 0..1, fraction of the solar disk above the terrain |
| `earth_mask_el` | float[n] | terrain horizon elevation in Earth's direction |
| `earth_visible` | int[n] | 1 if Earth's centre is above the terrain |

## Contract B: Python functions (models → engine)
```python
models.power.panel_power_w(sun_el, sun_az, sun_vis_frac, sun_dist_au, cfg) -> np.ndarray  # W
models.battery.simulate_battery(power_w, step_min, cfg) -> dict
    # {"soc", "survives", "min_soc", "longest_dark_h", "battery_wh_needed", "battery_mass_kg"}
models.comms.link_rate_bps(earth_dist_km, cfg) -> np.ndarray
models.comms.comms_available(earth_el, earth_mask_el, cfg) -> np.ndarray  # 0/1
models.config.POWER_CFG, BATTERY_CFG, COMMS_CFG
```

## Contract C: `public/data/<site_id>.json` (engine → web app)
Contract A, plus:
| Field | Type | Meaning |
|---|---|---|
| `power_w` | float[n] | panel output, W |
| `soc` | float[n] | battery state of charge, 0..1 |
| `comms_up` | int[n] | DTE link available |
| `rate_kbps` | float[n] | achievable data rate (0 when down) |
| `sun_windows` | list | `{start_i, end_i, hours}` sunlit periods |
| `earth_windows` | list | `{start_i, end_i, hours}` Earth-visible periods |
| `summary` | object | `pct_sunlit, pct_earth_visible, pct_both, longest_dark_h, battery_wh_needed, battery_mass_kg, survives_default, mean_power_w, terrain` |

`public/data/sites.json` is a list of `{id, name, lat, lon, group, summary}`.

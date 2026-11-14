"""Synthetic polar-like geometry so the models (and the web app) can be built before real data exists.
python -m models.fake_data   -> writes data/geometry/fake_polar.json and fake_equator.json (contract A)"""
import json, os
import numpy as np


def fake_site(kind="polar", days=90, step_min=60):
    n = int(days * 24 * 60 / step_min)
    t_h = np.arange(n) * step_min / 60
    phase = 2 * np.pi * t_h / (29.53 * 24)
    if kind == "polar":
        sun_el = 1.5 * np.sin(phase) + 0.5
        earth_el = 6.5 * np.sin(2 * np.pi * t_h / (27.32 * 24))
        mask = 1.0 + 1.5 * np.sin(np.radians(np.arange(0, 360, 0.5)) * 3) ** 2
    else:
        sun_el = 90 * np.sin(phase)
        earth_el = np.full(n, 65.0) + 5 * np.sin(2 * np.pi * t_h / (27.32 * 24))
        mask = np.zeros(720)
    sun_az = (np.degrees(phase) + 90) % 360
    earth_az = np.full(n, 0.0) if kind == "polar" else np.full(n, 270.0)
    m_sun = np.interp(sun_az, np.arange(0, 360, 0.5), mask, period=360)
    m_earth = np.interp(earth_az, np.arange(0, 360, 0.5), mask, period=360)
    vis = np.clip((sun_el - m_sun + 0.266) / 0.532, 0, 1)
    return {
        "site": {"id": f"fake_{kind}", "name": f"Fake {kind} site", "lat": -87.0 if kind == "polar" else 0.0,
                 "lon": 0.0, "group": "Test", "elev_m": 0.0, "terrain": kind == "polar"},
        "t0": "2026-01-01T00:00:00Z", "step_min": step_min, "n": n,
        "sun": {"az": sun_az.round(3).tolist(), "el": sun_el.round(3).tolist(), "dist_au": [1.0] * n},
        "earth": {"az": earth_az.tolist(), "el": earth_el.round(3).tolist(),
                  "dist_km": (384_400 + 21_000 * np.sin(2 * np.pi * t_h / (27.55 * 24))).round(0).tolist()},
        "mask": {"az_step_deg": 0.5, "el": mask.round(3).tolist()},
        "sun_vis_frac": vis.round(3).tolist(),
        "earth_mask_el": m_earth.round(3).tolist(),
        "earth_visible": (earth_el > m_earth).astype(int).tolist(),
    }


if __name__ == "__main__":
    os.makedirs("data/geometry", exist_ok=True)
    for k in ("polar", "equator"):
        json.dump(fake_site(k), open(f"data/geometry/fake_{k}.json", "w"))
        print(f"wrote data/geometry/fake_{k}.json")

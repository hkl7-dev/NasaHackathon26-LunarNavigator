"""Merge geometry (contract A) with EE models (contract B) into web-app data (contract C).
Usage: python -m engine.build"""
import glob, os
import numpy as np
from .io import _r, read_json, write_json
from .visibility import windows
from models.power import panel_power_w
from models.battery import simulate_battery
from models.comms import link_rate_bps, comms_available
from models.config import POWER_CFG, BATTERY_CFG, COMMS_CFG


def build_site(g):
    A = lambda x: np.asarray(x, dtype=float)
    sun, earth = g["sun"], g["earth"]
    # Equatorial sites get horizontal panels, polar sites vertical tracking
    pcfg = {**POWER_CFG, "mode": "vertical_tracking" if abs(g["site"]["lat"]) > 60 else "horizontal"}
    p = panel_power_w(A(sun["el"]), A(sun["az"]), A(g["sun_vis_frac"]), A(sun["dist_au"]), pcfg)
    b = simulate_battery(p, g["step_min"], BATTERY_CFG)
    up = comms_available(A(earth["el"]), A(g["earth_mask_el"]), COMMS_CFG)
    rate = link_rate_bps(A(earth["dist_km"]), COMMS_CFG) * up
    sunlit = A(g["sun_vis_frac"]) > 0.5
    ev = np.asarray(g["earth_visible"]).astype(bool)
    g.update({
        "panel_mode": pcfg["mode"],
        "power_w": _r(p, 1), "soc": _r(b["soc"], 3),
        "comms_up": up.tolist(), "rate_kbps": _r(rate / 1e3, 1),
        "sun_windows": windows(sunlit, g["step_min"]),
        "earth_windows": windows(ev, g["step_min"]),
        "summary": {
            "pct_sunlit": round(float(sunlit.mean()), 3),
            "pct_earth_visible": round(float(ev.mean()), 3),
            "pct_both": round(float((sunlit & ev).mean()), 3),
            "longest_dark_h": round(b["longest_dark_h"], 1),
            "battery_wh_needed": round(b["battery_wh_needed"], 0),
            "battery_mass_kg": round(b["battery_mass_kg"], 1),
            "survives_default": b["survives"],
            "mean_power_w": round(float(p.mean()), 1),
            "terrain": g["site"].get("terrain", False),
        },
    })
    return g


def main():
    index = []
    for path in sorted(glob.glob("data/geometry/*.json")):
        g = build_site(read_json(path))
        sid = g["site"]["id"]
        write_json(f"public/data/{sid}.json", g)
        index.append({k: g["site"][k] for k in ("id", "name", "lat", "lon", "group")} | {"summary": g["summary"]})
        print(sid, g["summary"])
    write_json("public/data/sites.json", index)
    print(f"wrote {len(index)} sites to public/data/")


if __name__ == "__main__":
    main()

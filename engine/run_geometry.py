"""Produce contract-A geometry files for every site.
Usage: python -m engine.run_geometry [--no-terrain] [--years 3] [--step 60] [--site haworth]"""
import argparse, os
import numpy as np
from .sites import SITES, BY_ID
from .ephemeris import time_grid, site_ephemeris
from .horizon import flat_mask, horizon_mask, plot_mask
from .visibility import sun_visible_fraction, earth_visibility
from .io import _r, write_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-terrain", action="store_true")
    ap.add_argument("--years", type=float, default=3.0)
    ap.add_argument("--step", type=int, default=60)
    ap.add_argument("--site", default=None)
    a = ap.parse_args()

    dem = None
    if not a.no_terrain:
        from .horizon import DEM
        dem = DEM()

    t, n, t0 = time_grid(years=a.years, step_min=a.step)
    sites = [BY_ID[a.site]] if a.site else SITES
    os.makedirs("deck_assets", exist_ok=True)
    for s in sites:
        terrain = dem is not None and dem.covers(s.lat)
        if terrain:
            mask, elev = horizon_mask(dem, s.lat, s.lon)
            plot_mask(mask, f"Horizon: {s.name}", f"deck_assets/mask_{s.id}.png")
        else:
            mask, elev = flat_mask(), 0.0
        e = site_ephemeris(s.lat, s.lon, elev + 2.0, t)
        vis = sun_visible_fraction(e["sun"]["el"], e["sun"]["az"], e["sun"]["dist_au"], mask)
        emask, evis = earth_visibility(e["earth"]["el"], e["earth"]["az"], mask)
        out = {
            "site": {**s.to_dict(), "elev_m": round(elev, 1), "terrain": bool(terrain)},
            "t0": t0, "step_min": a.step, "n": n,
            "sun": {"az": _r(e["sun"]["az"]), "el": _r(e["sun"]["el"]), "dist_au": _r(e["sun"]["dist_au"], 6)},
            "earth": {"az": _r(e["earth"]["az"]), "el": _r(e["earth"]["el"]), "dist_km": _r(e["earth"]["dist_km"], 0)},
            "mask": {"az_step_deg": 0.5, "el": _r(mask)},
            "sun_vis_frac": _r(vis),
            "earth_mask_el": _r(emask),
            "earth_visible": evis.tolist(),
        }
        write_json(f"data/geometry/{s.id}.json", out)
        print(f"{s.id:18s} terrain={terrain!s:5s} sunlit={np.mean(vis > 0.5):.0%} earth={evis.mean():.0%}")


if __name__ == "__main__":
    main()

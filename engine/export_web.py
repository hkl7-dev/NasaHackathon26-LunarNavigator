"""Export the two files that let the web app analyse ANY point near the south pole in the browser:
  public/data/vectors.json        Sun & Earth position vectors in the Moon ME frame, hourly (same grid as the sites)
  public/data/dem_south_960m.bin  LOLA terrain, block-averaged 240 m -> 960 m, little-endian int16 metres
  public/data/dem_south_960m.json metadata for the .bin
Usage: python -m engine.export_web            (needs the JPL kernels + dem/LDEM_75S_240M.*)"""
import argparse, json, os
import numpy as np
from .io import write_json

R = 1737400.0


def export_vectors(years=3.0, step_min=60):
    from .ephemeris import time_grid, MOON, SUN, EARTH, FRAME
    t, n, t0 = time_grid(years=years, step_min=step_min)
    out = {"t0": t0, "step_min": step_min, "n": n, "frame": "MOON_ME_DE421",
           "sun_units_km": 1000, "earth_units_km": 1}
    for name, body, unit in (("sun", SUN, 1000.0), ("earth", EARTH, 1.0)):
        xs, ys, zs = [], [], []
        for s in range(0, n, 8760):
            tc = t[s:s + 8760]
            x, y, z = MOON.at(tc).observe(body).apparent().frame_xyz(FRAME).km
            xs.append(x); ys.append(y); zs.append(z)
        x, y, z = (np.concatenate(a) / unit for a in (xs, ys, zs))
        out[name] = {"x": np.round(x).astype(int).tolist(), "y": np.round(y).astype(int).tolist(),
                     "z": np.round(z).astype(int).tolist()}
    write_json("public/data/vectors.json", out)
    print(f"wrote public/data/vectors.json ({n} steps)")


def export_dem(factor=4):
    from .horizon import DEM
    dem = DEM()
    h = dem.h
    n = (h.shape[0] // factor) * factor
    small = h[:n, :n].reshape(n // factor, factor, n // factor, factor).mean(axis=(1, 3))
    os.makedirs("public/data", exist_ok=True)
    small.round().astype("<i2").tofile("public/data/dem_south_960m.bin")
    t = dem._inv  # inverse affine; we want the forward one for metadata
    fwd = ~t
    meta = {"size": int(small.shape[0]), "pixel_m": float(fwd.a * factor), "x0": float(fwd.c), "y0": float(fwd.f),
            "R": R, "units": "metres above 1737.4 km sphere", "projection": "south polar stereographic, lon 0 up"}
    with open("public/data/dem_south_960m.json", "w") as f:
        json.dump(meta, f, indent=1)
    print("wrote public/data/dem_south_960m.bin", small.shape, meta)
    # full-resolution 240 m core around the pole (about 85S to the pole) for accurate near-field terrain
    c, half = h.shape[0] // 2, 640
    core = h[c - half:c + half, c - half:c + half]
    core.round().astype("<i2").tofile("public/data/dem_south_240m_core.bin")
    cmeta = {"size": int(core.shape[0]), "pixel_m": float(fwd.a), "x0": float(fwd.c + (c - half) * fwd.a),
             "y0": float(fwd.f + (c - half) * fwd.e), "R": R}
    with open("public/data/dem_south_240m_core.json", "w") as f:
        json.dump(cmeta, f, indent=1)
    print("wrote public/data/dem_south_240m_core.bin", core.shape, cmeta)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["vectors", "dem"])
    a = ap.parse_args()
    if a.only != "dem":
        export_vectors()
    if a.only != "vectors":
        export_dem()

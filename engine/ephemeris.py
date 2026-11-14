"""Sun and Earth azimuth/elevation/distance as seen from a point on the lunar surface.
Uses Skyfield + JPL DE421 + the NAIF Moon Mean-Earth (ME) frame, the same frame LOLA maps use."""
import os
import numpy as np
from skyfield.api import Loader, PlanetaryConstants

KDIR = os.path.join(os.path.dirname(__file__), "kernels")
_load = Loader(KDIR)

ts = _load.timescale()
eph = _load("de421.bsp")  # valid 1900-2050
pc = PlanetaryConstants()
pc.read_text(_load("moon_080317.tf"))
pc.read_text(_load("pck00008.tpc"))
pc.read_binary(_load("moon_pa_de421_1900-2050.bpc"))
FRAME = pc.build_frame_named("MOON_ME_DE421")

MOON, SUN, EARTH = eph["moon"], eph["sun"], eph["earth"]


def time_grid(start=(2026, 1, 1), years=3.0, step_min=60):
    """Return (skyfield Time array, n, iso start string)."""
    n = int(years * 365.25 * 24 * 60 / step_min)
    minutes = np.arange(n) * step_min
    t = ts.utc(start[0], start[1], start[2], 0, minutes)
    return t, n, f"{start[0]:04d}-{start[1]:02d}-{start[2]:02d}T00:00:00Z"


def site_ephemeris(lat, lon, elev_m, t, chunk=8760):
    """Sun & Earth az/el (deg) and distance for every time in t. Chunked to keep memory low."""
    place = MOON + pc.build_latlon_degrees(FRAME, lat, lon, elev_m)
    out = {"sun": {k: [] for k in ("az", "el", "dist_au", "dist_km")},
           "earth": {k: [] for k in ("az", "el", "dist_au", "dist_km")}}
    for s in range(0, len(t), chunk):
        tc = t[s:s + chunk]
        obs = place.at(tc)
        for name, body in (("sun", SUN), ("earth", EARTH)):
            alt, az, dist = obs.observe(body).apparent().altaz()
            out[name]["az"].append(az.degrees)
            out[name]["el"].append(alt.degrees)
            out[name]["dist_au"].append(dist.au)
            out[name]["dist_km"].append(dist.km)
    return {b: {k: np.concatenate(v) for k, v in d.items()} for b, d in out.items()}


if __name__ == "__main__":
    # Sanity check: plot 60 days of Sun & Earth elevation for Apollo 11 and Haworth
    import matplotlib.pyplot as plt
    from .sites import BY_ID
    t, n, _ = time_grid(years=60 / 365.25)
    fig, axes = plt.subplots(2, 1, figsize=(10, 6), sharex=True)
    for ax, sid in zip(axes, ("apollo11", "haworth")):
        s = BY_ID[sid]
        e = site_ephemeris(s.lat, s.lon, 0.0, t)
        days = np.arange(n) / 24
        ax.plot(days, e["sun"]["el"], label="Sun el")
        ax.plot(days, e["earth"]["el"], label="Earth el")
        ax.axhline(0, color="k", lw=0.5)
        ax.set_title(s.name); ax.set_ylabel("deg"); ax.legend()
    axes[-1].set_xlabel("days from 2026-01-01")
    plt.tight_layout()
    os.makedirs("deck_assets", exist_ok=True)
    plt.savefig("deck_assets/sanity_elevations.png", dpi=150)
    print("saved deck_assets/sanity_elevations.png")

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

def compare_modes(sun_el, sun_az, vis, dist, cfg):
    return {m: panel_power_w(sun_el, sun_az, vis, dist, {**cfg, "mode": m}).mean()
            for m in ("horizontal", "vertical_fixed", "vertical_tracking")}
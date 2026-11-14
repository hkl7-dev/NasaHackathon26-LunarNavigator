"""Solar array power from Sun geometry. P = S * A * eta * derate * cos(incidence) * visible_fraction."""
import numpy as np
from .config import SOLAR_CONSTANT


def _cos_incidence(sun_el, sun_az, cfg):
    e, a = np.radians(sun_el), np.radians(sun_az)
    mode = cfg["mode"]
    if mode == "horizontal":            # panel facing straight up
        c = np.sin(e)
    elif mode == "vertical_fixed":      # vertical panel facing fixed_az_deg
        c = np.cos(e) * np.cos(a - np.radians(cfg["fixed_az_deg"]))
    elif mode == "vertical_tracking":   # vertical panel rotating to face the Sun's azimuth
        c = np.cos(e)
    else:
        raise ValueError(f"unknown panel mode {mode!r}")
    return np.clip(c, 0.0, None)


def panel_power_w(sun_el, sun_az, sun_vis_frac, sun_dist_au, cfg):
    sun_el, sun_az = np.asarray(sun_el, float), np.asarray(sun_az, float)
    flux = SOLAR_CONSTANT / np.asarray(sun_dist_au, float) ** 2
    vis = np.asarray(sun_vis_frac, float)
    return flux * cfg["area_m2"] * cfg["efficiency"] * cfg["derate"] * _cos_incidence(sun_el, sun_az, cfg) * vis


def compare_modes(sun_el, sun_az, sun_vis_frac, sun_dist_au, cfg):
    """Mean power for each panel mode; great for the 'why the pole is weird' chart."""
    return {m: float(panel_power_w(sun_el, sun_az, sun_vis_frac, sun_dist_au, {**cfg, "mode": m}).mean())
            for m in ("horizontal", "vertical_fixed", "vertical_tracking")}

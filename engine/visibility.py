"""Combine ephemeris with terrain mask: solar-disk visibility, Earth visibility, windows."""
import numpy as np
from .horizon import AZ

SUN_RADIUS_KM = 695_700.0
AU_KM = 1.495978707e8


def mask_at(mask, az):
    return np.interp(np.asarray(az) % 360, AZ, mask, period=360)


def sun_visible_fraction(sun_el, sun_az, sun_dist_au, mask):
    r = np.degrees(np.arcsin(SUN_RADIUS_KM / (np.asarray(sun_dist_au) * AU_KM)))  # ~0.266 deg
    margin = np.asarray(sun_el) - mask_at(mask, sun_az)
    return np.clip((margin + r) / (2 * r), 0.0, 1.0)  # linear approx of visible disk fraction


def earth_visibility(earth_el, earth_az, mask):
    m = mask_at(mask, earth_az)
    return m, (np.asarray(earth_el) > m).astype(np.uint8)


def windows(flag, step_min):
    """Contiguous runs where flag is true -> [{start_i, end_i, hours}] (end exclusive)."""
    f = np.asarray(flag).astype(np.int8)
    d = np.diff(f, prepend=0, append=0)
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
    return [{"start_i": int(s), "end_i": int(e), "hours": round((e - s) * step_min / 60, 2)}
            for s, e in zip(starts, ends)]

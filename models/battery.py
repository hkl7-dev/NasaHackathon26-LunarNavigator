import numpy as np

def simulate_battery(power_w, step_min, cfg):
    power_w = np.asarray(power_w, dtype=float)
    dt = step_min / 60.0
    cap = cfg["capacity_wh"]; floor = (1 - cfg["dod_max"]) * cap
    E = cfg["soc0"] * cap
    soc = np.empty(len(power_w))
    dead = False
    for i, p in enumerate(power_w):
        load = cfg["load_day_w"] if p > 0.2 * cfg["load_day_w"] else cfg["load_night_w"]
        net = p - load
        if net >= 0:
            E = min(cap, E + net * dt * cfg["charge_eff"])
        else:
            E = E + net * dt / cfg["discharge_eff"]
        if E < floor: dead = True
        E = max(E, 0.0)
        soc[i] = E / cap
    dark = power_w < 0.2 * cfg["load_day_w"]
    longest_dark_h = _longest_run(dark) * dt
    wh_needed = longest_dark_h * cfg["load_night_w"] / cfg["discharge_eff"] / cfg["dod_max"]
    return {"soc": soc, "survives": not dead, "min_soc": float(soc.min()),
            "longest_dark_h": float(longest_dark_h),
            "battery_wh_needed": float(wh_needed),
            "battery_mass_kg": float(wh_needed / cfg["specific_energy_wh_kg"])}

def _longest_run(mask):
    best = cur = 0
    for m in mask:
        cur = cur + 1 if m else 0
        best = max(best, cur)
    return best

def mission_window_ok(power_w, step_min, cfg, start_i, days):
    n = int(days * 24 * 60 / step_min)
    seg = np.asarray(power_w)[start_i:start_i + n]
    if len(seg) < n:
        return {"survives": None, "min_soc": None}   # mission runs past the data
    r = simulate_battery(seg, step_min, cfg)
    return {"survives": r["survives"], "min_soc": r["min_soc"]}
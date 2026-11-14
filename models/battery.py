"""Battery energy balance: does the lander survive the dark, and how big a battery would it need?"""
import numpy as np


def _longest_run(mask):
    best = cur = 0
    for m in mask:
        cur = cur + 1 if m else 0
        if cur > best:
            best = cur
    return best


def simulate_battery(power_w, step_min, cfg, start_i=0, n_steps=None):
    p_all = np.asarray(power_w, float)
    p = p_all[start_i:] if n_steps is None else p_all[start_i:start_i + n_steps]
    dt = step_min / 60.0
    cap = cfg["capacity_wh"]
    floor = (1 - cfg["dod_max"]) * cap
    day_thresh = 0.2 * cfg["load_day_w"]
    E = cfg["soc0"] * cap
    soc = np.empty(len(p))
    dead = False
    for i, pw in enumerate(p):
        load = cfg["load_day_w"] if pw > day_thresh else cfg["load_night_w"]
        net = pw - load
        if net >= 0:
            E = min(cap, E + net * dt * cfg["charge_eff"])
        else:
            E = E + net * dt / cfg["discharge_eff"]
        if E < floor:
            dead = True
        E = max(E, 0.0)
        soc[i] = E / cap
    longest_dark_h = _longest_run(p < day_thresh) * dt
    wh_needed = longest_dark_h * cfg["load_night_w"] / cfg["discharge_eff"] / cfg["dod_max"]
    return {
        "soc": soc,
        "survives": not dead,
        "min_soc": float(soc.min()) if len(soc) else 1.0,
        "longest_dark_h": float(longest_dark_h),
        "battery_wh_needed": float(wh_needed),
        "battery_mass_kg": float(wh_needed / cfg["specific_energy_wh_kg"]),
    }


def landing_date_scan(power_w, step_min, cfg, mission_days=14, every_h=24):
    """Survival for each possible landing time: powers the 'good landing dates' heatmap."""
    steps = int(mission_days * 24 * 60 / step_min)
    stride = max(1, int(every_h * 60 / step_min))
    out = []
    for s in range(0, len(power_w) - steps, stride):
        r = simulate_battery(power_w, step_min, cfg, start_i=s, n_steps=steps)
        out.append({"start_i": s, "survives": r["survives"], "min_soc": round(r["min_soc"], 3)})
    return out

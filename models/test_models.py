import numpy as np
from models.config import POWER_CFG, BATTERY_CFG, COMMS_CFG
from models.power import panel_power_w, compare_modes
from models.battery import simulate_battery
from models.comms import link_rate_bps, comms_available, fspl_db
from models.fake_data import fake_site

PEAK = 1361 * POWER_CFG["area_m2"] * POWER_CFG["efficiency"] * POWER_CFG["derate"]


def test_sun_overhead_horizontal():
    p = panel_power_w([90.0], [0.0], [1.0], [1.0], {**POWER_CFG, "mode": "horizontal"})
    assert abs(p[0] - PEAK) < 1e-6


def test_night_is_zero():
    assert panel_power_w([-5.0], [0.0], [0.0], [1.0], POWER_CFG)[0] == 0


def test_vertical_beats_horizontal_at_pole():
    g = fake_site("polar")
    m = compare_modes(g["sun"]["el"], g["sun"]["az"], g["sun_vis_frac"], g["sun"]["dist_au"], POWER_CFG)
    assert m["vertical_tracking"] > 10 * m["horizontal"]


def test_battery_soc_bounds():
    p = np.r_[np.full(100, 600.0), np.zeros(100)]
    r = simulate_battery(p, 60, BATTERY_CFG)
    assert r["soc"].max() <= 1.0 and r["soc"].min() >= 0.0
    assert abs(r["longest_dark_h"] - 100) < 1e-9


def test_equatorial_night_kills_small_battery():
    p = np.r_[np.full(354, 600.0), np.zeros(354)]
    assert simulate_battery(p, 60, BATTERY_CFG)["survives"] is False


def test_fspl_x_band_moon():
    assert abs(fspl_db(384_400, 8.45e9) - 222.7) < 0.1


def test_link_rate_capped():
    assert link_rate_bps([384_400], COMMS_CFG)[0] == COMMS_CFG["max_rate_bps"]


def test_comms_blocked_by_terrain():
    up = comms_available([2.0, 0.5], [1.5, 1.5], COMMS_CFG)
    assert up.tolist() == [0, 0]
    assert comms_available([3.0], [1.5], COMMS_CFG)[0] == 1

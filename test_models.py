import numpy as np
from models.power import panel_power_w
from models.battery import simulate_battery
from models.comms import comms_available, link_rate_bps
from models.config import POWER_CFG, BATTERY_CFG, COMMS_CFG

def test_sun_overhead_horizontal():
    p = panel_power_w(np.array([90.]), np.array([0.]), np.array([1.]), np.array([1.]),
                      {**POWER_CFG, "mode": "horizontal"})
    assert abs(p[0] - 1361*2*0.30*0.85) < 1

def test_night_zero():
    p = panel_power_w(np.array([-5.]), np.array([0.]), np.array([0.]), np.array([1.]), POWER_CFG)
    assert p[0] == 0

def test_soc_bounded():
    r = simulate_battery(np.full(500, 1000.0), 60, BATTERY_CFG)
    assert r["soc"].max() <= 1.0 + 1e-9 and r["soc"].min() >= 0

def test_comms_zero_below_mask():
    up = comms_available(np.array([0.5]), np.array([2.0]), COMMS_CFG)
    assert up[0] == 0

def test_link_rate_capped():
    r = link_rate_bps(np.array([384_400.]), COMMS_CFG)
    assert r[0] == COMMS_CFG["max_rate_bps"]
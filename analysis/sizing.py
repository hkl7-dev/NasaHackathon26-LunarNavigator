
"""
Minimum battery sizing per lunar landing site.
Run from project root:
python -m analysis.sizing
"""

import glob
import json
import os

import numpy as np
import matplotlib.pyplot as plt

from engine.io import read_json
from models.power import panel_power_w
from models.battery import simulate_battery
from models.config import POWER_CFG, BATTERY_CFG


# --------------------------------------------------
# 1. CALCULATE SOLAR POWER
# --------------------------------------------------

def calculate_power(g, area):
    A = lambda x: np.asarray(x, dtype=float)

    # Tracking panels at polar sites; horizontal elsewhere
    mode = (
        "vertical_tracking"
        if abs(g["site"]["lat"]) > 60
        else "horizontal"
    )

    cfg = {
        **POWER_CFG,
        "mode": mode,
        "area_m2": area
    }

    return panel_power_w(
        A(g["sun"]["el"]),
        A(g["sun"]["az"]),
        A(g["sun_vis_frac"]),
        A(g["sun"]["dist_au"]),
        cfg
    )


# --------------------------------------------------
# 2. FIND MINIMUM BATTERY CAPACITY
# --------------------------------------------------

def min_battery_wh(power, step):
    low = 100.0
    high = 200_000.0

    # Check whether even the maximum battery can survive
    if not simulate_battery(
        power, step,
        {**BATTERY_CFG, "capacity_wh": high}
    )["survives"]:
        return None

    # Binary search for minimum working capacity
    for _ in range(25):
        mid = (low + high) / 2

        result = simulate_battery(
            power,
            step,
            {**BATTERY_CFG, "capacity_wh": mid}
        )

        if result["survives"]:
            high = mid
        else:
            low = mid

    return high


# --------------------------------------------------
# 3. PROCESS EVERY LANDING SITE
# --------------------------------------------------

os.makedirs("public/data/extra", exist_ok=True)
os.makedirs("deck_assets", exist_ok=True)

files = sorted(glob.glob("data/geometry/*.json"))

if not files:
    raise FileNotFoundError(
        "No geometry JSON files found in data/geometry/"
    )

results = []

for path in files:
    g = read_json(path)

    site_id = g["site"]["id"]
    site_name = g["site"]["name"]

    print(f"\nCalculating: {site_name}")

    power = calculate_power(
        g,
        POWER_CFG["area_m2"]
    )

    capacity = min_battery_wh(
        power,
        g["step_min"]
    )

    if capacity is None:
        mass = None
        print("Cannot survive with the maximum tested battery.")
    else:
        mass = capacity / BATTERY_CFG["specific_energy_wh_kg"]

        print(f"Minimum battery: {capacity:.2f} Wh")
        print(f"Estimated battery mass: {mass:.2f} kg")

    results.append({
        "site": site_id,
        "name": site_name,
        "min_battery_wh": capacity,
        "battery_kg": mass
    })


# --------------------------------------------------
# 4. SAVE RESULTS AS JSON
# --------------------------------------------------

with open("public/data/extra/sizing.json", "w") as f:
    json.dump(results, f, indent=2)

print("\nBattery sizing results saved.")


# --------------------------------------------------
# 5. CREATE BATTERY MASS CHART
# --------------------------------------------------

plt.style.use("dark_background")

# Sort sites by battery mass; impossible sites go last
sorted_results = sorted(
    results,
    key=lambda x: (
        x["battery_kg"] is None,
        x["battery_kg"] if x["battery_kg"] is not None else 0
    )
)

names = [x["name"] for x in sorted_results]
masses = [
    x["battery_kg"] if x["battery_kg"] is not None else 0
    for x in sorted_results
]

fig, ax = plt.subplots(figsize=(12, 6))

bars = ax.bar(names, masses)

ax.set_title("Minimum Battery Mass by Lunar Landing Site")
ax.set_ylabel("Battery mass (kg)")
ax.set_xlabel("Landing site")
ax.grid(axis="y", alpha=0.2)

plt.xticks(rotation=35, ha="right")

for bar, result in zip(bars, sorted_results):
    if result["battery_kg"] is None:
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            0,
            "No solution",
            ha="center",
            va="bottom"
        )
    else:
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            f'{result["battery_kg"]:.1f} kg',
            ha="center",
            va="bottom"
        )

plt.tight_layout()
plt.savefig(
    "deck_assets/battery_by_site.png",
    dpi=200
)

plt.show()

print("\nChart saved: deck_assets/battery_by_site.png")

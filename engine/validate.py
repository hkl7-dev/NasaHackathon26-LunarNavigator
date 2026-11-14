"""Cross-check Skyfield against JPL Horizons. Writes data/validation.json.
Usage: python -m engine.validate"""
import json, os, re
import numpy as np
import requests
from .sites import BY_ID
from .ephemeris import ts, site_ephemeris

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE = "data/horizons_cache"
NUM = re.compile(r"-?\d+\.\d+")


def horizons_altaz(body, lat, lon, start, stop, step="6 h"):
    os.makedirs(CACHE, exist_ok=True)
    key = f"{CACHE}/{body}_{lat}_{lon}_{start}_{stop}_{step}.txt".replace(" ", "_").replace(":", "")
    if os.path.exists(key):
        txt = open(key).read()
    else:
        params = {
            "format": "json", "COMMAND": f"'{body}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
            "SITE_COORD": f"'{lon},{lat},0'",   # E-LON, LAT, ALT(km)
            "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
            "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'",
            "TIME_DIGITS": "'MINUTES'", "CSV_FORMAT": "'YES'",
        }
        txt = requests.get(API, params=params, timeout=60).json()["result"]
        open(key, "w").write(txt)
    rows = txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    az, el = [], []
    for row in rows:
        nums = NUM.findall(row.split(",", 1)[1])   # skip the date column
        az.append(float(nums[-2])); el.append(float(nums[-1]))
    return np.array(az), np.array(el), rows


def main():
    start, stop, step_h = "2026-03-01 00:00", "2026-03-31 00:00", 6
    hours = np.arange(0, 30 * 24, step_h)
    t = ts.utc(2026, 3, 1, hours)
    results = []
    for sid in ("apollo11", "haworth", "chandrayaan3"):
        s = BY_ID[sid]
        mine = site_ephemeris(s.lat, s.lon, 0.0, t)
        for body, code in (("sun", "10"), ("earth", "399")):
            haz, hel, rows = horizons_altaz(code, s.lat, s.lon, start, stop, f"{step_h} h")
            k = min(len(hel), len(t))
            if not results:
                print("Example Horizons rows (check parsing):", rows[:2])
            d_el = np.abs(mine[body]["el"][:k] - hel[:k])
            d_az = np.abs((mine[body]["az"][:k] - haz[:k] + 180) % 360 - 180)
            r = {"site": sid, "body": body, "max_del_deg": float(d_el.max()), "max_daz_deg": float(d_az.max()), "n": int(k)}
            results.append(r)
            print(r)
    os.makedirs("data", exist_ok=True)
    json.dump(results, open("data/validation.json", "w"), indent=2)
    print("Max elevation error overall:", max(r["max_del_deg"] for r in results), "deg")


if __name__ == "__main__":
    main()

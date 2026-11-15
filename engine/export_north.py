"""Export the LOLA north polar terrain for the web app's North pole map (water ice / permanent shadow view).
  public/data/dem_north_960m.bin|json       block-averaged 240 m -> 960 m, to about 75N
  public/data/dem_north_240m_core.bin|json  full 240 m around the pole (about 85N to the pole)
Same layout as the south files from engine.export_web (little-endian int16 metres above the 1737.4 km sphere,
north polar stereographic as in the PDS product: 90E to the right, 0E at the bottom).

Needs only numpy and the PDS files in dem/:
  https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_75N_240M.IMG  (+ .LBL)
Usage: python -m engine.export_north   [--img dem/LDEM_75N_240M.IMG]"""
import argparse, json, os, re
import numpy as np

R = 1737400.0


def read_label(path):
    txt = open(path, errors="ignore").read()
    def num(key):
        m = re.search(rf"^\s*{key}\s*=\s*\"?([-+0-9.Ee]+)", txt, re.M)
        if not m:
            raise ValueError(f"{key} not found in {path}")
        return float(m.group(1))
    lab = {k: num(k) for k in ("LINES", "LINE_SAMPLES", "SCALING_FACTOR", "MAP_SCALE", "CENTER_LATITUDE",
                               "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET")}
    if "LSB_INTEGER" not in txt or not re.search(r"SAMPLE_BITS\s*=\s*16", txt):
        raise ValueError("expected 16-bit LSB_INTEGER samples")
    return lab


def main(img="dem/LDEM_75N_240M.IMG", factor=4, core_half=640):
    lbl = os.path.splitext(img)[0] + ".LBL"
    lab = read_label(lbl)
    if lab["CENTER_LATITUDE"] != 90:
        raise SystemExit(f"{lbl} is not a north polar product (CENTER_LATITUDE = {lab['CENTER_LATITUDE']})")
    n, m = int(lab["LINES"]), int(lab["LINE_SAMPLES"])
    pix = lab["MAP_SCALE"]
    if pix < 10:      # some labels give km
        pix *= 1000
    h = np.fromfile(img, dtype="<i2", count=n * m).reshape(n, m).astype(np.float32) * lab["SCALING_FACTOR"]
    print(f"{img}: {h.shape}, {pix:.0f} m/pixel, heights {h.min():.0f}..{h.max():.0f} m")
    # pixel-corner coordinates of the grid's top-left (map x to the right, y up)
    x0 = -(lab["SAMPLE_PROJECTION_OFFSET"] + 0.5) * pix
    y0 = (lab["LINE_PROJECTION_OFFSET"] + 0.5) * pix
    os.makedirs("public/data", exist_ok=True)

    k = (min(n, m) // factor) * factor
    small = h[:k, :k].reshape(k // factor, factor, k // factor, factor).mean(axis=(1, 3))
    small.round().astype("<i2").tofile("public/data/dem_north_960m.bin")
    meta = {"size": int(small.shape[0]), "pixel_m": pix * factor, "x0": x0, "y0": y0, "R": R,
            "units": "metres above 1737.4 km sphere", "projection": "north polar stereographic, lon 0 down"}
    json.dump(meta, open("public/data/dem_north_960m.json", "w"), indent=1)
    print("wrote public/data/dem_north_960m.bin", small.shape, meta)

    c = n // 2
    core = h[c - core_half:c + core_half, c - core_half:c + core_half]
    core.round().astype("<i2").tofile("public/data/dem_north_240m_core.bin")
    cmeta = {"size": int(core.shape[0]), "pixel_m": pix, "x0": x0 + (c - core_half) * pix,
             "y0": y0 - (c - core_half) * pix, "R": R}
    json.dump(cmeta, open("public/data/dem_north_240m_core.json", "w"), indent=1)
    print("wrote public/data/dem_north_240m_core.bin", core.shape, cmeta)

    # sanity check: Peary crater (88.6N, 24.4E) should sit lower than its surroundings
    def height(lat, lon):
        rho = 2 * R * np.tan(np.pi / 4 - np.radians(lat) / 2)
        x, y = rho * np.sin(np.radians(lon)), -rho * np.cos(np.radians(lon))
        return h[int((y0 - y) / pix), int((x - x0) / pix)]
    print(f"check: Peary floor {height(88.63, 24.4):.0f} m vs north pole {height(90, 0):.0f} m (floor should be lower)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--img", default="dem/LDEM_75N_240M.IMG")
    main(ap.parse_args().img)

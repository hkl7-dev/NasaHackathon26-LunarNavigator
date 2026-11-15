"""Bring independent NASA reference maps onto the web app's map grid, for validation and the multi-dataset ice layer.

Writes public/data/ref_south.json and/or ref_north.json. Each layer is sampled on exactly the grid the browser
uses for its region maps (84 x 84 cells over the polar stereographic disk out to 79 degrees), so every cell can be
compared one-to-one with our own computation:
  center   value at the cell centre (point-to-point comparison with our cell-centre calculation)
  mean     mean over 5 x 5 points spread over the cell
  frac     share of those 5 x 5 points that are "positive" (PSR = 1, Diviner cold trap < 110 K)

Inputs (put them in dem/ref/; see docs/DATA_SOURCES.md for the links). Every file is optional:
  AVGVISIB_65S_240M_201608.IMG/.LBL         LOLA average solar illumination (Mazarico et al. 2011; 18.6-yr cycle)
  AVGVISIB_65S_240M_201608_EARTH.IMG/.LBL   LOLA average Earth visibility
  LPSR_65S_240M_201608.IMG/.LBL             LOLA permanently shadowed regions
  LDSM_75S_240M.IMG/.LBL                    LOLA slope map
  dlre_prp_south.tab/.lbl (+ dlre_prp.fmt)  Diviner Polar Resource Product (annual max temperature)
  (and the same with N / north for the north pole)

Needs only numpy.  Usage:  python -m engine.import_reference            (both poles, whatever files exist)
                           python -m engine.import_reference --pole south"""
import argparse, glob, json, os, re
import numpy as np

R = 1737400.0
CELLS, EDGE, SUB = 84, 79.0, 5
REF_DIR = "dem/ref"
COLD_TRAP_K = 110.0

LAYERS = {
    # key: (file pattern per pole, description, unit, positive-test for frac)
    "lola_sun": ("AVGVISIB_65{P}_240M_*[0-9].LBL", "LOLA average solar illumination (Mazarico et al. 2011, 2016 release)", "fraction of time", None),
    "lola_earth": ("AVGVISIB_65{P}_240M_*_EARTH.LBL", "LOLA average Earth visibility", "fraction of time", None),
    "lola_psr": ("LPSR_65{P}_240M_*.LBL", "LOLA permanently shadowed regions", "1 = PSR", lambda v: v > 0.5),
    "lola_slope": ("LDSM_75{P}_240M.LBL", "LOLA slope map", "degrees", lambda v: v < 8.0),
}


# ---------------- PDS3 image reader ----------------
def label_value(txt, key, cast=float, default=None):
    m = re.search(rf"^\s*{key}\s*=\s*\"?([^\"\r\n<]+)", txt, re.M)
    if not m:
        return default
    v = m.group(1).strip()
    try:
        return cast(v)
    except ValueError:
        return default


def read_pds_image(lbl_path):
    txt = open(lbl_path, errors="ignore").read()
    img_obj = txt[txt.find("OBJECT") if "OBJECT = IMAGE" not in txt else txt.find("OBJECT = IMAGE"):]
    lines, samples = int(label_value(img_obj, "LINES")), int(label_value(img_obj, "LINE_SAMPLES"))
    stype = label_value(img_obj, "SAMPLE_TYPE", str, "")
    bits = int(label_value(img_obj, "SAMPLE_BITS", float, 16))
    scale = label_value(img_obj, "SCALING_FACTOR", float, 1.0)
    offset = label_value(img_obj, "OFFSET", float, 0.0)
    missing = label_value(img_obj, "MISSING_CONSTANT", float, None)
    endian = ">" if stype.startswith(("MSB", "SUN", "IEEE")) else "<"
    kind = "f" if "REAL" in stype else ("u" if "UNSIGNED" in stype else "i")
    dtype = np.dtype(f"{endian}{kind}{bits // 8}")
    # data file: ^IMAGE = "NAME.IMG" (or same basename)
    m = re.search(r"\^IMAGE\s*=\s*\(?\s*\"?([^\",)\s]+)", txt)
    img_name = m.group(1) if m and not m.group(1).isdigit() else os.path.splitext(os.path.basename(lbl_path))[0] + ".IMG"
    img_path = os.path.join(os.path.dirname(lbl_path), img_name)
    if not os.path.exists(img_path):
        alt = [p for p in glob.glob(os.path.join(os.path.dirname(lbl_path), "*")) if os.path.basename(p).lower() == img_name.lower()]
        img_path = alt[0] if alt else img_path
    raw = np.memmap(img_path, dtype=dtype, mode="r", shape=(lines, samples))
    proj = {
        "center_lat": label_value(txt, "CENTER_LATITUDE"),
        "pix": label_value(txt, "MAP_SCALE"),
        "line_off": label_value(txt, "LINE_PROJECTION_OFFSET"),
        "samp_off": label_value(txt, "SAMPLE_PROJECTION_OFFSET"),
    }
    if proj["pix"] is not None and proj["pix"] < 10:   # some labels give km/pixel
        proj["pix"] *= 1000
    if "STEREOGRAPHIC" not in txt.upper():
        raise ValueError(f"{lbl_path}: expected a polar stereographic map")
    return raw, scale, offset, missing, proj


def make_sampler(lbl_path):
    raw, scale, offset, missing, p = read_pds_image(lbl_path)
    n_l, n_s = raw.shape
    def sample(x, y):
        # PDS polar stereographic: sample = x / scale + SAMPLE_PROJECTION_OFFSET (0-based, pixel centres),
        # line = LINE_PROJECTION_OFFSET - y / scale
        s = np.rint(x / p["pix"] + p["samp_off"]).astype(int)
        l = np.rint(p["line_off"] - y / p["pix"]).astype(int)
        ok = (s >= 0) & (s < n_s) & (l >= 0) & (l < n_l)
        out = np.full(x.shape, np.nan)
        dn = raw[l[ok], s[ok]].astype(np.float64)
        v = dn * scale + offset
        if missing is not None:
            v[dn == missing] = np.nan
        elif offset != 0 and raw.dtype.kind in "iu":
            v[dn == 0] = np.nan   # e.g. LDSM slope: no-data pixels are DN 0, which would decode to OFFSET (45 deg)
        out[ok] = v
        return out
    return sample, p["center_lat"]


# ---------------- the app's map grid ----------------
def grid_points(sg):
    """Cell centres and 5x5 sub-points in map metres, exactly as heatmap.worker.js lays them out."""
    rho_max = 2 * R * np.tan(np.radians(90 - EDGE) / 2)
    c = (np.arange(CELLS) + 0.5) / CELLS * 2 - 1
    u, v = np.meshgrid(c, -c)          # row 0 = top (v = +1)
    inside = u ** 2 + v ** 2 <= 1
    cell = 2 * rho_max / CELLS
    off = ((np.arange(SUB) + 0.5) / SUB - 0.5) * cell
    ox, oy = np.meshgrid(off, off)
    xc, yc = u * rho_max, v * rho_max
    return xc, yc, xc[..., None] + ox.ravel(), yc[..., None] + oy.ravel(), inside


def latlon(x, y, sg):
    rho = np.hypot(x, y)
    lat = sg * (90 - np.degrees(2 * np.arctan(rho / (2 * R))))
    lon = np.degrees(np.arctan2(x, -sg * y))
    return lat, lon


def rnd(a, nd=4):
    return [None if not np.isfinite(v) else round(float(v), nd) for v in np.ravel(a)]


# ---------------- Diviner PRP (ASCII table of mesh elements) ----------------
def diviner_columns(lbl_path):
    """Column names and byte positions from the .lbl / .fmt next to the table."""
    folder = os.path.dirname(lbl_path)
    txt = open(lbl_path, errors="ignore").read()
    for f in glob.glob(os.path.join(folder, "*.fmt")) + glob.glob(os.path.join(folder, "*.FMT")):
        txt += "\n" + open(f, errors="ignore").read()
    cols = []
    for block in re.findall(r"OBJECT\s*=\s*COLUMN(.*?)END_OBJECT\s*=\s*COLUMN", txt, re.S):
        name = label_value(block, "NAME", str, "").strip()
        start = label_value(block, "START_BYTE", float)
        nbytes = label_value(block, "BYTES", float)
        unit = label_value(block, "UNIT", str, "")
        if name and start:
            cols.append((name, int(start) - 1, int(nbytes), unit))
    return cols


def import_diviner(pole, sg, xs, ys, inside):
    lbls = glob.glob(os.path.join(REF_DIR, f"dlre_prp_{pole}.lbl")) + glob.glob(os.path.join(REF_DIR, f"DLRE_PRP_{pole.upper()}.LBL"))
    if not lbls:
        return None
    cols = diviner_columns(lbls[0])
    names = [c[0].upper() for c in cols]
    print("  Diviner PRP columns:", ", ".join(names) or "(none found: copy dlre_prp.fmt into dem/ref/)")
    pick = lambda *keys: next((c for c in cols if all(k in c[0].upper() for k in keys)), None)
    clat, clon, ctmax = pick("LAT"), pick("LON"), pick("MAX", "T") or pick("TMAX")
    if not (clat and clon and ctmax):
        print("  could not find latitude / longitude / max temperature columns, skipping Diviner")
        return None
    tab = os.path.splitext(lbls[0])[0] + (".tab" if lbls[0].endswith(".lbl") else ".TAB")
    lat, lon, tmax = [], [], []
    with open(tab, "rb") as f:
        for line in f:
            try:
                lat.append(float(line[clat[1]:clat[1] + clat[2]])); lon.append(float(line[clon[1]:clon[1] + clon[2]]))
                tmax.append(float(line[ctmax[1]:ctmax[1] + ctmax[2]]))
            except ValueError:
                continue
    lat, lon, tmax = map(np.asarray, (lat, lon, tmax))
    print(f"  Diviner: {len(tmax)} mesh elements, Tmax {np.nanmin(tmax):.0f}..{np.nanmax(tmax):.0f} K")
    # bin the mesh elements onto the app grid (mean of elements per cell, and share below the cold-trap limit)
    rho = 2 * R * np.tan(np.radians(90 - sg * lat) / 2)
    x, y = rho * np.sin(np.radians(lon)), -sg * rho * np.cos(np.radians(lon))
    rho_max = 2 * R * np.tan(np.radians(90 - EDGE) / 2)
    c = np.floor((x / rho_max + 1) / 2 * CELLS).astype(int)
    r = np.floor((1 - y / rho_max) / 2 * CELLS).astype(int)
    ok = (c >= 0) & (c < CELLS) & (r >= 0) & (r < CELLS) & np.isfinite(tmax)
    idx = r[ok] * CELLS + c[ok]
    cnt = np.bincount(idx, minlength=CELLS * CELLS).astype(float)
    tsum = np.bincount(idx, weights=tmax[ok], minlength=CELLS * CELLS)
    cold = np.bincount(idx, weights=(tmax[ok] < COLD_TRAP_K).astype(float), minlength=CELLS * CELLS)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(cnt > 0, tsum / cnt, np.nan)
        frac = np.where(cnt > 0, cold / cnt, np.nan)
    mean[~inside.ravel()] = np.nan; frac[~inside.ravel()] = np.nan
    return {"desc": "Diviner annual maximum surface temperature (Polar Resource Product, Paige et al. 2010)",
            "unit": "K", "mean": rnd(mean, 1), "frac": rnd(frac, 3), "frac_test": f"Tmax < {COLD_TRAP_K:.0f} K",
            "file": os.path.basename(tab)}


def import_pole(pole, out_dir="public/data"):
    sg = 1 if pole == "north" else -1
    P = "N" if pole == "north" else "S"
    xc, yc, xs, ys, inside = grid_points(sg)
    out = {"pole": pole, "N": CELLS, "edge_lat": sg * EDGE, "layers": {}}
    for key, (pat, desc, unit, test) in LAYERS.items():
        files = sorted(glob.glob(os.path.join(REF_DIR, pat.format(P=P))))
        if key == "lola_sun":
            files = [f for f in files if "EARTH" not in f.upper()]
        if not files:
            continue
        sample, clat = make_sampler(files[0])
        if clat is not None and np.sign(clat) != sg:
            print(f"  {files[0]} is for the other pole, skipped"); continue
        center = sample(xc, yc)
        sub = sample(xs, ys)
        if key in ("lola_sun", "lola_earth") and np.nanmax(center) > 1.5:   # stored as percent
            center, sub = center / 100, sub / 100
        center[~inside] = np.nan
        mean = np.nanmean(sub, axis=-1); mean[~inside] = np.nan
        layer = {"desc": desc, "unit": unit, "file": os.path.basename(files[0]), "center": rnd(center), "mean": rnd(mean)}
        if test:
            fr = np.nanmean(test(sub).astype(float), axis=-1); fr[~inside] = np.nan
            layer["frac"] = rnd(fr, 3)
        out["layers"][key] = layer
        print(f"  {key:11s} {os.path.basename(files[0])}: range {np.nanmin(center):.3g}..{np.nanmax(center):.3g} {unit}")
    div = import_diviner(pole, sg, xs, ys, inside)
    if div:
        out["layers"]["diviner_tmax"] = div
    if not out["layers"]:
        print(f"  no reference files for the {pole} pole in {REF_DIR}/")
        return
    path = os.path.join(out_dir, f"ref_{pole}.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) // 1024} kB): {', '.join(out['layers'])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pole", choices=["south", "north", "both"], default="both")
    ap.add_argument("--ref-dir", default=REF_DIR)
    ap.add_argument("--out-dir", default="public/data")
    a = ap.parse_args()
    REF_DIR = a.ref_dir
    for pole in (["south", "north"] if a.pole == "both" else [a.pole]):
        print(f"{pole} pole:")
        import_pole(pole, a.out_dir)

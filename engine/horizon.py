"""Terrain horizon masks from a LOLA polar DEM.
For each azimuth (0.5 deg steps) march outward along a great circle, sample the DEM and take the
maximum elevation angle (exact spherical geometry, includes lunar curvature)."""
import numpy as np

R = 1737400.0                      # LOLA reference sphere radius, m
AZ = np.arange(0, 360, 0.5)        # 720 directions, 0 = north, 90 = east
D = np.geomspace(720, 250_000, 1500)  # sample distances, m (start 3 px out: nearer is below DEM resolution)

DEM_PATH = "dem/LDEM_75S_240M.LBL"   # <-- set to the file you downloaded (.LBL, .IMG or .tif)
DEM_SCALE = 0.5                      # <-- SCALING_FACTOR from the .LBL (1.0 for most GeoTIFFs)
DEM_OFFSET = 0.0                     # <-- OFFSET from the .LBL if present
SOUTH_STEREO = f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={R} +units=m +no_defs"


class DEM:
    def __init__(self, path=DEM_PATH, scale=DEM_SCALE, offset=DEM_OFFSET):
        import rasterio
        from pyproj import CRS, Transformer
        ds = rasterio.open(path)
        self.h = ds.read(1).astype(np.float32) * scale + offset
        crs_dem = ds.crs if ds.crs else CRS.from_proj4(SOUTH_STEREO)
        crs_ll = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
        self._to_xy = Transformer.from_crs(crs_ll, crs_dem, always_xy=True)
        self._inv = ~ds.transform
        print(f"DEM {path}: {self.h.shape}, height range {np.nanmin(self.h):.0f}..{np.nanmax(self.h):.0f} m "
              "(expect roughly -5000..+6000)")

    def sample(self, lat, lon):
        from scipy.ndimage import map_coordinates
        lat, lon = np.asarray(lat, float), np.asarray(lon, float)
        x, y = self._to_xy.transform(lon, lat)
        col, row = self._inv * (np.asarray(x), np.asarray(y))
        # rasterio gives pixel-corner coordinates; map_coordinates expects pixel centres, hence -0.5
        return map_coordinates(self.h, [np.ravel(row) - 0.5, np.ravel(col) - 0.5], order=1, mode="nearest").reshape(lat.shape)

    def covers(self, lat):
        return lat < -75.0  # adjust to your DEM's coverage


def dest_points(lat0, lon0, az_deg, d_m):
    """Great-circle destination points. Returns lat, lon arrays of shape (len(az), len(d))."""
    p1, l1 = np.radians(lat0), np.radians(lon0)
    th = np.radians(az_deg)[:, None]
    dl = (np.asarray(d_m) / R)[None, :]
    p2 = np.arcsin(np.sin(p1) * np.cos(dl) + np.cos(p1) * np.sin(dl) * np.cos(th))
    l2 = l1 + np.arctan2(np.sin(th) * np.sin(dl) * np.cos(p1), np.cos(dl) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), (np.degrees(l2) + 180) % 360 - 180


def horizon_mask(dem, lat0, lon0, h_obs_extra=2.0):
    """Returns (mask_el[720] in deg, site height above the reference sphere in m)."""
    h0 = float(dem.sample(np.array([lat0]), np.array([lon0]))[0]) + h_obs_extra
    plat, plon = dest_points(lat0, lon0, AZ, D)
    h = dem.sample(plat, plon)
    dl = D / R
    num = (R + h) * np.cos(dl) - (R + h0)
    den = (R + h) * np.sin(dl)
    return np.degrees(np.arctan2(num, den)).max(axis=1), h0 - h_obs_extra


def flat_mask():
    return np.zeros(len(AZ))


def plot_mask(mask, title, path):
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(9, 3))
    base = min(-1.0, float(np.min(mask)) - 0.5)
    plt.fill_between(AZ, base, mask, color="#555")
    plt.axhline(0, color="#c00", lw=0.6, ls="--")
    plt.xlim(0, 360); plt.xlabel("azimuth (deg, 0 = N, 90 = E)"); plt.ylabel("horizon el (deg)")
    plt.title(title); plt.tight_layout(); plt.savefig(path, dpi=150); plt.close(fig)

# Data sources and downloads

## SPICE kernels → `engine/kernels/`
Skyfield downloads these automatically on first run if they're missing. Pre-download them if the Wi-Fi is slow:
| File | URL |
|---|---|
| de421.bsp | https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp |
| moon_pa_de421_1900-2050.bpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc |
| moon_080317.tf | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf |
| pck00008.tpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00008.tpc |

## LOLA south polar DEM → `dem/`
- PDS LOLA polar GDR: https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/
  Choose a file covering to **75°S or 80°S** at **120–240 m/px**, and download **both** the `.IMG` and the `.LBL`. Check the listing for exact names.
- Plan B: NASA Moon Trek (https://trek.nasa.gov/moon). Use the Layers panel, pick a LOLA south pole DEM, then Download to get a GeoTIFF.
- Set `DEM_PATH` and `DEM_SCALE` in `engine/horizon.py` (read `SCALING_FACTOR` from the `.LBL`).

## Validation
- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html

## Visual cross-checks
- LROC Quickmap: https://quickmap.lroc.asu.edu (illumination and slope layers)
- NASA Moon Trek: https://trek.nasa.gov/moon

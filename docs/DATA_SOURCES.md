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

## LOLA north polar DEM → `dem/`
- https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_75N_240M.IMG and `.LBL`
- Convert for the web app: `python -m engine.export_north`

## Reference maps for validation and ice evidence → `dem/ref/`
All optional. Convert with `python -m engine.import_reference` (writes `public/data/ref_south.json` / `ref_north.json`).

| What | Files | Where |
|---|---|---|
| LOLA average solar illumination (Mazarico et al. 2011, 2016 release, 18.6-yr average) | `AVGVISIB_65S_240M_201608.IMG/.LBL`, `AVGVISIB_65N_240M_201608.IMG/.LBL` (82 MB each) | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ |
| LOLA average Earth visibility | `AVGVISIB_65S_240M_201608_EARTH.IMG/.LBL`, `..._65N_..._EARTH` | same folder |
| LOLA permanently shadowed regions | `LPSR_65S_240M_201608.IMG/.LBL`, `LPSR_65N_240M_201608.IMG/.LBL` | same folder |
| LOLA slope | `LDSM_75S_240M.IMG/.LBL`, `LDSM_75N_240M.IMG/.LBL` (29 MB each) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ |
| Diviner Polar Resource Product (annual max temperature; optional, 605 MB each) | `dlre_prp_south.tab/.lbl`, `dlre_prp_north.tab/.lbl`, plus the `DLRE_PRP.FMT` column file from the volume's `label/` folder | https://pds-geosciences.wustl.edu/lro/lro-l-dlre-4-rdr-v1/lrodlr_1001/data/prp/ |

## Artemis III candidate regions → `public/data/artemis3_regions.json`
NASA's nine regions (Oct 28, 2024): https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
Fill in each region's centre latitude/longitude; the app scores 7 × 7 spots in a 15 km square around it.

## Ephemeris validation
`public/data/validation_horizons.json` is a copy of `data/validation.json` (our Sun/Earth directions vs JPL Horizons), shown in the app's Validation tab.

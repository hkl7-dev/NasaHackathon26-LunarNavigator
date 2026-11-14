"""
models/config.py: every assumption for the power, battery and comms models.

NOTE: these are reasonable engineering estimates, NOT one specific lander's specs.
Values marked "mentor to confirm" should be checked in the 2 PM to 6 PM mentor slot,
then marked "mentor-checked" in deck_assets/assumptions.md.
"""

# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
SOLAR_CONSTANT = 1361.0  # W/m^2 at 1 AU (NASA/NOAA total solar irradiance, Kopp & Lean 2011)
                         # Seasonal +/-3% comes from sun_dist_au, so it is not modelled here.

# ---------------------------------------------------------------------------
# Power: solar array
# ---------------------------------------------------------------------------
POWER_CFG = {
    # "horizontal" | "vertical_fixed" | "vertical_tracking"
    # vertical_tracking is the best choice at the pole (cos(2 deg) ~ 0.999); similar in
    # spirit to the VIPER / Artemis approach. horizontal is the "why the pole is weird" case.
    "mode": "vertical_tracking",

    "area_m2": 2.0,       # array area; CLPS-class landers are ~1-4 m^2 (engineering estimate)

    "efficiency": 0.30,   # triple-junction GaAs space cells, beginning of life ~29-32%
                          # (typical of commercial space cells)

    "derate": 0.85,       # all losses lumped into one number (engineering estimate; mentor to confirm):
                          #   packing factor 0.93 x temperature 0.96 x dust/degradation 0.98
                          #   x wiring + MPPT 0.97 = ~0.85
                          # If area_m2 meant cell area only, drop the packing term (derate ~0.91).

    "fixed_az_deg": 0.0,  # only used for vertical_fixed: azimuth the panel faces (0 = north, 90 = east)
}

# ---------------------------------------------------------------------------
# Battery and loads
# ---------------------------------------------------------------------------
BATTERY_CFG = {
    "capacity_wh": 3000.0,        # nominal pack size (engineering estimate)
    "dod_max": 0.80,              # never drain below 20% SOC, for Li-ion life
    "charge_eff": 0.95,           # round-trip split evenly: 0.95 x 0.95 ~ 0.90 (typical Li-ion)
    "discharge_eff": 0.95,
    "load_day_w": 150.0,          # science mode: instruments, avionics, comms
    "load_night_w": 40.0,         # survival mode: heaters + keep-alive electronics
                                  # (mentor to confirm typical survival heater power)
    "specific_energy_wh_kg": 150.0,  # space-qualified Li-ion pack level (cells alone ~250 Wh/kg)
    "soc0": 1.0,                  # start fully charged
}

# ---------------------------------------------------------------------------
# Comms: direct-to-Earth link
# ---------------------------------------------------------------------------
COMMS_CFG = {
    "band": "X",                  # "S" (~2.2 GHz) or "X" (~8.4 GHz)
    "freq_hz": {"S": 2.25e9, "X": 8.45e9},   # lunar-range downlink allocations near 2.2 / 8.4 GHz

    "tx_power_w": 15.0,           # lander RF output; small X-band amplifiers are ~5-20 W
    "tx_gain_dbi": {"S": 6.0,     # S: patch / low-gain antenna
                    "X": 20.0},   # X: small ~20 cm dish (would give ~22 dBi, so 20 is slightly conservative)
    "tx_losses_db": 2.0,          # cables, pointing, miscellaneous

    # DSN 34 m beam-waveguide station, approximate. Clear-sky zenith is roughly 43 (S) and
    # 54-55 (X) dB/K per DSN 810-005 (34 m BWG module). We derate ~1-2 dB for low
    # elevation and weather. Mentor to confirm. 70 m dish deliberately not assumed.
    "rx_g_over_t_dbk": {"S": 41.0, "X": 53.0},

    "required_ebn0_db": 2.5,      # modern rate-1/2 LDPC/turbo coded BPSK, BER ~1e-5.
                                  # (older rate-1/2 convolutional codes need ~4.4 dB)
    "margin_db": 3.0,             # standard link margin
    "min_elev_margin_deg": 1.0,   # Earth must be this far above the terrain horizon
                                  # (multipath, antenna pattern); mentor to confirm
    "max_rate_bps": 2_000_000,    # radio hardware cap: at X-band the hardware, not physics,
                                  # is the limit (raw link supports ~200 Mbps)
}
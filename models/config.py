"""All engineering assumptions in one place. Representative estimates, not a specific lander's specs.
Each value has a comment saying where it came from; this becomes the 'Assumptions' backup slide."""

SOLAR_CONSTANT = 1361.0  # W/m^2 at 1 AU (total solar irradiance, NASA/NOAA)

POWER_CFG = {
    "mode": "vertical_tracking",  # "horizontal" | "vertical_fixed" | "vertical_tracking"
    "area_m2": 2.0,               # CLPS-class landers carry roughly 1-4 m^2 of array
    "efficiency": 0.30,           # triple-junction GaAs space cells, ~29-32% BOL
    "derate": 0.85,               # temperature, dust, wiring, MPPT losses
    "fixed_az_deg": 0.0,          # vertical_fixed only: azimuth the panel faces
}

BATTERY_CFG = {
    "capacity_wh": 3000.0,        # nominal pack
    "dod_max": 0.80,              # keep >= 20% SOC for Li-ion life
    "charge_eff": 0.95,
    "discharge_eff": 0.95,
    "load_day_w": 150.0,          # science ops: instruments, avionics, comms
    "load_night_w": 40.0,         # survival: heaters + keep-alive electronics
    "specific_energy_wh_kg": 150.0,  # space-qualified Li-ion at pack level
    "soc0": 1.0,
}

COMMS_CFG = {
    "band": "X",                                   # "S" or "X"
    "freq_hz": {"S": 2.25e9, "X": 8.45e9},
    "tx_power_w": 15.0,                            # lander RF output power
    "tx_gain_dbi": {"S": 6.0, "X": 20.0},          # S: low-gain patch, X: small HGA
    "tx_losses_db": 2.0,                           # cables + pointing
    "rx_g_over_t_dbk": {"S": 41.0, "X": 53.0},     # DSN 34 m approx (verify vs DSN 810-005)
    "required_ebn0_db": 2.5,                       # coded BPSK, BER ~1e-5
    "margin_db": 3.0,                              # standard link margin
    "min_elev_margin_deg": 1.0,                    # Earth must clear terrain by this much
    "max_rate_bps": 2_000_000,                     # radio hardware cap
}

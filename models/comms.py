import numpy as np

C = 299_792_458.0


def comms_available(earth_el, earth_mask_el, cfg):
    """
    Determines whether Earth is visible above the terrain horizon.
    Returns 1 when communication is possible, 0 otherwise.
    """

    return (
        np.asarray(earth_el) >
        np.asarray(earth_mask_el) + cfg["min_elev_margin_deg"]
    ).astype(np.uint8)


def link_rate_bps(earth_dist_km, cfg):
    """
    Calculates the maximum achievable data rate in bits per second.
    """

    band = cfg["band"]
    frequency = cfg["freq_hz"][band]

    # Convert Earth distance from km to metres
    distance_m = np.asarray(earth_dist_km) * 1000

    # Free-space path loss
    fspl = 20 * np.log10(
        4 * np.pi * distance_m * frequency / C
    )

    # Effective isotropic radiated power
    eirp = (
        10 * np.log10(cfg["tx_power_w"])
        + cfg["tx_gain_dbi"][band]
        - cfg["tx_losses_db"]
    )

    # Maximum data rate from link budget
    rate_db = (
        eirp
        - fspl
        + cfg["rx_g_over_t_dbk"][band]
        + 228.6
        - (cfg["required_ebn0_db"] + cfg["margin_db"])
    )

    rate_bps = 10 ** (rate_db / 10)

    # Limit to the radio's maximum data rate
    return np.minimum(rate_bps, cfg["max_rate_bps"])


def data_per_lunar_day_gb(rate_bps, comms_up, step_min):
    """
    Calculates average GB transmitted per 29.53-day lunar cycle.
    """

    dt_s = step_min * 60

    total_gb = np.sum(
        np.asarray(rate_bps) *
        np.asarray(comms_up) *
        dt_s
    ) / 8e9

    days = len(rate_bps) * step_min / 1440

    return total_gb / days * 29.53

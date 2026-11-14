"""Direct-to-Earth comms: visibility over terrain + link budget -> max data rate."""
import numpy as np

C = 299_792_458.0
BOLTZMANN_DBW = -228.6  # dBW/K/Hz


def comms_available(earth_el, earth_mask_el, cfg):
    return (np.asarray(earth_el, float) > np.asarray(earth_mask_el, float) + cfg["min_elev_margin_deg"]).astype(np.uint8)


def fspl_db(dist_km, freq_hz):
    d = np.asarray(dist_km, float) * 1e3
    return 20 * np.log10(4 * np.pi * d * freq_hz / C)


def link_rate_bps(earth_dist_km, cfg):
    b = cfg["band"]
    f = cfg["freq_hz"][b]
    eirp = 10 * np.log10(cfg["tx_power_w"]) + cfg["tx_gain_dbi"][b] - cfg["tx_losses_db"]
    r_db = (eirp - fspl_db(earth_dist_km, f) + cfg["rx_g_over_t_dbk"][b]
            - BOLTZMANN_DBW - (cfg["required_ebn0_db"] + cfg["margin_db"]))
    return np.minimum(10 ** (r_db / 10), cfg["max_rate_bps"])


def data_volume_gb(rate_bps, comms_up, step_min):
    return float(np.sum(np.asarray(rate_bps) * np.asarray(comms_up)) * step_min * 60 / 8e9)

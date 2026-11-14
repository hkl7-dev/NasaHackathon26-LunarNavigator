import numpy as np
def fake_polar(n=24*60, step_min=60):
    t_h = np.arange(n) * step_min / 60
    sun_el = 1.5*np.sin(2*np.pi*t_h/(29.53*24)) + 0.5*np.sin(2*np.pi*t_h/24/365*12)
    sun_az = (360 * t_h / (29.53*24)) % 360
    vis = np.clip((sun_el - 0.3 + 0.266) / 0.532, 0, 1)
    earth_el = 6.5*np.sin(2*np.pi*t_h/(27.32*24))
    return dict(sun_el=sun_el, sun_az=sun_az, sun_vis_frac=vis,
                sun_dist_au=np.full(n, 1.0), earth_el=earth_el,
                earth_mask_el=np.full(n, 0.8),
                earth_dist_km=384_400 + 21_000*np.sin(2*np.pi*t_h/(27.55*24)))


def apollo_power(step_min=10, peak_power_w=250):
    # Convert time step from minutes to hours
    step_h = step_min / 60

    # Number of samples in 354 hours
    n_day = round(354 / step_h)
    n_night = round(354 / step_h)

    # Daytime: half-sine solar power curve
    phase = np.linspace(0, np.pi, n_day)
    day_power = peak_power_w * np.sin(phase)

    # Nighttime: no solar power
    night_power = np.zeros(n_night)

    # Combine daytime and nighttime
    power = np.concatenate((day_power, night_power))

    return power
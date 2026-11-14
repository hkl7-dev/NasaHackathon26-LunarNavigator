"""Curated landing sites. Coordinates are approximate (from mission reports): verify in Quickmap.
lat = planetocentric latitude, lon = east longitude (-180..180)."""
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class Site:
    id: str
    name: str
    lat: float
    lon: float
    group: str
    def to_dict(self):
        return asdict(self)

SITES = [
    Site("shackleton_ridge", "Shackleton–de Gerlache ridge",      -89.45, -137.30, "Artemis III region"),
    Site("haworth",          "Haworth crater floor (permanent shadow)", -87.45, -5.00, "Shadowed crater"),    Site("malapert_massif",  "Malapert Massif",                     -86.00,    2.90, "Artemis III region"),
    Site("mons_mouton",      "Mons Mouton (IM-2 / ex-VIPER)",       -84.79,   29.19, "CLPS"),
    Site("im1_malapert_a",   "IM-1 Odysseus (Malapert A)",          -80.13,    1.44, "CLPS"),
    Site("chandrayaan3",     "Chandrayaan-3 Shiv Shakti point",     -69.373,  32.319,"ISRO"),
    Site("change6",          "Chang'e-6 (Apollo basin, far side)",  -41.64, -153.99, "CNSA"),
    Site("apollo11",         "Apollo 11 Tranquility Base",            0.6741, 23.4730,"Apollo"),
    Site("apollo17",         "Apollo 17 Taurus–Littrow",             20.1908, 30.7717,"Apollo"),
]
BY_ID = {s.id: s for s in SITES}

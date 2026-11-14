import json, os
import numpy as np

def _r(a, nd=3):
    return np.round(np.asarray(a, dtype=float), nd).tolist()

def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))

def read_json(path):
    with open(path) as f:
        return json.load(f)

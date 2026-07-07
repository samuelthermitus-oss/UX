"""Aircraft type categorization from OpenSky's community aircraft database.

OpenSky's live state vectors carry an icao24 address but no aircraft type -
that comes from a separate, large (tens of MB) crowdsourced metadata file.
Downloaded once, cached to disk, and reduced immediately to just the two
fields needed (typecode, icaoaircrafttype) rather than keeping full rows,
to avoid holding the entire ~500k-row database in memory as raw CSV data.

Categorization uses the ICAO aircraft type designator (e.g. "L2J" = landplane,
2 engines, jet) plus a small explicit list of widebody twin-jet typecodes,
since engine count alone can't tell a 737 (narrowbody twin-jet) apart from a
777 (widebody twin-jet). Not exhaustive - unmatched/unknown aircraft fall
back to a generic category rather than a guess.

Source is unlicensed / crowdsourced (not covered by OpenSky's own API terms)
per OpenSky's own description of this dataset - treat it as best-effort.
"""
import csv
import io
import json
import os
import time

import httpx

AIRCRAFT_DB_URL = "https://opensky-network.org/datasets/metadata/aircraftDatabase.csv"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
CACHE_PATH = os.path.join(CACHE_DIR, "aircraft_types.json")
CACHE_TTL_SECONDS = 30 * 24 * 60 * 60  # aircraft registrations barely change; refresh monthly

WIDEBODY_TWIN_TYPECODES = {
    "B772", "B773", "B77L", "B77W", "B788", "B789", "B78X",
    "A332", "A333", "A337", "A338", "A339", "A345", "A346", "A359", "A35K",
    "A300", "A306", "A310", "MD11",
}

_type_cache = {"loaded_at": 0.0, "by_icao24": {}}


def categorize(typecode, icaoaircrafttype):
    typecode = (typecode or "").upper()
    icaoaircrafttype = (icaoaircrafttype or "").upper()

    if icaoaircrafttype.startswith("H"):
        return "helicopter"

    engine_count = icaoaircrafttype[1:2]
    engine_type = icaoaircrafttype[2:3]

    if engine_type == "P":
        return "piston"
    if engine_type == "T":
        return "turboprop"
    if engine_type == "J":
        if typecode in WIDEBODY_TWIN_TYPECODES or engine_count in ("3", "4"):
            return "widebody"
        return "jet"
    return "unknown"


def _parse_csv(text):
    by_icao24 = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        icao24 = (row.get("icao24") or "").strip().lower()
        if not icao24:
            continue
        typecode = (row.get("typecode") or "").strip()
        icaoaircrafttype = (row.get("icaoaircrafttype") or "").strip()
        manufacturer = (row.get("manufacturername") or "").strip()
        model = (row.get("model") or "").strip()
        if not (typecode or icaoaircrafttype or manufacturer or model):
            continue
        by_icao24[icao24] = {
            "category": categorize(typecode, icaoaircrafttype),
            "manufacturer": manufacturer or None,
            "model": model or None,
        }
    return by_icao24


async def _load():
    now = time.time()
    if _type_cache["by_icao24"] and now - _type_cache["loaded_at"] < CACHE_TTL_SECONDS:
        return _type_cache["by_icao24"]

    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(CACHE_PATH) and now - os.path.getmtime(CACHE_PATH) < CACHE_TTL_SECONDS:
        with open(CACHE_PATH, encoding="utf-8") as f:
            by_icao24 = json.load(f)
        _type_cache.update(loaded_at=now, by_icao24=by_icao24)
        return by_icao24

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(AIRCRAFT_DB_URL)
        resp.raise_for_status()
        text = resp.text

    by_icao24 = _parse_csv(text)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(by_icao24, f)

    _type_cache.update(loaded_at=now, by_icao24=by_icao24)
    return by_icao24


async def lookup_many(icao24_list):
    """Returns {icao24: {category, manufacturer, model}} for the given
    aircraft, omitting any not found in the database (unknown category
    handled by the caller/frontend, not guessed here)."""
    by_icao24 = await _load()
    return {icao24: by_icao24[icao24] for icao24 in icao24_list if icao24 in by_icao24}

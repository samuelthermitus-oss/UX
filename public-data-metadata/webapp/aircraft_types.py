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

Loading is fire-and-forget from the caller's perspective: lookup_many()
never blocks on the download or the (CPU-bound, potentially slow) CSV
parse - both would otherwise freeze the single asyncio event loop for
everyone else's requests too. It kicks off a background load the first
time it's needed and returns whatever's cached so far (possibly nothing
yet), so /api/flights always responds quickly and aircraft types simply
fill in on a later poll once loading finishes.
"""
import asyncio
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
_load_task = None
_last_error = None


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


def _read_disk_cache():
    with open(CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


async def _load():
    global _last_error
    now = time.time()

    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(CACHE_PATH) and now - os.path.getmtime(CACHE_PATH) < CACHE_TTL_SECONDS:
        try:
            by_icao24 = await asyncio.to_thread(_read_disk_cache)
            _type_cache.update(loaded_at=now, by_icao24=by_icao24)
            _last_error = None
            return
        except (OSError, json.JSONDecodeError):
            pass  # fall through and re-download

    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(AIRCRAFT_DB_URL)
            resp.raise_for_status()
            text = resp.text

        # CSV parsing over ~500k rows is real CPU work - run it in a thread
        # so it can't block the event loop (and every other in-flight
        # request) for the whole duration.
        by_icao24 = await asyncio.to_thread(_parse_csv, text)

        def _write_disk_cache():
            with open(CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump(by_icao24, f)

        await asyncio.to_thread(_write_disk_cache)
        _type_cache.update(loaded_at=now, by_icao24=by_icao24)
        _last_error = None
    except httpx.HTTPError as exc:
        _last_error = str(exc)


def _ensure_loading_started():
    global _load_task
    now = time.time()
    is_stale = now - _type_cache["loaded_at"] >= CACHE_TTL_SECONDS
    if is_stale and (_load_task is None or _load_task.done()):
        _load_task = asyncio.ensure_future(_load())


async def lookup_many(icao24_list):
    """Returns {icao24: {category, manufacturer, model}} for whichever of
    the given aircraft are already known. Never blocks on loading - if the
    database isn't ready yet, returns what's available (possibly nothing)
    and a later call will have more once the background load completes."""
    _ensure_loading_started()
    by_icao24 = _type_cache["by_icao24"]
    return {icao24: by_icao24[icao24] for icao24 in icao24_list if icao24 in by_icao24}


async def status():
    _ensure_loading_started()
    loading = _load_task is not None and not _load_task.done()
    return {
        "loaded": bool(_type_cache["by_icao24"]),
        "loading": loading,
        "count": len(_type_cache["by_icao24"]),
        "last_error": _last_error,
    }

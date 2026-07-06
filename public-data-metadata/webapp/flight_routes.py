"""Per-aircraft route lookup (origin/destination airport) via OpenSky's
flight-history endpoint.

OpenSky's live state vectors (/states/all) don't include origin/destination
- that comes from a separate, more expensive endpoint
(/flights/aircraft), queried per aircraft. To stay well inside anonymous
rate limits we cache aggressively and only ever look up one aircraft at a
time, on demand (see server.py's /api/flight-route/{icao24}) rather than
eagerly for every visible flight.
"""
import time

import httpx

import opensky_auth
from airports import describe_airport

OPENSKY_FLIGHTS_URL = "https://opensky-network.org/api/flights/aircraft"
# Must comfortably exceed the longest realistic flight duration (~18-19h for
# the longest nonstops in service) - an 8h window was cutting off long-haul
# flights entirely, since a flight that departed 10+ hours ago wouldn't even
# appear in the query.
LOOKBACK_SECONDS = 26 * 60 * 60
POSITIVE_TTL_SECONDS = 30 * 60  # a resolved route barely changes mid-flight
NEGATIVE_TTL_SECONDS = 10 * 60  # "nothing found" - don't hammer the endpoint retrying

_route_cache = {}  # icao24 -> {"fetched_at": ts, "route": {...} | None}


async def get_route(icao24):
    icao24 = icao24.lower()
    now = time.time()
    cached = _route_cache.get(icao24)
    if cached:
        ttl = POSITIVE_TTL_SECONDS if cached["route"] else NEGATIVE_TTL_SECONDS
        if now - cached["fetched_at"] < ttl:
            return cached["route"]

    params = {"icao24": icao24, "begin": int(now - LOOKBACK_SECONDS), "end": int(now)}
    headers = await opensky_auth.get_auth_headers()
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(OPENSKY_FLIGHTS_URL, params=params, headers=headers)
        if resp.status_code == 404:
            _route_cache[icao24] = {"fetched_at": now, "route": None}
            return None
        resp.raise_for_status()
        records = resp.json() or []

    if not records:
        _route_cache[icao24] = {"fetched_at": now, "route": None}
        return None

    latest = max(records, key=lambda r: r.get("lastSeen") or r.get("firstSeen") or 0)
    route = {
        "callsign": (latest.get("callsign") or "").strip() or None,
        "origin": describe_airport(latest.get("estDepartureAirport")),
        "destination": describe_airport(latest.get("estArrivalAirport")),
    }
    _route_cache[icao24] = {"fetched_at": now, "route": route}
    return route

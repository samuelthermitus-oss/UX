#!/usr/bin/env python3
"""Backend for the live flights + satellites + trains + cameras dashboard.

Proxies OpenSky Network (flights), CelesTrak (satellite TLEs, propagated
with SGP4 via pyorbital), MBTA (live train positions + route shapes), and
511.org (official Bay Area traffic cameras) so the browser never needs its
own API keys and never hits CORS restrictions on those providers.
"""
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pyorbital.orbital import Orbital

import cameras
import trains
from airlines import airline_for_callsign

OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"
OPENSKY_PROVIDER = "OpenSky Network"
CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"
CELESTRAK_PROVIDER = "CelesTrak"
# Curated groups so the map shows recognizable, well-known objects rather
# than the entire ~10k-object catalog.
SATELLITE_GROUPS = ["stations", "visual"]
MAX_SATELLITES = 40
TLE_CACHE_TTL_SECONDS = 2 * 60 * 60  # TLEs barely drift within a couple hours

STATION_OPERATORS = {
    "ISS": "NASA / Roscosmos / ESA / JAXA / CSA",
    "TIANHE": "China Manned Space Agency (CMSA)",
    "TIANGONG": "China Manned Space Agency (CMSA)",
    "CSS": "China Manned Space Agency (CMSA)",
}

TRAFFIC_511_TOKEN = os.environ.get("TRAFFIC_511_TOKEN", "")

app = FastAPI(title="Live Sky, Rail & Roads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_tle_cache = {"fetched_at": 0.0, "entries": []}  # [(name, line1, line2)]


def _parse_tle_text(text):
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    entries = []
    for i in range(0, len(lines) - 2, 3):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            entries.append((name.strip(), l1, l2))
    return entries


def _operator_for_satellite(name):
    upper = name.upper()
    for key, operator in STATION_OPERATORS.items():
        if key in upper:
            return operator
    return None


async def _fetch_tles():
    now = time.time()
    if _tle_cache["entries"] and now - _tle_cache["fetched_at"] < TLE_CACHE_TTL_SECONDS:
        return _tle_cache["entries"]

    entries = []
    seen_names = set()
    async with httpx.AsyncClient(timeout=15) as client:
        for group in SATELLITE_GROUPS:
            resp = await client.get(CELESTRAK_URL, params={"GROUP": group, "FORMAT": "tle"})
            resp.raise_for_status()
            for name, l1, l2 in _parse_tle_text(resp.text):
                if name in seen_names:
                    continue
                seen_names.add(name)
                entries.append((name, l1, l2))
            if len(entries) >= MAX_SATELLITES:
                break

    entries = entries[:MAX_SATELLITES]
    _tle_cache["entries"] = entries
    _tle_cache["fetched_at"] = now
    return entries


@app.get("/api/flights")
async def flights(
    lamin: float = Query(...),
    lomin: float = Query(...),
    lamax: float = Query(...),
    lomax: float = Query(...),
):
    params = {"lamin": lamin, "lomin": lomin, "lamax": lamax, "lomax": lomax}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(OPENSKY_STATES_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenSky Network unreachable: {exc}")

    states = payload.get("states") or []
    out = []
    for s in states:
        if s[6] is None or s[5] is None:
            continue  # no position fix yet
        callsign = (s[1] or "").strip()
        out.append({
            "icao24": s[0],
            "callsign": callsign,
            "airline": airline_for_callsign(callsign),
            "country": s[2],
            "provider": OPENSKY_PROVIDER,
            "lon": s[5],
            "lat": s[6],
            "altitude_m": s[7],
            "on_ground": s[8],
            "velocity_ms": s[9],
            "heading": s[10],
            "vertical_rate_ms": s[11],
        })

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(out),
        "provider": OPENSKY_PROVIDER,
        "flights": out,
    }


@app.get("/api/satellites")
async def satellites():
    try:
        entries = await _fetch_tles()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"CelesTrak unreachable: {exc}")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    out = []
    for name, l1, l2 in entries:
        try:
            orb = Orbital(name, line1=l1, line2=l2)
            lon, lat, alt_km = orb.get_lonlatalt(now)
        except Exception:
            continue
        out.append({
            "name": name,
            "operator": _operator_for_satellite(name),
            "provider": CELESTRAK_PROVIDER,
            "lon": lon,
            "lat": lat,
            "alt_km": alt_km,
        })

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(out),
        "provider": CELESTRAK_PROVIDER,
        "satellites": out,
    }


@app.get("/api/train-routes")
async def train_routes():
    try:
        routes, _ = await trains.get_train_routes()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"MBTA unreachable: {exc}")
    return {"provider": trains.PROVIDER, "count": len(routes), "routes": routes}


@app.get("/api/trains")
async def live_trains():
    try:
        vehicles = await trains.get_live_vehicles()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"MBTA unreachable: {exc}")
    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(vehicles),
        "provider": trains.PROVIDER,
        "trains": vehicles,
    }


@app.get("/api/cameras")
async def camera_list():
    if not cameras.is_configured(TRAFFIC_511_TOKEN):
        return {
            "configured": False,
            "provider": cameras.PROVIDER,
            "message": "Add a free 511.org API token (get one instantly at "
                       "https://511.org/open-data/token) as the TRAFFIC_511_TOKEN "
                       "environment variable to enable this layer.",
        }
    try:
        cam_list = await cameras.get_cameras(TRAFFIC_511_TOKEN)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"511.org unreachable: {exc}")
    return {
        "configured": True,
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(cam_list),
        "provider": cameras.PROVIDER,
        "cameras": cam_list,
    }


@app.get("/api/camera-image/{camera_id}")
async def camera_image(camera_id: str):
    image_url = cameras.image_url_for(camera_id)
    if not image_url:
        raise HTTPException(status_code=404, detail="Unknown camera id - fetch /api/cameras first")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"511.org image unreachable: {exc}")
    content_type = resp.headers.get("content-type", "image/jpeg")
    return Response(content=resp.content, media_type=content_type)


app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8420, reload=False)

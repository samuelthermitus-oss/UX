# Live Sky & Orbit

A real-time dashboard: live aircraft positions (OpenSky Network) and live
satellite ground tracks (CelesTrak TLEs, propagated with SGP4) on one map.
This is an actual running app, not a static page — it needs to make live
network calls, so it runs on your machine rather than as a shared link.

## Run it

```bash
cd public-data-metadata/webapp
pip install -r requirements.txt
python3 server.py
```

Then open **http://127.0.0.1:8420** in a browser.

No API keys needed — both OpenSky and CelesTrak are free/open without auth
for this kind of use.

## How it's built

- **`server.py`** — a small FastAPI backend with two endpoints:
  - `GET /api/flights?lamin&lomin&lamax&lomax` — proxies OpenSky's
    `/states/all`, filtered to the map's current viewport, and returns a
    simplified JSON list (callsign, position, altitude, speed, heading).
  - `GET /api/satellites` — fetches TLEs from CelesTrak (`stations` +
    `visual` groups, cached in memory for 2 hours since they barely drift),
    propagates each to the current instant with `pyorbital` (SGP4), and
    returns live lat/lon/altitude.
  - The backend exists so the browser never talks to OpenSky/CelesTrak
    directly — avoids CORS issues and keeps the door open for adding an
    API key server-side later without exposing it to the client.
- **`static/`** — a vanilla JS + Leaflet frontend (Leaflet is vendored
  locally under `static/vendor/leaflet/`, no CDN dependency for the map
  library itself). Polls `/api/flights` on map move + every 15s, and
  `/api/satellites` every 6s. Map basemap tiles come from CartoDB's free
  tile service (light/dark, matching your OS theme) — that one call does
  need internet access at runtime, same as the two data APIs.

## Notes

- OpenSky is a crowdsourced, anonymous-access API — expect gaps in
  coverage where few volunteer ADS-B receivers exist, and don't poll
  faster than the interval already set here (it's tuned to stay well
  within anonymous rate limits).
- The satellite list is intentionally curated (~40 well-known objects:
  ISS, Tiangong, other stations, brightest visible satellites) rather than
  the full ~10k-object catalog, to keep the map readable.
- If a request to either provider fails (offline, provider down, rate
  limited), the panel shows the error inline rather than silently going
  stale — it doesn't retry aggressively or crash the map.

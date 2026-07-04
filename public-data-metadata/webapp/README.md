# Live Sky, Rail & Roads

A real-time dashboard: live aircraft (OpenSky Network), live satellite
ground tracks (CelesTrak, SGP4-propagated), live trains (MBTA), and
official public traffic cameras (511.org / Caltrans) on one map. Every
marker is labeled with the provider it actually came from. This is a real
running app, not a static page — it makes live network calls, so it runs
on your machine rather than as a shared link.

## Run it

```bash
cd public-data-metadata/webapp
python3 -m pip install -r requirements.txt
python3 server.py
```

Then open **http://127.0.0.1:8420**.

Flights, satellites, and trains work immediately with no signup. The
traffic camera layer needs one optional free step - see below.

## Enabling traffic cameras (optional)

511.org's camera API requires a free token (instant self-serve signup, no
approval wait):

1. Get one at <https://511.org/open-data/token>.
2. Run the server with it set:
   ```bash
   TRAFFIC_511_TOKEN=your-token-here python3 server.py
   ```

Without it, every other layer still works — the Cameras panel just shows a
message telling you how to enable it instead of erroring.

## How it's built

- **`server.py`** - FastAPI backend, one endpoint per data source:
  - `GET /api/flights?lamin&lomin&lamax&lomax` - proxies OpenSky's
    `/states/all`, filtered to the map's current viewport. Adds an
    `airline` field derived from the callsign's ICAO 3-letter prefix
    (see `airlines.py`).
  - `GET /api/satellites` - fetches TLEs from CelesTrak (`stations` +
    `visual` groups, cached 2h), propagates each to the current instant
    with `pyorbital` (SGP4).
  - `GET /api/train-routes` / `GET /api/trains` - `trains.py` downloads
    MBTA's static GTFS once (cached to disk for a week) to draw the
    actual rail/subway route lines, and decodes the live
    `VehiclePositions.pb` GTFS-realtime feed (via Google's official
    `gtfs-realtime-bindings`) for moving train positions.
  - `GET /api/cameras` / `GET /api/camera-image/{id}` - `cameras.py` lists
    official Caltrans/511.org traffic cameras and proxies the actual
    image bytes, so the API token never reaches the browser.
  - The backend exists so the browser never talks to any provider
    directly - avoids CORS issues and keeps every API key server-side.
- **`static/`** - vanilla JS + Leaflet (vendored locally under
  `static/vendor/leaflet/`, no CDN dependency for the map library).
  Polls each source on its own cadence and renders it as its own toggleable
  layer, color-coded and labeled with its provider so it's clear which
  data came from where. Map basemap tiles come from CartoDB's free tile
  service (light/dark, matching your OS theme) - that one call does need
  internet access at runtime, same as the four data APIs.

## Notes

- OpenSky is crowdsourced/anonymous-access - expect coverage gaps; don't
  poll faster than the interval already set here.
- The satellite list is curated (~40 well-known objects) rather than the
  full ~10k-object catalog, to keep the map readable.
- Trains cover MBTA (Boston) only - subway/light rail + commuter rail.
  Other agencies (SNCF, Deutsche Bahn, UK rail) are cataloged in
  `../data/sources.csv` but need their own free API keys to wire up the
  same way; ask if you want one added.
- Cameras cover the Bay Area/California via 511.org only, per the same
  scoping as the catalog: official government traffic-camera programs
  only, never general/private CCTV.
- If any provider fails (offline, down, rate limited, camera token
  missing), the affected layer/status line says so explicitly instead of
  silently going stale.

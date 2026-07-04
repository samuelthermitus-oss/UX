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

Flights, satellites, and trains work with no signup, but OpenSky's
anonymous access is rate-limited hard enough that you'll likely see
`flights: OpenSky Network unreachable: 429 ...` within a few requests,
especially over a wide map view. Registering a free OpenSky account fixes
this - see below.

## Fixing flight rate-limiting (recommended)

Anonymous OpenSky requests get a very small quota and are throttled
per-request. A free account with an API client gets a much higher one:

1. Register at <https://opensky-network.org/index.php> (free).
2. Log in, go to your account page, and create an **API Client**
   (OAuth2 client credentials) - this gives you a client ID and secret.
3. Run the server with both set:
   ```bash
   OPENSKY_CLIENT_ID=your-client-id OPENSKY_CLIENT_SECRET=your-client-secret python3 server.py
   ```

Without these, the app still works exactly as before (anonymous access) -
you'll just hit 429s sooner, especially zoomed out over a wide area.
Zooming in to a smaller region also helps regardless of auth, since each
query only costs quota for the visible bounding box.

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
    (see `airlines.py`). Authenticates via `opensky_auth.py` (OAuth2
    client-credentials, cached bearer token) when `OPENSKY_CLIENT_ID`
    / `OPENSKY_CLIENT_SECRET` are set, otherwise falls back to
    anonymous access.
  - `GET /api/flight-route/{icao24}` - `flight_routes.py` looks up a
    single aircraft's recent origin/destination via OpenSky's
    `/flights/aircraft` history endpoint (not included in live state
    vectors), cached per aircraft and fetched lazily/throttled by the
    frontend rather than for every visible flight at once.
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

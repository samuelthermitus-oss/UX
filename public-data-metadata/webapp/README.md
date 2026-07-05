# Live Sky, Rail & Roads

A real-time dashboard: live aircraft (OpenSky Network), live satellite
ground tracks (CelesTrak, SGP4-propagated), live trains (MBTA), and
official public traffic cameras - still-image snapshots from WSDOT
(Washington State) and actual live HLS video from 511NY (New York State)
- on one map. Every marker is labeled with the provider it actually came
from. This is a real running app, not a static page — it makes live
network calls, so it runs on your machine rather than as a shared link.

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

The Cameras layer combines two independent sources - either or both can
be enabled, and each shows its own setup message if missing:

**WSDOT (Washington) - still-image snapshots, instant signup:**

1. Get a free Access Code at <https://wsdot.wa.gov/traffic/api/> - enter
   your email, the code is shown immediately.
2. Run the server with it set:
   ```bash
   WSDOT_ACCESS_CODE=your-access-code-here python3 server.py
   ```

**511NY (New York) - actual live HLS video, approval required:**

1. Create a regular account at <https://511ny.org/>.
2. Log in, submit a Developer Access Request (you'll need to accept
   NYSDOT's Developer Access Agreement) at
   <https://511ny.org/developers/help>.
3. Wait for approval - NYSDOT emails you a key once granted; this is
   *not* instant like WSDOT.
4. Run the server with it set:
   ```bash
   NY511_API_KEY=your-key-here python3 server.py
   ```

Both can be set at once. Without either, every other layer still works —
the Cameras panel just shows a message per missing source instead of
erroring.

Note: this originally targeted 511.org (Bay Area), matching the catalog's
`cam-001` entry, but 511.org's actual public Open Data API turned out to
only cover Traffic Events, Toll Data, and WZDx - no camera/CCTV endpoint
exists despite their website showing camera imagery in its own UI. Fixed
to use WSDOT (`cam-002`), whose `GetCamerasAsJson` endpoint is confirmed
real, then extended with 511NY (`cam-004`) for actual live video - the
only source in the catalog that offers a video stream rather than a
still-image snapshot. The catalog's 511.org entry has been corrected to
note the missing camera endpoint.

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
  - `GET /api/cameras` combines both camera sources: `cameras.py` (WSDOT
    snapshots, proxying the actual image bytes through
    `GET /api/camera-image/{id}` so the Access Code never reaches the
    browser) and `ny_cameras.py` (511NY - the HLS stream URL itself
    carries no key, so it's handed to the browser directly for
    `hls.js`/native playback). Each source reports its own
    configured/error state independently, so one being unavailable
    doesn't hide the other.
  - The backend exists so the browser never talks to any provider
    directly - avoids CORS issues and keeps every API key server-side.
- **`static/`** - vanilla JS + Leaflet (vendored locally under
  `static/vendor/leaflet/`, no CDN dependency for the map library) plus
  `hls.js` (vendored under `static/vendor/hls/`) for playing 511NY's live
  video in browsers without native HLS support (Safari plays it natively
  instead). Polls each source on its own cadence and renders it as its
  own toggleable layer, color-coded and labeled with its provider so it's
  clear which data came from where. Map basemap tiles come from CartoDB's
  free tile service (light/dark, matching your OS theme) - that one call
  does need internet access at runtime, same as the data APIs.
  - **Bottom card carousel** - a swipeable row of cards, one per
    currently-visible entity across all four categories (respecting
    active toggles/search). Clicking a card pans the map to it and opens
    the same detail panel a marker click would; the active card stays
    highlighted while its detail panel is open.
  - **Flight route line** - when a flight's origin/destination airports
    are known (see `airports.py`, which now carries coordinates for its
    curated airport list) and both have coordinates, opening that
    flight's detail draws a dashed line from origin through the plane's
    current position to a distinct target-pin marker at the destination.
    Cleared automatically when the panel switches to something else.

## Notes

- OpenSky is crowdsourced/anonymous-access - expect coverage gaps; don't
  poll faster than the interval already set here.
- The satellite list is curated (~40 well-known objects) rather than the
  full ~10k-object catalog, to keep the map readable.
- Trains cover MBTA (Boston) only - subway/light rail + commuter rail.
  Other agencies (SNCF, Deutsche Bahn, UK rail) are cataloged in
  `../data/sources.csv` but need their own free API keys to wire up the
  same way; ask if you want one added.
- Cameras cover Washington State (WSDOT, snapshots) and New York State
  (511NY, live video), per the same scoping as the catalog: official
  government traffic-camera programs only, never general/private CCTV.
  A wider search turned up no other free/official source offering actual
  video (as opposed to snapshots) - the only alternatives found were
  commercial/licensed (e.g. TrafficLand) or unofficial scraped camera
  lists, neither of which fit this project's sourcing bar.
- If any provider fails (offline, down, rate limited, camera code
  missing), the affected layer/status line says so explicitly instead of
  silently going stale.

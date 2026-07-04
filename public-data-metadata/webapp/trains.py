"""Live train routes + vehicle positions from the MBTA (Boston), one of the
few transit agencies that publishes both static GTFS and GTFS-realtime
vehicle positions with no API key required.

- Static GTFS (routes.txt, trips.txt, shapes.txt) gives us the physical
  route lines to draw on the map - these barely change, so the parsed
  result is cached to disk.
- GTFS-realtime VehiclePositions.pb gives live train locations, decoded
  with Google's official protobuf bindings.
"""
import csv
import io
import json
import os
import time
import zipfile

import httpx
from google.transit import gtfs_realtime_pb2

MBTA_STATIC_GTFS_URL = "https://cdn.mbta.com/MBTA_GTFS.zip"
MBTA_VEHICLE_POSITIONS_URL = "https://cdn.mbta.com/realtime/VehiclePositions.pb"
PROVIDER = "MBTA (Massachusetts Bay Transportation Authority)"

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
ROUTES_CACHE_PATH = os.path.join(CACHE_DIR, "mbta_routes.json")
STATIC_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # route shapes rarely change

# Rail only (light rail, subway/metro, commuter rail) - keeps the map to
# actual "train" routes rather than MBTA's much larger bus network.
RAIL_ROUTE_TYPES = {"0", "1", "2"}  # GTFS route_type: 0 tram, 1 subway/metro, 2 rail

_route_cache = {"fetched_at": 0.0, "routes": [], "trip_to_route": {}}


def _read_csv_from_zip(zf, name):
    with zf.open(name) as f:
        text = f.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def _build_static_index(zip_bytes):
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))

    routes_by_id = {}
    for row in _read_csv_from_zip(zf, "routes.txt"):
        if row.get("route_type") not in RAIL_ROUTE_TYPES:
            continue
        routes_by_id[row["route_id"]] = {
            "route_id": row["route_id"],
            "name": row.get("route_long_name") or row.get("route_short_name") or row["route_id"],
            "color": f"#{row['route_color']}" if row.get("route_color") else "#8b98a9",
        }

    trip_to_route = {}
    trip_to_shape = {}
    for row in _read_csv_from_zip(zf, "trips.txt"):
        if row["route_id"] not in routes_by_id:
            continue
        trip_to_route[row["trip_id"]] = row["route_id"]
        if row.get("shape_id"):
            trip_to_shape[row["trip_id"]] = row["shape_id"]

    # pick the longest shape per route as its representative line
    shape_to_route = {}
    for trip_id, shape_id in trip_to_shape.items():
        route_id = trip_to_route.get(trip_id)
        if route_id:
            shape_to_route.setdefault(shape_id, route_id)

    shape_points = {}  # shape_id -> list of (seq, lat, lon)
    for row in _read_csv_from_zip(zf, "shapes.txt"):
        shape_id = row["shape_id"]
        if shape_id not in shape_to_route:
            continue
        shape_points.setdefault(shape_id, []).append((
            int(row["shape_pt_sequence"]),
            float(row["shape_pt_lat"]),
            float(row["shape_pt_lon"]),
        ))

    longest_shape_per_route = {}  # route_id -> (point_count, shape_id)
    for shape_id, points in shape_points.items():
        route_id = shape_to_route[shape_id]
        n = len(points)
        best = longest_shape_per_route.get(route_id)
        if best is None or n > best[0]:
            longest_shape_per_route[route_id] = (n, shape_id)

    routes = []
    for route_id, route in routes_by_id.items():
        best = longest_shape_per_route.get(route_id)
        if not best:
            continue
        points = sorted(shape_points[best[1]], key=lambda p: p[0])
        routes.append({
            "route_id": route_id,
            "name": route["name"],
            "color": route["color"],
            "provider": PROVIDER,
            "coordinates": [[lat, lon] for _, lat, lon in points],
        })

    return routes, trip_to_route


async def get_train_routes():
    """Static route shapes, cached on disk for a week."""
    now = time.time()
    if _route_cache["routes"] and now - _route_cache["fetched_at"] < STATIC_CACHE_TTL_SECONDS:
        return _route_cache["routes"], _route_cache["trip_to_route"]

    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(ROUTES_CACHE_PATH) and now - os.path.getmtime(ROUTES_CACHE_PATH) < STATIC_CACHE_TTL_SECONDS:
        with open(ROUTES_CACHE_PATH, encoding="utf-8") as f:
            cached = json.load(f)
        _route_cache.update(fetched_at=now, routes=cached["routes"], trip_to_route=cached["trip_to_route"])
        return _route_cache["routes"], _route_cache["trip_to_route"]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(MBTA_STATIC_GTFS_URL)
        resp.raise_for_status()
        zip_bytes = resp.content

    routes, trip_to_route = _build_static_index(zip_bytes)
    with open(ROUTES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"routes": routes, "trip_to_route": trip_to_route}, f)

    _route_cache.update(fetched_at=now, routes=routes, trip_to_route=trip_to_route)
    return routes, trip_to_route


async def get_live_vehicles():
    """Live train positions decoded from the GTFS-realtime feed."""
    routes, trip_to_route = await get_train_routes()
    routes_by_id = {r["route_id"]: r for r in routes}

    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(MBTA_VEHICLE_POSITIONS_URL)
        resp.raise_for_status()
        raw = resp.content

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(raw)

    vehicles = []
    for entity in feed.entity:
        if not entity.HasField("vehicle"):
            continue
        v = entity.vehicle
        trip_id = v.trip.trip_id if v.HasField("trip") else None
        route_id = trip_to_route.get(trip_id) or (v.trip.route_id if v.HasField("trip") and v.trip.route_id else None)
        route = routes_by_id.get(route_id)
        if not route:
            continue  # not a rail route we're tracking (e.g. a bus)
        if not v.HasField("position"):
            continue
        vehicles.append({
            "vehicle_id": v.vehicle.id if v.HasField("vehicle") and v.vehicle.id else entity.id,
            "label": v.vehicle.label if v.HasField("vehicle") and v.vehicle.label else None,
            "route_id": route_id,
            "route_name": route["name"],
            "route_color": route["color"],
            "provider": PROVIDER,
            "lat": v.position.latitude,
            "lon": v.position.longitude,
            "bearing": v.position.bearing if v.position.HasField("bearing") else None,
            "status": gtfs_realtime_pb2.VehiclePosition.VehicleStopStatus.Name(v.current_status)
            if v.HasField("current_status") else None,
        })

    return vehicles

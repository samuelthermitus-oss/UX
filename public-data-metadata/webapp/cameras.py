"""Official public traffic camera feed - 511.org (Bay Area / Caltrans),
one of the catalog's `traffic-cameras` sources. Deliberately not a general
CCTV index: only official government-operated traffic camera programs.

511.org requires a free API token (instant self-serve signup, no approval
wait) at https://511.org/open-data/token - read from the TRAFFIC_511_TOKEN
environment variable. Without it, the endpoint reports itself as
unconfigured rather than failing, so the rest of the app still works.
"""
import time

import httpx

PROVIDER = "511.org / Caltrans (California)"
CAMERA_LIST_URL = "https://api.511.org/traffic/cameras"
LIST_CACHE_TTL_SECONDS = 5 * 60

_camera_cache = {"fetched_at": 0.0, "cameras": []}
_image_url_by_id = {}


def is_configured(token):
    return bool(token)


async def get_cameras(token):
    now = time.time()
    if _camera_cache["cameras"] and now - _camera_cache["fetched_at"] < LIST_CACHE_TTL_SECONDS:
        return _camera_cache["cameras"]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(CAMERA_LIST_URL, params={"api_key": token, "format": "json"})
        resp.raise_for_status()
        payload = resp.json()

    cameras = []
    for station in payload:
        try:
            lat = float(station["Latitude"])
            lon = float(station["Longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        cctv_list = station.get("Cctv") or []
        for cam in cctv_list:
            image_url = cam.get("Url")
            if not image_url:
                continue
            cam_id = cam.get("Index") or f"{station.get('Id')}-{len(cameras)}"
            _image_url_by_id[cam_id] = image_url
            cameras.append({
                "id": cam_id,
                "name": station.get("Name") or cam_id,
                "lat": lat,
                "lon": lon,
                "provider": PROVIDER,
            })

    _camera_cache.update(fetched_at=now, cameras=cameras)
    return cameras


def image_url_for(camera_id):
    return _image_url_by_id.get(camera_id)

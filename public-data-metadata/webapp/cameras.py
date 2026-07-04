"""Official public traffic camera feed - WSDOT (Washington State DOT),
one of the catalog's `traffic-cameras` sources. Deliberately not a general
CCTV index: only official government-operated traffic camera programs.

WSDOT requires a free Access Code (instant self-serve signup, no approval
wait) at https://wsdot.wa.gov/traffic/api/ - read from the
WSDOT_ACCESS_CODE environment variable. Without it, the endpoint reports
itself as unconfigured rather than failing, so the rest of the app still
works.

Endpoint and response schema confirmed against WSDOT's own operation
reference (wsdot.wa.gov/traffic/api/HighwayCameras/HighwayCamerasREST.svc/
help/operations/GetCamerasAsJson) and a working third-party client library,
after an earlier build of this file guessed at a 511.org camera endpoint
that turned out not to exist.
"""
import time

import httpx

PROVIDER = "WSDOT (Washington State Department of Transportation)"
CAMERA_LIST_URL = "https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson"
LIST_CACHE_TTL_SECONDS = 5 * 60

_camera_cache = {"fetched_at": 0.0, "cameras": []}
_image_url_by_id = {}


def is_configured(access_code):
    return bool(access_code)


async def get_cameras(access_code):
    now = time.time()
    if _camera_cache["cameras"] and now - _camera_cache["fetched_at"] < LIST_CACHE_TTL_SECONDS:
        return _camera_cache["cameras"]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(CAMERA_LIST_URL, params={"AccessCode": access_code})
        resp.raise_for_status()
        payload = resp.json()

    cameras = []
    for cam in payload:
        if not cam.get("IsActive", True):
            continue
        lat = cam.get("DisplayLatitude") or (cam.get("CameraLocation") or {}).get("Latitude")
        lon = cam.get("DisplayLongitude") or (cam.get("CameraLocation") or {}).get("Longitude")
        image_url = cam.get("ImageURL")
        if lat is None or lon is None or not image_url:
            continue
        cam_id = f"wsdot-{cam.get('CameraID')}"
        _image_url_by_id[cam_id] = image_url
        cameras.append({
            "id": cam_id,
            "name": cam.get("Title") or cam_id,
            "lat": float(lat),
            "lon": float(lon),
            "provider": PROVIDER,
            "media": {"type": "image", "proxy_url": f"/api/camera-image/{cam_id}"},
        })

    _camera_cache.update(fetched_at=now, cameras=cameras)
    return cameras


def image_url_for(camera_id):
    return _image_url_by_id.get(camera_id)

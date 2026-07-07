"""Official public traffic cameras - 511NY (New York State DOT).

Unlike WSDOT, 511NY's camera API actually includes a live HLS video stream
URL per camera (`VideoUrl`, e.g. an .m3u8 playlist served directly from
NYSDOT's own streaming CDN) alongside a webpage link (`Url`) - confirmed
against 511NY's own API documentation and third-party integration write-ups
before writing this, same as the WSDOT fix. The stream URL itself carries
no embedded key, so the frontend can play it directly; only the camera
*list* needs the API key, which stays server-side.

511NY requires a free but *not instant* API key: you need a regular
511NY account, then a separate Developer Access Request (with an
agreement to accept) that's approved by NYSDOT before you get a key by
email - read from the NY511_API_KEY environment variable. Without it, the
endpoint reports itself as unconfigured rather than failing.
"""
import time

import httpx

PROVIDER = "511NY (New York State DOT)"
CAMERA_LIST_URL = "https://511ny.org/api/getcameras"
LIST_CACHE_TTL_SECONDS = 5 * 60

_camera_cache = {"fetched_at": 0.0, "cameras": []}


def is_configured(api_key):
    return bool(api_key)


async def get_cameras(api_key):
    now = time.time()
    if _camera_cache["cameras"] and now - _camera_cache["fetched_at"] < LIST_CACHE_TTL_SECONDS:
        return _camera_cache["cameras"]

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(CAMERA_LIST_URL, params={"key": api_key, "format": "json"})
        resp.raise_for_status()
        payload = resp.json()

    cameras = []
    for cam in payload:
        if cam.get("Disabled") or cam.get("Blocked"):
            continue
        lat, lon = cam.get("Latitude"), cam.get("Longitude")
        video_url = cam.get("VideoUrl")
        if lat is None or lon is None or not video_url:
            continue
        cameras.append({
            "id": f"ny-{cam.get('ID')}",
            "name": cam.get("Name") or cam.get("RoadwayName") or "NYSDOT camera",
            "lat": float(lat),
            "lon": float(lon),
            "provider": PROVIDER,
            "media": {"type": "video", "stream_url": video_url, "page_url": cam.get("Url")},
        })

    _camera_cache.update(fetched_at=now, cameras=cameras)
    return cameras

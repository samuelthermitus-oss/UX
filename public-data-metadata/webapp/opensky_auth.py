"""Optional OAuth2 client-credentials auth for OpenSky Network.

Anonymous access to OpenSky's REST API is rate-limited hard enough that
even light use (a couple of viewport-sized queries) can trip a 429.
Registering a free account and creating an "API Client" gives a much
higher quota - this module fetches and caches the resulting bearer token,
and is a no-op (falls back to anonymous access) if no credentials are
configured.
"""
import os
import time

import httpx

TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
CLIENT_ID = os.environ.get("OPENSKY_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("OPENSKY_CLIENT_SECRET", "")
TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 30

_token_cache = {"access_token": None, "expires_at": 0.0}


def is_configured():
    return bool(CLIENT_ID and CLIENT_SECRET)


async def get_auth_headers():
    """Returns {"Authorization": "Bearer ..."} or {} when not configured."""
    if not is_configured():
        return {}

    now = time.time()
    if _token_cache["access_token"] and now < _token_cache["expires_at"] - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS:
        return {"Authorization": f"Bearer {_token_cache['access_token']}"}

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.post(TOKEN_URL, data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        })
        resp.raise_for_status()
        payload = resp.json()

    _token_cache["access_token"] = payload["access_token"]
    _token_cache["expires_at"] = now + payload.get("expires_in", 30 * 60)
    return {"Authorization": f"Bearer {_token_cache['access_token']}"}

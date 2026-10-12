#!/usr/bin/env python3
"""Quest Lock control server.

Headsets poll this server to learn whether they are locked and which games
they may open. Staff use the dashboard at / to unlock headsets for N minutes,
lock them early, and generate one-time unlock codes to sell to customers.

Standard library only. Configure with environment variables:

    QL_ADMIN_TOKEN   token the dashboard / admin API must send   (required)
    QL_DEVICE_KEY    shared secret every headset sends            (required)
    QL_PORT          listen port                                  (default 8787)
    QL_DATA          path of the JSON state file                  (default ./questlock.json)
"""

import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ADMIN_TOKEN = os.environ.get("QL_ADMIN_TOKEN", "")
DEVICE_KEY = os.environ.get("QL_DEVICE_KEY", "")
PORT = int(os.environ.get("QL_PORT", "8787"))
DATA_PATH = Path(os.environ.get("QL_DATA", "questlock.json"))
DASHBOARD = Path(__file__).with_name("dashboard.html")

MAX_MINUTES = 24 * 60
DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$")


class Store:
    """JSON-file backed state, guarded by a single lock."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.state = {"devices": {}, "codes": {}, "allowed_packages": []}
        if path.exists():
            self.state.update(json.loads(path.read_text()))

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, indent=2))
        tmp.replace(self.path)

    def device(self, device_id):
        devices = self.state["devices"]
        if device_id not in devices:
            devices[device_id] = {
                "name": device_id,
                "unlocked_until": 0,
                "last_seen": 0,
                "allowed_packages": None,  # None = use the global list
            }
        return devices[device_id]

    def extend(self, device_id, minutes):
        dev = self.device(device_id)
        now = time.time()
        dev["unlocked_until"] = max(dev["unlocked_until"], now) + minutes * 60
        return dev


store = Store(DATA_PATH)


def device_view(device_id, dev, now):
    remaining = max(0, int(dev["unlocked_until"] - now))
    allowed = dev["allowed_packages"]
    return {
        "id": device_id,
        "name": dev["name"],
        "locked": remaining == 0,
        "remaining_seconds": remaining,
        "unlocked_until": dev["unlocked_until"],
        "last_seen": dev["last_seen"],
        "online": now - dev["last_seen"] < 30,
        "allowed_packages": allowed if allowed is not None else store.state["allowed_packages"],
        "uses_global_packages": allowed is None,
    }


def clean_minutes(value):
    minutes = int(value)
    if not 1 <= minutes <= MAX_MINUTES:
        raise ValueError(f"minutes must be between 1 and {MAX_MINUTES}")
    return minutes


def clean_packages(value):
    if not isinstance(value, list) or not all(isinstance(p, str) and PACKAGE_RE.match(p) for p in value):
        raise ValueError("allowed_packages must be a list of Android package names")
    return sorted(set(value))


class Handler(BaseHTTPRequestHandler):
    server_version = "QuestLock/1.0"

    # ---- helpers -------------------------------------------------------

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 64 * 1024:
            raise ValueError("body too large")
        if not length:
            return {}
        data = json.loads(self.rfile.read(length))
        if not isinstance(data, dict):
            raise ValueError("body must be a JSON object")
        return data

    def is_admin(self):
        auth = self.headers.get("Authorization", "")
        return auth.startswith("Bearer ") and hmac.compare_digest(auth[7:], ADMIN_TOKEN)

    def is_device(self):
        return hmac.compare_digest(self.headers.get("X-Device-Key", ""), DEVICE_KEY)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    # ---- routing -------------------------------------------------------

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def dispatch(self, method):
        url = urlparse(self.path)
        parts = [p for p in url.path.split("/") if p]
        try:
            if method == "GET" and not parts:
                return self.dashboard()
            if parts[:2] == ["api", "device"]:
                if not self.is_device():
                    return self.send_json(401, {"error": "bad device key"})
                return self.device_api(method, parts[2:], parse_qs(url.query))
            if parts[:2] == ["api", "admin"]:
                if not self.is_admin():
                    return self.send_json(401, {"error": "bad admin token"})
                return self.admin_api(method, parts[2:])
            self.send_json(404, {"error": "not found"})
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": str(exc)})

    def dashboard(self):
        body = DASHBOARD.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- headset API ---------------------------------------------------

    def device_api(self, method, parts, query):
        if method == "GET" and parts == ["status"]:
            device_id = query.get("id", [""])[0]
            if not DEVICE_ID_RE.match(device_id):
                raise ValueError("invalid device id")
            with store.lock:
                dev = store.device(device_id)
                now = time.time()
                dev["last_seen"] = now
                store.save()
                return self.send_json(200, device_view(device_id, dev, now))

        if method == "POST" and parts == ["redeem"]:
            data = self.read_json()
            device_id = str(data.get("id", ""))
            code = str(data.get("code", "")).strip().upper()
            if not DEVICE_ID_RE.match(device_id):
                raise ValueError("invalid device id")
            with store.lock:
                entry = store.state["codes"].get(code)
                if not entry or entry["used_by"]:
                    return self.send_json(403, {"error": "invalid or already used code"})
                entry["used_by"] = device_id
                entry["used_at"] = time.time()
                dev = store.extend(device_id, entry["minutes"])
                store.save()
                return self.send_json(200, device_view(device_id, dev, time.time()))

        self.send_json(404, {"error": "not found"})

    # ---- staff API -----------------------------------------------------

    def admin_api(self, method, parts):
        now = time.time()
        with store.lock:
            if method == "GET" and parts == ["devices"]:
                devices = store.state["devices"]
                return self.send_json(200, {
                    "devices": [device_view(i, d, now) for i, d in sorted(devices.items())],
                    "allowed_packages": store.state["allowed_packages"],
                })

            if len(parts) == 3 and parts[0] == "devices" and method == "POST":
                device_id, action = parts[1], parts[2]
                if device_id not in store.state["devices"]:
                    return self.send_json(404, {"error": "unknown device"})
                data = self.read_json()
                dev = store.device(device_id)
                if action == "unlock":
                    store.extend(device_id, clean_minutes(data.get("minutes", 0)))
                elif action == "lock":
                    dev["unlocked_until"] = 0
                elif action == "update":
                    if "name" in data:
                        dev["name"] = str(data["name"])[:64] or device_id
                    if "allowed_packages" in data:
                        pkgs = data["allowed_packages"]
                        dev["allowed_packages"] = None if pkgs is None else clean_packages(pkgs)
                else:
                    return self.send_json(404, {"error": "unknown action"})
                store.save()
                return self.send_json(200, device_view(device_id, dev, now))

            if method == "PUT" and parts == ["settings"]:
                data = self.read_json()
                store.state["allowed_packages"] = clean_packages(data.get("allowed_packages", []))
                store.save()
                return self.send_json(200, {"allowed_packages": store.state["allowed_packages"]})

            if parts == ["codes"]:
                codes = store.state["codes"]
                if method == "POST":
                    data = self.read_json()
                    minutes = clean_minutes(data.get("minutes", 0))
                    count = int(data.get("count", 1))
                    if not 1 <= count <= 100:
                        raise ValueError("count must be between 1 and 100")
                    created = []
                    for _ in range(count):
                        code = new_code(codes)
                        codes[code] = {"minutes": minutes, "created_at": now, "used_by": None, "used_at": None}
                        created.append(code)
                    store.save()
                    return self.send_json(200, {"created": created, "minutes": minutes})
                if method == "GET":
                    rows = [{"code": c, **v} for c, v in codes.items()]
                    rows.sort(key=lambda r: r["created_at"], reverse=True)
                    return self.send_json(200, {"codes": rows[:200]})

        self.send_json(404, {"error": "not found"})


def new_code(existing):
    # No 0/O/1/I so codes are easy to read aloud and type in VR.
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if code not in existing:
            return code


def main():
    if not ADMIN_TOKEN or not DEVICE_KEY:
        sys.exit("Set QL_ADMIN_TOKEN and QL_DEVICE_KEY before starting the server.")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Quest Lock server on http://0.0.0.0:{PORT}  (state: {DATA_PATH.resolve()})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

# Quest Lock

A pay-to-play lock screen for Meta Quest 2 headsets, plus a small server and staff dashboard.

- The headset opens to a **"Headset locked"** screen: the customer types an unlock code, or staff unlock it from the dashboard.
- Once unlocked, the screen shows a **countdown** and **only the games you allow**.
- When time runs out, the headset **locks again**: games are closed and the lock screen comes back. This works even if the Wi-Fi drops mid-session.

```
quest-lock/
├── server/                 Python 3, standard library only
│   ├── server.py           headset API + staff API + JSON state file
│   └── dashboard.html      staff dashboard (served at /)
└── android/                Kotlin Android app (no third-party libraries)
    └── app/src/main/java/com/questlock/kiosk/
        ├── LockActivity.kt    lock screen, code entry, game picker, staff settings
        ├── LockService.kt     foreground service: polls server every 5 s, ticks the timer
        ├── LockController.kt  locked/unlocked state, offline countdown, enforcement
        ├── Kiosk.kt           device-owner powers: lock task mode, suspending games
        ├── ServerClient.kt    HTTP client for server.py
        ├── Config.kt          server URL, device key, device id
        ├── AdminReceiver.kt   device admin (needed for device owner)
        └── BootReceiver.kt    start the lock screen after boot
```

## 1. Run the server

On any computer on the same network as the headsets:

```bash
cd quest-lock/server
export QL_ADMIN_TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
export QL_DEVICE_KEY="$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
echo "admin: $QL_ADMIN_TOKEN   device key: $QL_DEVICE_KEY"
python3 server.py            # listens on :8787, state in ./questlock.json
```

Open `http://<computer-ip>:8787`, sign in with the admin token, and under **Allowed games** list the package names of the games customers may play. To find them, run this with a headset plugged in:
`adb shell pm list packages -3`.

The server speaks plain HTTP. That's fine on a private shop LAN. If it's reachable from the internet, put it behind HTTPS (Caddy, nginx, Cloudflare Tunnel).

## 2. Build and install the headset app

You need Android Studio, or the Android SDK plus Gradle 8.7 or newer.

```bash
cd quest-lock/android
gradle wrapper           # one time; or just open the folder in Android Studio
./gradlew assembleRelease \
  -PquestLockServerUrl=http://192.168.1.20:8787 \
  -PquestLockDeviceKey="$QL_DEVICE_KEY" \
  -PquestLockStaffPin=4826
adb install -r app/build/outputs/apk/release/app-release.apk
```

To sideload, turn on developer mode for the headset in the Meta Horizon phone app. Then connect it over USB and accept the prompt in the headset.

The first time the app runs, the headset shows up on the dashboard as `quest-xxxxxxxx`. Use **Rename** to give it a name like "Bay 3".

**Staff settings on the headset:** long-press the title and enter the staff PIN. From there you can change the server URL and key, see the device ID, or tap **Exit kiosk** for maintenance.

## 3. Lock it down (pick one)

How hard the headset is to escape depends on how much control the app gets.

### A. MDM kiosk mode (recommended)

Use a Quest MDM such as ManageXR, ArborXR, or Meta Horizon managed services. Push the APK and set **Quest Lock as the kiosk app**, so the headset boots into it and the Meta button can't leave it. If the MDM can make it the device owner, or lets you allowlist apps in kiosk mode, add the allowed games there too.

### B. Device owner via adb (full control, fiddly on Quest)

```bash
adb shell dpm set-device-owner com.questlock.kiosk/.AdminReceiver
```

As device owner, the app:

- pins itself with Android **lock task mode**, so the system menu is blocked,
- lets only the allowed games run inside the lock task,
- **suspends** every allowed game while locked. Suspending closes a running game and blocks it from launching, even from the Quest library.

Android refuses this command if the device already has accounts on it, and a Quest always has a Meta account. So it usually works only on a freshly reset headset, or through an MDM/enterprise enrollment. Undo it with **Exit kiosk** and then
`adb shell dpm remove-active-admin com.questlock.kiosk/.AdminReceiver`.

### C. Soft mode (no MDM, no device owner)

```bash
adb shell appops set com.questlock.kiosk SYSTEM_ALERT_WINDOW allow
```

This lets the app bring its lock screen back on top of a game when time runs out. While the headset is locked, it also reopens the lock screen within about 3 seconds if anything else comes to the front. Games are paused behind the lock screen, not closed. A determined user can still reach the Quest menu, so use A or B for public-facing headsets.

## How the timer works

- The server stores `unlocked_until` per headset. Staff **+15/+30/+60 min** and redeemed codes add time to it. **Lock now** sets it to zero.
- Every 5 seconds the headset asks the server for `remaining_seconds`. It turns that into a deadline on the headset's own monotonic clock, so a wrong clock on either side doesn't matter.
- The headset counts down on its own and **locks at the deadline even when offline**. After a reboot it starts locked until the server says otherwise, so it fails closed.
- Customers get a one-minute warning toast.

## Selling time

**Unlock codes** on the dashboard generate one-time codes, e.g. `7KQ4MZ` = 30 minutes. Sell them at the counter or print them on receipts. Codes avoid 0/O/1/I so they are easy to type in VR.

To take payments online, have your payment provider's webhook (Stripe Checkout, Square, etc.) call `POST /api/admin/devices/<id>/unlock` with `{"minutes": N}` and the admin token. You could also have it create a code and show it to the customer.

## API reference

Headset endpoints need the header `X-Device-Key: <QL_DEVICE_KEY>`. Admin endpoints need `Authorization: Bearer <QL_ADMIN_TOKEN>`.

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/device/status?id=<id>` | | Check in, get lock state, time left, allowed packages |
| POST | `/api/device/redeem` | `{"id", "code"}` | Redeem a one-time code |
| GET | `/api/admin/devices` | | List headsets |
| POST | `/api/admin/devices/<id>/unlock` | `{"minutes": 30}` | Add time |
| POST | `/api/admin/devices/<id>/lock` | | End session now |
| POST | `/api/admin/devices/<id>/update` | `{"name"?, "allowed_packages"?}` | Rename, or set a per-headset game list (`null` = use the global list) |
| PUT | `/api/admin/settings` | `{"allowed_packages": [...]}` | Global game list |
| POST | `/api/admin/codes` | `{"minutes", "count"}` | Generate codes |
| GET | `/api/admin/codes` | | Recent codes |

const FLIGHT_POLL_MS = 15000;
const SAT_POLL_MS = 6000;
const TRAIN_POLL_MS = 10000;
const CAMERA_POLL_MS = 20000;
// WSDOT's own cameras only refresh their source image roughly every
// 1-2 minutes (this is a still-image API, not live video - there is no
// free/official live traffic camera video feed). Polling faster than
// that just wastes requests without ever showing a newer picture.
const CAMERA_IMAGE_REFRESH_MS = 90000;
const MOVE_DEBOUNCE_MS = 800;

const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const map = L.map("map", { worldCopyJump: true }).setView([50, 10], 5);

const tileLayers = {
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd",
  }),
  light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd",
  }),
};
let currentTiles = isDark() ? tileLayers.dark : tileLayers.light;
currentTiles.addTo(map);

function refreshTileTheme() {
  const wantDark = isDark();
  const wanted = wantDark ? tileLayers.dark : tileLayers.light;
  if (wanted !== currentTiles) {
    map.removeLayer(currentTiles);
    currentTiles = wanted;
    currentTiles.addTo(map);
  }
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshTileTheme);
new MutationObserver(refreshTileTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

const flightLayer = L.layerGroup().addTo(map);
const satLayer = L.layerGroup().addTo(map);
const trainRouteLayer = L.layerGroup().addTo(map);
const trainLayer = L.layerGroup().addTo(map);
const cameraLayer = L.layerGroup().addTo(map);

let flightMarkers = new Map();  // icao24 -> {marker, data}
let satMarkers = new Map();     // name -> {marker, data}
let trainMarkers = new Map();   // vehicle_id -> {marker, data}
let cameraMarkers = new Map();  // id -> {marker, data}
let query = "";
let openCameraId = null;
let cameraImageTimer = null;
let currentHls = null;
let openDetail = null; // {kind, id} of whatever's shown in the detail panel

const categoryChips = document.getElementById("categoryChips");

const connDot = document.getElementById("connDot");
const connLabel = document.getElementById("connLabel");
const statusLine = document.getElementById("statusLine");
const cameraNotice = document.getElementById("cameraNotice");
const flightCountEl = document.getElementById("flightCount");
const satCountEl = document.getElementById("satCount");
const trainCountEl = document.getElementById("trainCount");
const cameraCountEl = document.getElementById("cameraCount");
const toggleFlights = document.getElementById("toggleFlights");
const toggleSats = document.getElementById("toggleSats");
const toggleTrains = document.getElementById("toggleTrains");
const toggleCameras = document.getElementById("toggleCameras");
const searchEl = document.getElementById("search");
const detailEl = document.getElementById("detail");

let lastFlightUpdate = null;
let lastSatUpdate = null;
let lastTrainUpdate = null;
let lastCameraUpdate = null;
let flightError = null;
let satError = null;
let trainError = null;
let cameraError = null;
let camerasConfigured = null; // null = unknown yet, true/false once we've asked

function setConn() {
  const anyError = flightError || satError || trainError || cameraError;
  const anyData = lastFlightUpdate || lastSatUpdate || lastTrainUpdate || lastCameraUpdate;
  if (anyError) {
    connDot.className = "dot error";
    connLabel.textContent = "connection issue";
  } else if (anyData) {
    connDot.className = "dot live";
    connLabel.textContent = "live";
  } else {
    connDot.className = "dot";
    connLabel.textContent = "connecting…";
  }
}

function agoText(iso) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 2 ? "just now" : `${s}s ago`;
}

function updateStatusLine() {
  if (flightError) { statusLine.textContent = `flights: ${flightError}`; statusLine.classList.add("error"); return; }
  if (satError) { statusLine.textContent = `satellites: ${satError}`; statusLine.classList.add("error"); return; }
  if (trainError) { statusLine.textContent = `trains: ${trainError}`; statusLine.classList.add("error"); return; }
  if (cameraError) { statusLine.textContent = `cameras: ${cameraError}`; statusLine.classList.add("error"); return; }
  statusLine.classList.remove("error");
  const parts = [`flights ${agoText(lastFlightUpdate)}`, `satellites ${agoText(lastSatUpdate)}`, `trains ${agoText(lastTrainUpdate)}`];
  if (camerasConfigured) parts.push(`cameras ${agoText(lastCameraUpdate)}`);
  statusLine.textContent = parts.join(" · ");
}
setInterval(updateStatusLine, 1000);

function matchesQuery(text) {
  if (!query) return true;
  return text.toLowerCase().includes(query);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// fetch() that surfaces the backend's actual error detail (FastAPI's
// {"detail": "..."} body) instead of just the bare HTTP status code, so
// the on-screen status line says *why* a provider failed, not just that
// it did.
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch {
      // response wasn't JSON - keep the bare status
    }
    throw new Error(detail);
  }
  return res.json();
}

function teardownCameraMedia() {
  clearInterval(cameraImageTimer);
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }
}

function showDetail(kind, color, name, rows, extraHtml, trackId) {
  teardownCameraMedia(); // switching panels stops any playing stream/refresh
  openDetail = trackId ? { kind: kind.toLowerCase(), id: trackId } : null;
  const dl = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  detailEl.innerHTML = `
    <button class="close" aria-label="Close">✕</button>
    <p class="kind" style="color:${color}">${kind}</p>
    <p class="name">${escapeHtml(name)}</p>
    ${extraHtml || ""}
    <dl>${dl}</dl>
  `;
  detailEl.hidden = false;
  detailEl.querySelector(".close").addEventListener("click", () => {
    detailEl.hidden = true;
    openCameraId = null;
    openDetail = null;
    teardownCameraMedia();
  });
}

// ---------- Flights (OpenSky Network) ----------

function planeIcon(heading) {
  const rot = heading || 0;
  return L.divIcon({
    className: "",
    html: `<svg class="plane-icon" width="22" height="22" viewBox="0 0 24 24" style="transform: rotate(${rot}deg)">
      <path fill="currentColor" d="M12 2 L15 10 L22 13 L15 14.5 L14 21 L12 18 L10 21 L9 14.5 L2 13 L9 10 Z"/>
    </svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Route (origin/destination) enrichment - OpenSky's live positions don't
// include this, so it's looked up per-aircraft on a separate, more
// expensive endpoint. Fetched lazily/throttled in the background so a
// crowded viewport doesn't hammer OpenSky's rate limit; always fetched
// immediately (bypassing the queue) when the user actually clicks a flight.
const ROUTE_LOOKUP_INTERVAL_MS = 1500;
const MAX_AUTO_ENRICH_VISIBLE = 80;
let routeQueue = [];
let routeQueued = new Set();
let routeInFlight = false;

function airportLabel(a) {
  if (!a) return null;
  return a.city ? `${a.code} (${a.city})` : a.code;
}

function routeSearchText(route) {
  if (!route || !route.known) return "";
  return [route.origin, route.destination].filter(Boolean)
    .map((a) => `${a.code} ${a.name} ${a.city || ""} ${a.country || ""}`).join(" ");
}

function flightSearchText(d) {
  return `${d.callsign} ${d.country} ${d.airline || ""} ${routeSearchText(d.route)}`;
}

async function fetchRoute(icao24) {
  const entry = flightMarkers.get(icao24);
  if (!entry) return;
  entry.data.route = { pending: true };
  try {
    entry.data.route = await fetchJson(`/api/flight-route/${icao24}`);
  } catch {
    entry.data.route = { known: false };
  }
  applyFilterToExisting();
  if (openDetail && openDetail.kind === "flight" && openDetail.id === icao24) renderFlightDetail(icao24);
}

function processRouteQueue() {
  if (routeInFlight || routeQueue.length === 0) return;
  const icao24 = routeQueue.shift();
  routeQueued.delete(icao24);
  routeInFlight = true;
  fetchRoute(icao24).finally(() => { routeInFlight = false; });
}
setInterval(processRouteQueue, ROUTE_LOOKUP_INTERVAL_MS);

function routeRow(route) {
  if (!route || route.pending) return "Loading…";
  if (!route.known) return "Not recently reported";
  const o = airportLabel(route.origin) || "?";
  const d = airportLabel(route.destination) || "?";
  return `${o} → ${d}`;
}

function renderFlightDetail(icao24) {
  const d = flightMarkers.get(icao24).data;
  if (d.route === undefined) fetchRoute(icao24); // clicked before background queue reached it
  showDetail("Flight", "var(--flight)", d.callsign || d.icao24, [
    ["Airline", d.airline || "Unknown / private"],
    ["Route", routeRow(d.route)],
    ["Country", d.country || "—"],
    ["Altitude", d.altitude_m != null ? `${Math.round(d.altitude_m)} m` : "—"],
    ["Speed", d.velocity_ms != null ? `${Math.round(d.velocity_ms * 3.6)} km/h` : "—"],
    ["Heading", d.heading != null ? `${Math.round(d.heading)}°` : "—"],
    ["Vert. rate", d.vertical_rate_ms != null ? `${d.vertical_rate_ms.toFixed(1)} m/s` : "—"],
    ["ICAO24", d.icao24],
    ["Source", d.provider],
  ], "", icao24);
}

async function pollFlights() {
  const b = map.getBounds();
  const params = new URLSearchParams({
    lamin: b.getSouth(), lomin: b.getWest(), lamax: b.getNorth(), lomax: b.getEast(),
  });
  try {
    const payload = await fetchJson(`/api/flights?${params}`);
    flightError = null;
    lastFlightUpdate = payload.updated;
    renderFlights(payload.flights);
  } catch (err) {
    flightError = err.message || "unreachable";
  }
  setConn();
  updateStatusLine();
}

function renderFlights(flights) {
  const seen = new Set();
  const autoEnrich = flights.length <= MAX_AUTO_ENRICH_VISIBLE;
  for (const f of flights) {
    seen.add(f.icao24);
    const existing = flightMarkers.get(f.icao24);
    if (existing) {
      existing.marker.setLatLng([f.lat, f.lon]);
      existing.marker.setIcon(planeIcon(f.heading));
      existing.data = { ...f, route: existing.data.route }; // keep any route already resolved
      const visible = toggleFlights.checked && matchesQuery(flightSearchText(existing.data));
      if (visible && !flightLayer.hasLayer(existing.marker)) flightLayer.addLayer(existing.marker);
      if (!visible && flightLayer.hasLayer(existing.marker)) flightLayer.removeLayer(existing.marker);
    } else {
      const marker = L.marker([f.lat, f.lon], { icon: planeIcon(f.heading) });
      marker.on("click", () => renderFlightDetail(f.icao24));
      flightMarkers.set(f.icao24, { marker, data: f });
      const visible = toggleFlights.checked && matchesQuery(flightSearchText(f));
      if (visible) flightLayer.addLayer(marker);
      if (autoEnrich && !routeQueued.has(f.icao24)) {
        routeQueued.add(f.icao24);
        routeQueue.push(f.icao24);
      }
    }
  }
  for (const [id, entry] of flightMarkers) {
    if (!seen.has(id)) {
      flightLayer.removeLayer(entry.marker);
      flightMarkers.delete(id);
    }
  }
  flightCountEl.textContent = String(flights.length);
}

// ---------- Satellites (CelesTrak) ----------

function satIcon() {
  return L.divIcon({
    className: "sat-icon",
    html: `<div style="position:relative;width:16px;height:16px">
      <div class="ring" style="position:absolute;inset:0;border:1.5px solid;border-radius:50%;opacity:0.55"></div>
      <div class="core" style="position:absolute;left:5px;top:5px;width:6px;height:6px;border-radius:50%"></div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

async function pollSatellites() {
  try {
    const payload = await fetchJson("/api/satellites");
    satError = null;
    lastSatUpdate = payload.updated;
    renderSatellites(payload.satellites);
  } catch (err) {
    satError = err.message || "unreachable";
  }
  setConn();
  updateStatusLine();
}

function renderSatellites(sats) {
  const seen = new Set();
  for (const s of sats) {
    seen.add(s.name);
    const visible = toggleSats.checked && matchesQuery(s.name);
    const existing = satMarkers.get(s.name);
    if (existing) {
      existing.marker.setLatLng([s.lat, s.lon]);
      existing.data = s;
      if (visible && !satLayer.hasLayer(existing.marker)) satLayer.addLayer(existing.marker);
      if (!visible && satLayer.hasLayer(existing.marker)) satLayer.removeLayer(existing.marker);
    } else {
      const marker = L.marker([s.lat, s.lon], { icon: satIcon() });
      marker.on("click", () => {
        const d = satMarkers.get(s.name).data;
        showDetail("Satellite", "var(--satellite)", d.name, [
          ["Operator", d.operator || "Unlisted"],
          ["Latitude", d.lat.toFixed(2)],
          ["Longitude", d.lon.toFixed(2)],
          ["Altitude", `${Math.round(d.alt_km)} km`],
          ["Source", d.provider],
        ]);
      });
      satMarkers.set(s.name, { marker, data: s });
      if (visible) satLayer.addLayer(marker);
    }
  }
  for (const [id, entry] of satMarkers) {
    if (!seen.has(id)) {
      satLayer.removeLayer(entry.marker);
      satMarkers.delete(id);
    }
  }
  satCountEl.textContent = String(sats.length);
}

// ---------- Trains (MBTA) ----------

function trainIcon(color) {
  return L.divIcon({
    className: "",
    html: `<svg class="train-icon" width="16" height="16" viewBox="0 0 24 24" style="color:${color}">
      <rect x="4" y="3" width="16" height="14" rx="4" fill="currentColor" opacity="0.9"/>
      <rect x="6.5" y="6" width="11" height="5" rx="1" fill="var(--surface)"/>
      <circle cx="8" cy="19" r="1.6" fill="currentColor"/>
      <circle cx="16" cy="19" r="1.6" fill="currentColor"/>
    </svg>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

async function loadTrainRoutes() {
  try {
    const payload = await fetchJson("/api/train-routes");
    for (const route of payload.routes) {
      const line = L.polyline(route.coordinates, {
        color: route.color, weight: 2.5, opacity: 0.75,
      });
      line.bindTooltip(route.name, { sticky: true });
      trainRouteLayer.addLayer(line);
    }
  } catch (err) {
    // static route shapes are cosmetic - live vehicle polling reports the real error
  }
}

async function pollTrains() {
  try {
    const payload = await fetchJson("/api/trains");
    trainError = null;
    lastTrainUpdate = payload.updated;
    renderTrains(payload.trains);
  } catch (err) {
    trainError = err.message || "unreachable";
  }
  setConn();
  updateStatusLine();
}

function renderTrains(vehicles) {
  const seen = new Set();
  for (const v of vehicles) {
    seen.add(v.vehicle_id);
    const visible = toggleTrains.checked && matchesQuery(`${v.route_name} ${v.label || ""}`);
    const existing = trainMarkers.get(v.vehicle_id);
    if (existing) {
      existing.marker.setLatLng([v.lat, v.lon]);
      existing.data = v;
      if (visible && !trainLayer.hasLayer(existing.marker)) trainLayer.addLayer(existing.marker);
      if (!visible && trainLayer.hasLayer(existing.marker)) trainLayer.removeLayer(existing.marker);
    } else {
      const marker = L.marker([v.lat, v.lon], { icon: trainIcon(v.route_color) });
      marker.on("click", () => {
        const d = trainMarkers.get(v.vehicle_id).data;
        showDetail("Train", d.route_color, d.route_name, [
          ["Vehicle", d.label || d.vehicle_id],
          ["Status", (d.status || "—").replaceAll("_", " ").toLowerCase()],
          ["Source", d.provider],
        ]);
      });
      trainMarkers.set(v.vehicle_id, { marker, data: v });
      if (visible) trainLayer.addLayer(marker);
    }
  }
  for (const [id, entry] of trainMarkers) {
    if (!seen.has(id)) {
      trainLayer.removeLayer(entry.marker);
      trainMarkers.delete(id);
    }
  }
  trainCountEl.textContent = String(vehicles.length);
}

// ---------- Traffic cameras (WSDOT snapshots + 511NY live HLS video) ----------

function cameraIcon() {
  return L.divIcon({
    className: "",
    html: `<svg class="camera-icon" width="16" height="16" viewBox="0 0 24 24">
      <path fill="currentColor" d="M4 7a2 2 0 0 1 2-2h3l1.5-2h3L15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>
      <circle cx="12" cy="13" r="3.4" fill="var(--surface)"/>
    </svg>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function openImageCameraDetail(cam) {
  openCameraId = cam.id;
  const imgUrl = () => `${cam.media.proxy_url}?t=${Date.now()}`;
  showDetail(
    "Traffic camera",
    "var(--camera)",
    cam.name,
    [["Source", cam.provider]],
    `<img class="cam-image" id="camImage" src="${imgUrl()}" alt="Snapshot from ${escapeHtml(cam.name)}" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'cam-image-fallback',textContent:'Image unavailable right now.'}))" />
     <p class="cam-caption">Still snapshot, not video - refreshes here every ${Math.round(CAMERA_IMAGE_REFRESH_MS / 1000)}s, matching how often the source image updates.</p>`,
    cam.id
  );
  cameraImageTimer = setInterval(() => {
    if (openCameraId !== cam.id) return clearInterval(cameraImageTimer);
    const img = document.getElementById("camImage");
    if (img) img.src = imgUrl();
  }, CAMERA_IMAGE_REFRESH_MS);
}

function openVideoCameraDetail(cam) {
  openCameraId = cam.id;
  const pageLink = cam.media.page_url
    ? `<a href="${cam.media.page_url}" target="_blank" rel="noopener">Open camera page →</a>` : "";
  showDetail(
    "Traffic camera",
    "var(--camera)",
    cam.name,
    [["Source", cam.provider]],
    `<video class="cam-video" id="camVideo" controls muted autoplay playsinline></video>
     <p class="cam-caption">Live video stream. ${pageLink}</p>
     <p class="cam-caption" id="camVideoError" hidden>Stream didn't load - try the camera page link above instead.</p>`,
    cam.id
  );
  const video = document.getElementById("camVideo");
  const streamUrl = cam.media.stream_url;
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl; // Safari: native HLS support
  } else if (window.Hls && Hls.isSupported()) {
    currentHls = new Hls();
    currentHls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) document.getElementById("camVideoError")?.removeAttribute("hidden");
    });
    currentHls.loadSource(streamUrl);
    currentHls.attachMedia(video);
  } else {
    document.getElementById("camVideoError")?.removeAttribute("hidden");
  }
}

function openCameraDetail(cam) {
  if (cam.media && cam.media.type === "video") openVideoCameraDetail(cam);
  else openImageCameraDetail(cam);
}

async function pollCameras() {
  try {
    const payload = await fetchJson("/api/cameras");
    camerasConfigured = payload.configured;
    if (!payload.configured) {
      cameraError = null;
      cameraNotice.textContent = payload.sources.map((s) => s.message).join(" ");
      cameraNotice.hidden = false;
      cameraCountEl.textContent = "0";
      setConn();
      updateStatusLine();
      return;
    }
    cameraNotice.hidden = true;
    cameraError = null;
    lastCameraUpdate = payload.updated;
    renderCameras(payload.cameras);
  } catch (err) {
    cameraError = err.message || "unreachable";
  }
  setConn();
  updateStatusLine();
}

function renderCameras(cams) {
  const seen = new Set();
  for (const cam of cams) {
    seen.add(cam.id);
    const visible = toggleCameras.checked && matchesQuery(cam.name);
    const existing = cameraMarkers.get(cam.id);
    if (existing) {
      existing.data = cam;
      if (visible && !cameraLayer.hasLayer(existing.marker)) cameraLayer.addLayer(existing.marker);
      if (!visible && cameraLayer.hasLayer(existing.marker)) cameraLayer.removeLayer(existing.marker);
    } else {
      const marker = L.marker([cam.lat, cam.lon], { icon: cameraIcon() });
      marker.on("click", () => openCameraDetail(cameraMarkers.get(cam.id).data));
      cameraMarkers.set(cam.id, { marker, data: cam });
      if (visible) cameraLayer.addLayer(marker);
    }
  }
  for (const [id, entry] of cameraMarkers) {
    if (!seen.has(id)) {
      cameraLayer.removeLayer(entry.marker);
      cameraMarkers.delete(id);
    }
  }
  cameraCountEl.textContent = String(cams.length);
}

// ---------- Shared filter/search wiring ----------

function applyFilterToExisting() {
  for (const { marker, data } of flightMarkers.values()) {
    const visible = toggleFlights.checked && matchesQuery(flightSearchText(data));
    if (visible && !flightLayer.hasLayer(marker)) flightLayer.addLayer(marker);
    if (!visible && flightLayer.hasLayer(marker)) flightLayer.removeLayer(marker);
  }
  for (const { marker, data } of satMarkers.values()) {
    const visible = toggleSats.checked && matchesQuery(data.name);
    if (visible && !satLayer.hasLayer(marker)) satLayer.addLayer(marker);
    if (!visible && satLayer.hasLayer(marker)) satLayer.removeLayer(marker);
  }
  for (const { marker, data } of trainMarkers.values()) {
    const visible = toggleTrains.checked && matchesQuery(`${data.route_name} ${data.label || ""}`);
    if (visible && !trainLayer.hasLayer(marker)) trainLayer.addLayer(marker);
    if (!visible && trainLayer.hasLayer(marker)) trainLayer.removeLayer(marker);
  }
  for (const { marker, data } of cameraMarkers.values()) {
    const visible = toggleCameras.checked && matchesQuery(data.name);
    if (visible && !cameraLayer.hasLayer(marker)) cameraLayer.addLayer(marker);
    if (!visible && cameraLayer.hasLayer(marker)) cameraLayer.removeLayer(marker);
  }
}

// ---------- Category chips (All / Flights / Trains / Satellites / Cameras) ----------
// A quick single-click preset on top of the four toggles: picking one
// isolates that layer, picking "All" restores every layer. Manually
// (un)checking a toggle falls back to no chip highlighted ("mixed").

const CATEGORY_TOGGLES = {
  flights: toggleFlights, trains: toggleTrains, satellites: toggleSats, cameras: toggleCameras,
};

function syncChipsFromToggles() {
  const states = Object.values(CATEGORY_TOGGLES).map((t) => t.checked);
  const allOn = states.every(Boolean);
  const onlyOne = states.filter(Boolean).length === 1
    ? Object.keys(CATEGORY_TOGGLES).find((cat) => CATEGORY_TOGGLES[cat].checked)
    : null;
  for (const chip of categoryChips.querySelectorAll(".chip")) {
    const cat = chip.dataset.cat;
    const pressed = cat === "all" ? allOn : cat === onlyOne;
    chip.setAttribute("aria-pressed", String(pressed));
  }
}

categoryChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const cat = chip.dataset.cat;
  for (const [key, toggle] of Object.entries(CATEGORY_TOGGLES)) {
    toggle.checked = cat === "all" || cat === key;
  }
  syncChipsFromToggles();
  onTrainToggleChange();
  applyFilterToExisting();
});

function onTrainToggleChange() {
  if (!toggleTrains.checked) map.removeLayer(trainRouteLayer);
  else if (!map.hasLayer(trainRouteLayer)) trainRouteLayer.addTo(map);
}

searchEl.addEventListener("input", (e) => {
  query = e.target.value.trim().toLowerCase();
  applyFilterToExisting();
});
for (const toggle of Object.values(CATEGORY_TOGGLES)) {
  toggle.addEventListener("change", () => {
    syncChipsFromToggles();
    onTrainToggleChange();
    applyFilterToExisting();
  });
}
syncChipsFromToggles();

let moveTimer = null;
map.on("moveend", () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(pollFlights, MOVE_DEBOUNCE_MS);
});

loadTrainRoutes();
pollFlights();
pollSatellites();
pollTrains();
pollCameras();
setInterval(pollFlights, FLIGHT_POLL_MS);
setInterval(pollSatellites, SAT_POLL_MS);
setInterval(pollTrains, TRAIN_POLL_MS);
setInterval(pollCameras, CAMERA_POLL_MS);

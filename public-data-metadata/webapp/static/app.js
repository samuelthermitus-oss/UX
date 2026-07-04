const FLIGHT_POLL_MS = 15000;
const SAT_POLL_MS = 6000;
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

let flightMarkers = new Map(); // icao24 -> {marker, data}
let satMarkers = new Map();    // name -> {marker, data}
let query = "";

const connDot = document.getElementById("connDot");
const connLabel = document.getElementById("connLabel");
const statusLine = document.getElementById("statusLine");
const flightCountEl = document.getElementById("flightCount");
const satCountEl = document.getElementById("satCount");
const toggleFlights = document.getElementById("toggleFlights");
const toggleSats = document.getElementById("toggleSats");
const searchEl = document.getElementById("search");
const detailEl = document.getElementById("detail");

let lastFlightUpdate = null;
let lastSatUpdate = null;
let flightError = null;
let satError = null;

function setConn() {
  if (flightError || satError) {
    connDot.className = "dot error";
    connLabel.textContent = "connection issue";
  } else if (lastFlightUpdate || lastSatUpdate) {
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
  const parts = [];
  parts.push(`flights ${agoText(lastFlightUpdate)}`);
  parts.push(`satellites ${agoText(lastSatUpdate)}`);
  statusLine.textContent = parts.join(" · ");
  statusLine.classList.toggle("error", Boolean(flightError || satError));
  if (flightError) statusLine.textContent = `flights: ${flightError}`;
  else if (satError) statusLine.textContent = `satellites: ${satError}`;
}
setInterval(updateStatusLine, 1000);

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

function matchesQuery(text) {
  if (!query) return true;
  return text.toLowerCase().includes(query);
}

function showDetail(kind, color, name, rows) {
  const dl = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  detailEl.innerHTML = `
    <button class="close" aria-label="Close">✕</button>
    <p class="kind" style="color:${color}">${kind}</p>
    <p class="name">${name}</p>
    <dl>${dl}</dl>
  `;
  detailEl.hidden = false;
  detailEl.querySelector(".close").addEventListener("click", () => { detailEl.hidden = true; });
}

async function pollFlights() {
  const b = map.getBounds();
  const params = new URLSearchParams({
    lamin: b.getSouth(), lomin: b.getWest(), lamax: b.getNorth(), lomax: b.getEast(),
  });
  try {
    const res = await fetch(`/api/flights?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
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
  for (const f of flights) {
    seen.add(f.icao24);
    const visible = toggleFlights.checked && matchesQuery(`${f.callsign} ${f.country}`);
    const existing = flightMarkers.get(f.icao24);
    if (existing) {
      existing.marker.setLatLng([f.lat, f.lon]);
      existing.marker.setIcon(planeIcon(f.heading));
      existing.data = f;
      if (visible && !flightLayer.hasLayer(existing.marker)) flightLayer.addLayer(existing.marker);
      if (!visible && flightLayer.hasLayer(existing.marker)) flightLayer.removeLayer(existing.marker);
    } else {
      const marker = L.marker([f.lat, f.lon], { icon: planeIcon(f.heading) });
      marker.on("click", () => {
        const d = flightMarkers.get(f.icao24).data;
        showDetail("Flight", "var(--flight)", d.callsign || d.icao24, [
          ["Country", d.country || "—"],
          ["Altitude", d.altitude_m != null ? `${Math.round(d.altitude_m)} m` : "—"],
          ["Speed", d.velocity_ms != null ? `${Math.round(d.velocity_ms * 3.6)} km/h` : "—"],
          ["Heading", d.heading != null ? `${Math.round(d.heading)}°` : "—"],
          ["Vert. rate", d.vertical_rate_ms != null ? `${d.vertical_rate_ms.toFixed(1)} m/s` : "—"],
          ["ICAO24", d.icao24],
        ]);
      });
      flightMarkers.set(f.icao24, { marker, data: f });
      if (visible) flightLayer.addLayer(marker);
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

async function pollSatellites() {
  try {
    const res = await fetch("/api/satellites");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
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
          ["Latitude", d.lat.toFixed(2)],
          ["Longitude", d.lon.toFixed(2)],
          ["Altitude", `${Math.round(d.alt_km)} km`],
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

function applyFilterToExisting() {
  for (const { marker, data } of flightMarkers.values()) {
    const visible = toggleFlights.checked && matchesQuery(`${data.callsign} ${data.country}`);
    if (visible && !flightLayer.hasLayer(marker)) flightLayer.addLayer(marker);
    if (!visible && flightLayer.hasLayer(marker)) flightLayer.removeLayer(marker);
  }
  for (const { marker, data } of satMarkers.values()) {
    const visible = toggleSats.checked && matchesQuery(data.name);
    if (visible && !satLayer.hasLayer(marker)) satLayer.addLayer(marker);
    if (!visible && satLayer.hasLayer(marker)) satLayer.removeLayer(marker);
  }
}

searchEl.addEventListener("input", (e) => {
  query = e.target.value.trim().toLowerCase();
  applyFilterToExisting();
});
toggleFlights.addEventListener("change", applyFilterToExisting);
toggleSats.addEventListener("change", applyFilterToExisting);

let moveTimer = null;
map.on("moveend", () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(pollFlights, MOVE_DEBOUNCE_MS);
});

pollFlights();
pollSatellites();
setInterval(pollFlights, FLIGHT_POLL_MS);
setInterval(pollSatellites, SAT_POLL_MS);

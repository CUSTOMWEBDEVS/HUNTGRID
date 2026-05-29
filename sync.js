import { TILE_LAYERS, buildLayerSheet, tileUrlsForBounds } from './layers.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { put, getAll } from './storage.js';

let map;
let activeTileLayer;
let hybridOverlay;
let waypointLayer;
let trackLayer;
let cachedAreaLayer;
let userMarker;
let accuracyCircle;
let currentPosition = null;
let activeLayerKey = localStorage.getItem('hunttrack.layer') || 'street';
let lastRender = 0;

/** Initialize Leaflet map, layers, controls, and GPS. */
export function initMap({ onLongPress }) {
  map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([38.627, -90.1994], 12);
  waypointLayer = L.layerGroup().addTo(map);
  trackLayer = L.layerGroup().addTo(map);
  cachedAreaLayer = L.layerGroup().addTo(map);
  setBaseLayer(activeLayerKey);
  loadCachedAreas();

  let pressTimer = null;
  map.on('mousedown touchstart', event => {
    pressTimer = setTimeout(() => onLongPress(event.latlng), 700);
  });
  map.on('mouseup touchend dragstart zoomstart', () => clearTimeout(pressTimer));

  startGps();
  return map;
}

/** Get map instance. */
export function getMap() { return map; }

/** Return last GPS position. */
export function getCurrentPosition() { return currentPosition; }

/** Set active tile layer and persist choice. */
export function setBaseLayer(key) {
  activeLayerKey = key;
  localStorage.setItem('hunttrack.layer', key);
  if (activeTileLayer) map.removeLayer(activeTileLayer);
  if (hybridOverlay) map.removeLayer(hybridOverlay);
  const config = TILE_LAYERS[key] || TILE_LAYERS.street;
  activeTileLayer = L.tileLayer(config.url, config.options).addTo(map);
  if (key === 'hybrid') {
    hybridOverlay = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { opacity: 0.38, maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  }
  document.getElementById('activeLayerLabel').textContent = config.label;
}

/** Open layer selector. */
export function openLayerSelector() {
  openSheet(buildLayerSheet(activeLayerKey, key => {
    setBaseLayer(key);
    closeSheet();
    toast(`Layer changed to ${TILE_LAYERS[key].label}`);
  }));
}

/** Start GPS watch and update marker/status. */
function startGps() {
  const status = document.getElementById('gpsStatus');
  if (!navigator.geolocation) {
    status.className = 'gps-status no-signal';
    status.innerHTML = '<span></span>No Signal';
    toast('GPS unavailable — location features disabled', 'error');
    return;
  }
  navigator.geolocation.watchPosition(position => {
    currentPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      altitude: position.coords.altitude
    };
    status.className = 'gps-status locked';
    status.innerHTML = '<span></span>Locked';
    renderGpsMarker(currentPosition);
  }, () => {
    status.className = 'gps-status no-signal';
    status.innerHTML = '<span></span>No Signal';
    toast('GPS unavailable — location features disabled', 'error');
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}

/** Render pulsing GPS marker no more than once per second. */
function renderGpsMarker(pos) {
  const now = Date.now();
  if (now - lastRender < 1000) return;
  lastRender = now;
  const latLng = [pos.lat, pos.lng];
  const icon = L.divIcon({ className: '', html: '<div class="pulse-marker"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
  if (!userMarker) userMarker = L.marker(latLng, { icon, zIndexOffset: 1000 }).addTo(map);
  else userMarker.setLatLng(latLng);
  if (pos.accuracy > 15) {
    if (!accuracyCircle) accuracyCircle = L.circle(latLng, { radius: pos.accuracy, color: '#2fa8ff', opacity: .35, fillOpacity: .08 }).addTo(map);
    else accuracyCircle.setLatLng(latLng).setRadius(pos.accuracy);
  } else if (accuracyCircle) {
    map.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
}

/** Recenter map on current GPS location. */
export function recenterGps() {
  if (!currentPosition) {
    toast('GPS still acquiring');
    return;
  }
  map.setView([currentPosition.lat, currentPosition.lng], Math.max(map.getZoom(), 15), { animate: true });
}

/** Render all waypoint markers. */
export function renderWaypoints(waypoints, onOpen) {
  waypointLayer.clearLayers();
  for (const wp of waypoints.filter(w => !w.deleted)) {
    const icon = L.icon({ iconUrl: `./assets/markers/${wp.type || 'custom'}.svg`, iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -34] });
    L.marker([wp.lat, wp.lng], { icon }).addTo(waypointLayer).on('click', () => onOpen(wp));
  }
}

/** Render a track polyline. */
export function renderTrack(track, fit = false) {
  trackLayer.clearLayers();
  if (!track || !Array.isArray(track.points) || track.points.length < 2) return;
  const points = track.points.map(p => [p.lat, p.lng]);
  const line = L.polyline(points, { color: track.color || '#4a7c3f', weight: 5, opacity: .88 }).addTo(trackLayer);
  if (fit) map.fitBounds(line.getBounds(), { padding: [24, 24] });
}

/** Render live recording polyline without clearing saved track when needed. */
export function renderLiveTrack(points) {
  trackLayer.clearLayers();
  if (points.length > 1) L.polyline(points.map(p => [p.lat, p.lng]), { color: '#c0392b', weight: 5, opacity: .92 }).addTo(trackLayer);
}

/** Prompt the user to download the visible map area. */
export async function downloadVisibleArea() {
  const bounds = map.getBounds();
  const area = {
    id: crypto.randomUUID(),
    name: `Area ${new Date().toLocaleString()}`,
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
    layer: activeLayerKey,
    minZoom: 10,
    maxZoom: 16,
    created_at: new Date().toISOString()
  };
  const urls = tileUrlsForBounds(area, activeLayerKey, area.minZoom, area.maxZoom);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<h2>Download Area</h2><p>${urls.length} tiles will be cached for offline use.</p><div class="progress"><span></span></div>`;
  openSheet(wrapper);
  const progress = wrapper.querySelector('.progress span');
  const cache = await caches.open('hunttrack-v1.0.0-tiles');
  let done = 0;
  for (const url of urls) {
    try {
      const req = new Request(url, { mode: 'no-cors' });
      const res = await fetch(req);
      await cache.put(req, res);
    } catch (error) {}
    done++;
    progress.style.width = `${Math.round(done / urls.length * 100)}%`;
    if (done % 20 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
  }
  await put('cachedAreas', area);
  drawCachedArea(area);
  toast('Map area downloaded');
}

/** Load cached area footprints. */
async function loadCachedAreas() {
  const areas = await getAll('cachedAreas');
  areas.forEach(drawCachedArea);
}

/** Draw one cached area footprint. */
function drawCachedArea(area) {
  const points = [[area.north, area.west], [area.north, area.east], [area.south, area.east], [area.south, area.west]];
  L.polygon(points, { className: 'cached-area' }).addTo(cachedAreaLayer);
}

/** Calculate distance between two coordinates in meters. */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

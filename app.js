const HUNTGRID = {
  map: null,
  streetLayer: null,
  satelliteLayer: null,
  topoLayer: null,
  activeLayer: 'street',
  userMarker: null,
  waypointMarkers: [],
  trackLines: [],
  currentPosition: null,
  waypoints: [],
  tracks: [],
  activeTrack: null,
  activeTrackTimer: null
};

const DEFAULT_CENTER = [38.2324, -90.5629];

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  registerServiceWorker();
  initNavigation();
  initMap();
  initSettings();
  initWaypointControls();
  initTrackControls();
  initSyncControls();
  loadLocalData();
  startGpsWatch();
  toast('HUNTGRID loaded');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('service-worker.js').catch(() => {
    toast('Offline cache failed to register');
  });
}

function initNavigation() {
  document.querySelectorAll('.bottom-nav button').forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.screen;

      document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
      });

      document.querySelectorAll('.bottom-nav button').forEach(btn => {
        btn.classList.remove('active');
      });

      document.getElementById(target).classList.add('active');
      button.classList.add('active');

      if (target === 'mapScreen' && HUNTGRID.map) {
        setTimeout(() => HUNTGRID.map.invalidateSize(), 100);
      }
    });
  });
}

function initMap() {
  if (!window.L) {
    toast('Map library failed to load');
    return;
  }

  HUNTGRID.map = L.map('map', {
    zoomControl: false
  }).setView(DEFAULT_CENTER, 13);

  HUNTGRID.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });

  HUNTGRID.satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }
  );

  HUNTGRID.topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap'
  });

  HUNTGRID.streetLayer.addTo(HUNTGRID.map);

  HUNTGRID.map.on('contextmenu', event => {
    createWaypoint(event.latlng.lat, event.latlng.lng);
  });

  HUNTGRID.map.on('dblclick', event => {
    createWaypoint(event.latlng.lat, event.latlng.lng);
  });

  document.getElementById('layerBtn').addEventListener('click', cycleLayer);

  document.getElementById('recenterBtn').addEventListener('click', () => {
    if (!HUNTGRID.currentPosition) {
      toast('GPS position not ready');
      return;
    }

    HUNTGRID.map.setView(
      [HUNTGRID.currentPosition.lat, HUNTGRID.currentPosition.lng],
      16
    );
  });

  setTimeout(() => HUNTGRID.map.invalidateSize(), 250);
}

function cycleLayer() {
  if (!HUNTGRID.map) return;

  HUNTGRID.map.removeLayer(HUNTGRID.streetLayer);
  HUNTGRID.map.removeLayer(HUNTGRID.satelliteLayer);
  HUNTGRID.map.removeLayer(HUNTGRID.topoLayer);

  if (HUNTGRID.activeLayer === 'street') {
    HUNTGRID.satelliteLayer.addTo(HUNTGRID.map);
    HUNTGRID.activeLayer = 'satellite';
    toast('Satellite layer');
  } else if (HUNTGRID.activeLayer === 'satellite') {
    HUNTGRID.topoLayer.addTo(HUNTGRID.map);
    HUNTGRID.activeLayer = 'topo';
    toast('Topo layer');
  } else {
    HUNTGRID.streetLayer.addTo(HUNTGRID.map);
    HUNTGRID.activeLayer = 'street';
    toast('Street layer');
  }

  localStorage.setItem('huntgrid_layer', HUNTGRID.activeLayer);
}

function startGpsWatch() {
  if (!navigator.geolocation) {
    setGpsStatus('GPS: Unavailable');
    toast('GPS unavailable');
    return;
  }

  navigator.geolocation.watchPosition(
    position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      HUNTGRID.currentPosition = {
        lat,
        lng,
        accuracy: position.coords.accuracy || 0
      };

      setGpsStatus('GPS: Locked');

      if (!HUNTGRID.userMarker) {
        HUNTGRID.userMarker = L.circleMarker([lat, lng], {
          radius: 9,
          color: '#1a1f1a',
          weight: 2,
          fillColor: '#e8a020',
          fillOpacity: 0.95
        }).addTo(HUNTGRID.map);

        HUNTGRID.map.setView([lat, lng], 15);
      } else {
        HUNTGRID.userMarker.setLatLng([lat, lng]);
      }
    },
    () => {
      setGpsStatus('GPS: No Signal');
      toast('GPS denied or unavailable');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    }
  );
}

function setGpsStatus(text) {
  document.getElementById('gpsStatus').textContent = text;
}

function initWaypointControls() {
  document.getElementById('dropWaypointBtn').addEventListener('click', () => {
    if (!HUNTGRID.currentPosition) {
      toast('GPS position not ready. Double-click map to drop a waypoint.');
      return;
    }

    createWaypoint(HUNTGRID.currentPosition.lat, HUNTGRID.currentPosition.lng);
  });
}

function createWaypoint(lat, lng) {
  const waypoint = {
    id: crypto.randomUUID(),
    name: `Waypoint ${HUNTGRID.waypoints.length + 1}`,
    type: 'custom',
    lat,
    lng,
    elevation_ft: 0,
    notes: '',
    photos: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced: false,
    color: '#e8a020',
    deleted: false
  };

  HUNTGRID.waypoints.push(waypoint);
  saveLocalData();
  renderWaypointMarkers();
  renderWaypointList();
  toast('Waypoint dropped');
}

function renderWaypointMarkers() {
  HUNTGRID.waypointMarkers.forEach(marker => marker.remove());
  HUNTGRID.waypointMarkers = [];

  HUNTGRID.waypoints
    .filter(waypoint => !waypoint.deleted)
    .forEach(waypoint => {
      const marker = L.marker([waypoint.lat, waypoint.lng]).addTo(HUNTGRID.map);

      marker.bindPopup(`
        <strong>${escapeHtml(waypoint.name)}</strong><br>
        Type: ${escapeHtml(waypoint.type)}<br>
        ${Number(waypoint.lat).toFixed(6)}, ${Number(waypoint.lng).toFixed(6)}
      `);

      HUNTGRID.waypointMarkers.push(marker);
    });
}

function renderWaypointList() {
  const list = document.getElementById('waypointList');
  const waypoints = HUNTGRID.waypoints.filter(waypoint => !waypoint.deleted);

  list.innerHTML = '';

  if (!waypoints.length) {
    list.innerHTML = '<p class="muted">No waypoints yet. Use + on the map or double-click the map.</p>';
    return;
  }

  waypoints.forEach(waypoint => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <strong>${escapeHtml(waypoint.name)}</strong>
      <p>${escapeHtml(waypoint.type)}</p>
      <small>${Number(waypoint.lat).toFixed(6)}, ${Number(waypoint.lng).toFixed(6)}</small>
      <br><br>
      <button data-delete="${waypoint.id}" class="danger">Delete</button>
    `;

    card.addEventListener('click', event => {
      if (event.target.dataset.delete) {
        deleteWaypoint(event.target.dataset.delete);
        return;
      }

      document.querySelector('[data-screen="mapScreen"]').click();
      HUNTGRID.map.setView([waypoint.lat, waypoint.lng], 17);
    });

    list.appendChild(card);
  });
}

function deleteWaypoint(id) {
  const waypoint = HUNTGRID.waypoints.find(item => item.id === id);
  if (!waypoint) return;

  waypoint.deleted = true;
  waypoint.synced = false;
  waypoint.updated_at = new Date().toISOString();

  saveLocalData();
  renderWaypointMarkers();
  renderWaypointList();
  toast('Waypoint deleted locally');
}

function initTrackControls() {
  document.getElementById('startTrackBtn').addEventListener('click', startTrack);
  document.getElementById('stopTrackBtn').addEventListener('click', stopTrack);
}

function startTrack() {
  if (HUNTGRID.activeTrack) {
    toast('Track already recording');
    return;
  }

  HUNTGRID.activeTrack = {
    id: crypto.randomUUID(),
    name: `Track ${HUNTGRID.tracks.length + 1}`,
    points: [],
    distance_miles: 0,
    duration_seconds: 0,
    started_at: new Date().toISOString(),
    ended_at: '',
    color: '#4a7c3f',
    synced: false,
    deleted: false
  };

  document.getElementById('trackStatus').textContent = 'Recording track...';

  HUNTGRID.activeTrackTimer = setInterval(recordTrackPoint, 5000);
  recordTrackPoint();

  toast('Track recording started');
}

function recordTrackPoint() {
  if (!HUNTGRID.activeTrack || !HUNTGRID.currentPosition) return;

  HUNTGRID.activeTrack.points.push({
    lat: HUNTGRID.currentPosition.lat,
    lng: HUNTGRID.currentPosition.lng,
    elevation_ft: 0,
    timestamp: new Date().toISOString()
  });

  HUNTGRID.activeTrack.duration_seconds += 5;
  document.getElementById('trackStatus').textContent =
    `Recording: ${HUNTGRID.activeTrack.points.length} points`;
}

function stopTrack() {
  if (!HUNTGRID.activeTrack) {
    toast('No active track');
    return;
  }

  clearInterval(HUNTGRID.activeTrackTimer);

  HUNTGRID.activeTrack.ended_at = new Date().toISOString();
  HUNTGRID.tracks.push(HUNTGRID.activeTrack);

  HUNTGRID.activeTrack = null;
  HUNTGRID.activeTrackTimer = null;

  document.getElementById('trackStatus').textContent = 'No active track.';

  saveLocalData();
  renderTrackList();
  renderTrackLines();

  toast('Track saved');
}

function renderTrackLines() {
  HUNTGRID.trackLines.forEach(line => line.remove());
  HUNTGRID.trackLines = [];

  HUNTGRID.tracks
    .filter(track => !track.deleted && Array.isArray(track.points) && track.points.length > 1)
    .forEach(track => {
      const line = L.polyline(
        track.points.map(point => [point.lat, point.lng]),
        { color: track.color || '#4a7c3f', weight: 4 }
      ).addTo(HUNTGRID.map);

      HUNTGRID.trackLines.push(line);
    });
}

function renderTrackList() {
  const list = document.getElementById('trackList');
  const tracks = HUNTGRID.tracks.filter(track => !track.deleted);

  list.innerHTML = '';

  if (!tracks.length) {
    list.innerHTML = '<p class="muted">No tracks yet.</p>';
    return;
  }

  tracks.forEach(track => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <strong>${escapeHtml(track.name)}</strong>
      <p>${track.points.length} GPS points</p>
      <small>${escapeHtml(track.started_at)}</small>
    `;

    card.addEventListener('click', () => {
      if (!track.points.length) return;

      const line = L.polyline(
        track.points.map(point => [point.lat, point.lng]),
        { color: track.color || '#4a7c3f', weight: 4 }
      ).addTo(HUNTGRID.map);

      document.querySelector('[data-screen="mapScreen"]').click();
      HUNTGRID.map.fitBounds(line.getBounds());
    });

    list.appendChild(card);
  });
}

function initSettings() {
  const gasUrl = localStorage.getItem('huntgrid_gas_url');
  const gasToken = localStorage.getItem('huntgrid_gas_token');

  if (gasUrl) document.getElementById('gasUrl').value = gasUrl;
  if (gasToken) document.getElementById('gasToken').value = gasToken;

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    localStorage.setItem('huntgrid_gas_url', document.getElementById('gasUrl').value.trim());
    localStorage.setItem('huntgrid_gas_token', document.getElementById('gasToken').value.trim());
    toast('Settings saved');
  });

  document.getElementById('clearDataBtn').addEventListener('click', () => {
    localStorage.removeItem('huntgrid_waypoints');
    localStorage.removeItem('huntgrid_tracks');
    HUNTGRID.waypoints = [];
    HUNTGRID.tracks = [];
    saveLocalData();
    renderWaypointMarkers();
    renderWaypointList();
    renderTrackList();
    renderTrackLines();
    toast('Local data cleared');
  });
}

function initSyncControls() {
  document.getElementById('syncNowBtn').addEventListener('click', syncNow);
}

async function syncNow() {
  const gasUrl = localStorage.getItem('huntgrid_gas_url') || document.getElementById('gasUrl').value.trim();
  const token = localStorage.getItem('huntgrid_gas_token') || document.getElementById('gasToken').value.trim();

  if (!gasUrl || !token) {
    toast('Set GAS URL and token first');
    return;
  }

  try {
    document.getElementById('syncStatus').textContent = 'Syncing...';

    const response = await fetch(`${gasUrl}?action=sync&token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({
        device_id: getDeviceId(),
        waypoints: HUNTGRID.waypoints,
        tracks: HUNTGRID.tracks
      })
    });

    const data = await response.json();

    if (!data.ok) throw new Error(data.error || 'Sync failed');

    HUNTGRID.waypoints = Array.isArray(data.waypoints) ? data.waypoints : HUNTGRID.waypoints;
    HUNTGRID.tracks = Array.isArray(data.tracks) ? normalizeTracks(data.tracks) : HUNTGRID.tracks;

    saveLocalData();
    renderWaypointMarkers();
    renderWaypointList();
    renderTrackList();
    renderTrackLines();

    document.getElementById('syncStatus').textContent =
      `Last sync: ${new Date().toLocaleString()}`;

    toast('Sync complete');
  } catch (error) {
    document.getElementById('syncStatus').textContent = 'Sync failed. Data is still saved locally.';
    toast('Sync failed');
  }
}

function normalizeTracks(tracks) {
  return tracks.map(track => {
    if (typeof track.points === 'string') {
      try {
        track.points = JSON.parse(track.points);
      } catch {
        track.points = [];
      }
    }

    if (!Array.isArray(track.points)) track.points = [];

    return track;
  });
}

function getDeviceId() {
  let id = localStorage.getItem('huntgrid_device_id');

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('huntgrid_device_id', id);
  }

  return id;
}

function saveLocalData() {
  localStorage.setItem('huntgrid_waypoints', JSON.stringify(HUNTGRID.waypoints));
  localStorage.setItem('huntgrid_tracks', JSON.stringify(HUNTGRID.tracks));
}

function loadLocalData() {
  try {
    HUNTGRID.waypoints = JSON.parse(localStorage.getItem('huntgrid_waypoints') || '[]');
    HUNTGRID.tracks = JSON.parse(localStorage.getItem('huntgrid_tracks') || '[]');
  } catch {
    HUNTGRID.waypoints = [];
    HUNTGRID.tracks = [];
  }

  HUNTGRID.tracks = normalizeTracks(HUNTGRID.tracks);

  if (HUNTGRID.map) {
    renderWaypointMarkers();
    renderTrackLines();
  }

  renderWaypointList();
  renderTrackList();
}

function toast(message) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = message;
  toastEl.style.display = 'block';

  clearTimeout(window.__huntgridToastTimer);

  window.__huntgridToastTimer = setTimeout(() => {
    toastEl.style.display = 'none';
  }, 2600);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

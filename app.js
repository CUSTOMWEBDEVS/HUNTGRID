import { put, getAll, remove } from './storage.js';
import { toast, confirmModal, openSheet, closeSheet, emptyState, vibrate } from './ui.js';
import { getCurrentPosition, renderWaypoints, getMap, distanceMeters } from './map.js';

const TYPES = ['camp', 'stand', 'trail', 'water', 'harvest', 'observation', 'custom'];

/** Create and save a waypoint using location. */
export async function createWaypointAt(latLng) {
  const values = await waypointForm({ name: '', type: 'custom', notes: '', color: '#e8a020' }, 'Drop Waypoint');
  if (!values) return null;
  const waypoint = {
    id: crypto.randomUUID(),
    name: values.name,
    type: values.type,
    lat: Number(latLng.lat),
    lng: Number(latLng.lng),
    elevation_ft: 0,
    notes: values.notes || '',
    photos: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced: false,
    color: values.color || '#e8a020'
  };
  await put('waypoints', waypoint);
  toast('Waypoint saved');
  vibrate();
  await refreshWaypoints();
  return waypoint;
}

/** Drop waypoint at GPS location. */
export async function dropAtCurrentLocation() {
  const pos = getCurrentPosition();
  if (!pos) {
    toast('GPS still acquiring', 'error');
    return;
  }
  await createWaypointAt({ lat: pos.lat, lng: pos.lng });
}

/** Display waypoint details in bottom sheet. */
export function openWaypointDetail(wp) {
  const node = document.createElement('div');
  node.innerHTML = `
    <h2>${escapeHtml(wp.name)}</h2>
    <span class="badge">${escapeHtml(wp.type)}</span>
    <p class="card-meta">${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)} · ${new Date(wp.created_at).toLocaleString()}</p>
    <p>${escapeHtml(wp.notes || 'No notes')}</p>
  `;
  const nav = button('Navigate To', () => {
    window.location.href = `geo:${wp.lat},${wp.lng}?q=${wp.lat},${wp.lng}(${encodeURIComponent(wp.name)})`;
  });
  const edit = button('Edit', async () => {
    const values = await waypointForm(wp, 'Edit Waypoint');
    if (!values) return;
    await put('waypoints', { ...wp, ...values, updated_at: new Date().toISOString(), synced: false });
    toast('Waypoint updated');
    closeSheet();
    await refreshWaypoints();
  });
  const del = button('Delete', async () => {
    const ok = await confirmModal({ title: 'Delete Waypoint', message: `Delete ${wp.name}?`, confirmText: 'Delete' });
    if (!ok) return;
    await put('waypoints', { ...wp, deleted: true, synced: false, updated_at: new Date().toISOString() });
    toast('Waypoint deleted');
    closeSheet();
    await refreshWaypoints();
  }, 'danger');
  node.append(nav, edit, del);
  openSheet(node);
}

/** Refresh markers and list. */
export async function refreshWaypoints() {
  const waypoints = (await getAll('waypoints')).filter(w => !w.deleted);
  renderWaypoints(waypoints, openWaypointDetail);
  renderWaypointList(waypoints);
}

/** Render waypoint list with search and sorting. */
export async function renderWaypointList(items = null) {
  const list = document.getElementById('waypointList');
  const search = document.getElementById('waypointSearch')?.value?.toLowerCase() || '';
  const sort = document.getElementById('waypointSort')?.value || 'date';
  const current = getCurrentPosition();
  let waypoints = items || (await getAll('waypoints')).filter(w => !w.deleted);
  waypoints = waypoints.filter(w => w.name.toLowerCase().includes(search) || w.type.toLowerCase().includes(search));
  waypoints.sort((a,b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'distance') return distanceMeters(current, a) - distanceMeters(current, b);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  list.replaceChildren();
  if (!waypoints.length) {
    list.appendChild(emptyState('No waypoints yet. Drop your first point from the map.', 'Drop Now', dropAtCurrentLocation));
    return;
  }
  for (const wp of waypoints) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    const dist = current ? formatDistance(distanceMeters(current, wp)) : 'GPS needed';
    card.innerHTML = `<div class="card-title"><span>${escapeHtml(wp.name)}</span><span class="badge">${escapeHtml(wp.type)}</span></div><div class="card-meta">${dist} · ${new Date(wp.created_at).toLocaleDateString()}</div>`;
    card.onclick = () => {
      getMap().setView([wp.lat, wp.lng], 16, { animate: true });
      document.querySelector('[data-view="mapView"]').click();
      openWaypointDetail(wp);
    };
    list.appendChild(card);
  }
}

/** Build waypoint edit/create modal. */
async function waypointForm(wp, title) {
  const typeOptions = TYPES.map(t => `<option value="${t}" ${wp.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const fields = [
    { name: 'name', label: 'Name', value: wp.name || '', required: true },
    { name: 'notes', label: 'Notes', type: 'textarea', value: wp.notes || '' },
    { name: 'color', label: 'Color', type: 'text', value: wp.color || '#e8a020' }
  ];
  const values = await confirmModal({ title, message: 'Enter waypoint details.', confirmText: 'Save', fields });
  if (!values) return null;
  const typeValues = await pickType(wp.type || 'custom');
  if (!typeValues) return null;
  return { ...values, type: typeValues.type };
}

/** Let user pick waypoint type in a sheet. */
function pickType(current) {
  return new Promise(resolve => {
    const node = document.createElement('div');
    node.innerHTML = '<h2>Waypoint Type</h2>';
    TYPES.forEach(type => node.appendChild(button(`${type}${type === current ? ' ✓' : ''}`, () => { closeSheet(); resolve({ type }); })));
    openSheet(node);
  });
}

/** Create button helper. */
function button(text, onClick, kind = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `button wide ${kind}`;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

/** Escape HTML to keep user data safe. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

/** Format distance using saved unit preference. */
function formatDistance(meters) {
  const units = localStorage.getItem('hunttrack.units') || 'miles';
  if (!Number.isFinite(meters)) return 'GPS needed';
  if (units === 'kilometers') return `${(meters / 1000).toFixed(2)} km`;
  return `${(meters / 1609.344).toFixed(2)} mi`;
}

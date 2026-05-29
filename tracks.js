export const TILE_LAYERS = {
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
  },
  topo: {
    label: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 17, attribution: '&copy; OpenTopoMap contributors' }
  },
  hybrid: {
    label: 'Hybrid',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: 'Tiles &copy; Esri, OSM overlay' }
  }
};

/** Create the bottom sheet node for layer selection. */
export function buildLayerSheet(currentLayer, onSelect) {
  const wrapper = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Map Layers';
  wrapper.appendChild(title);

  Object.entries(TILE_LAYERS).forEach(([key, layer]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button wide';
    button.textContent = `${layer.label}${key === currentLayer ? ' ✓' : ''}`;
    button.onclick = () => onSelect(key);
    wrapper.appendChild(button);
  });

  const note = document.createElement('p');
  note.className = 'small-label';
  note.textContent = 'Offline mode shows only tiles that were previously loaded or downloaded.';
  wrapper.appendChild(note);
  return wrapper;
}

/** Return tile URLs for a bbox and zoom range. */
export function tileUrlsForBounds(bounds, layerKey, minZoom = 10, maxZoom = 16) {
  const layer = TILE_LAYERS[layerKey] || TILE_LAYERS.street;
  const urls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = latLngToTile(bounds.north, bounds.west, z);
    const se = latLngToTile(bounds.south, bounds.east, z);
    for (let x = nw.x; x <= se.x; x++) {
      for (let y = nw.y; y <= se.y; y++) {
        urls.push(layer.url.replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }
    }
  }
  return urls;
}

/** Convert lat/lng to XYZ tile coordinates. */
function latLngToTile(lat, lng, zoom) {
  const latRad = lat * Math.PI / 180;
  const n = 2 ** zoom;
  return {
    x: Math.floor((lng + 180) / 360 * n),
    y: Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n)
  };
}

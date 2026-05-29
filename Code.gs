const SPREADSHEET_ID = '1vDD0rUGt5wBzAwjKOyMeGxGs2apesTaRi64p-jUQJuM';
const AUTH_TOKEN = 'CHANGE_THIS_TOKEN';

const SHEETS = {
  WAYPOINTS: 'Waypoints',
  TRACKS: 'Tracks',
  SETTINGS: 'Settings',
  SYNC_LOG: 'SyncLog'
};

const HEADERS = {
  Waypoints: [
    'id', 'name', 'type', 'lat', 'lng', 'elevation_ft', 'notes',
    'photos', 'created_at', 'updated_at', 'synced', 'color', 'deleted'
  ],
  Tracks: [
    'id', 'name', 'points', 'distance_miles', 'duration_seconds',
    'started_at', 'ended_at', 'color', 'synced', 'updated_at', 'deleted'
  ],
  Settings: ['key', 'value', 'updated_at'],
  SyncLog: ['timestamp', 'device_id', 'action', 'status', 'message']
};

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';

    if (!action) {
      return jsonResponse({ ok: false, error: 'Missing action' });
    }

    if (action !== 'ping' && String(params.token || '') !== String(AUTH_TOKEN)) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    ensureSheets();

    const body = parseBody(e);

    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'HUNTGRID API online' });
    }

    if (action === 'setup') {
      ensureSheets();
      return jsonResponse({ ok: true, message: 'Sheets verified' });
    }

    if (action === 'getWaypoints') {
      return jsonResponse({
        ok: true,
        waypoints: getRows(SHEETS.WAYPOINTS).filter(row => row.deleted !== true && row.deleted !== 'true')
      });
    }

    if (action === 'getTracks') {
      return jsonResponse({
        ok: true,
        tracks: getRows(SHEETS.TRACKS).filter(row => row.deleted !== true && row.deleted !== 'true')
      });
    }

    if (action === 'saveWaypoint') {
      return saveWaypoint(body);
    }

    if (action === 'saveTrack') {
      return saveTrack(body);
    }

    if (action === 'deleteWaypoint') {
      return softDelete(SHEETS.WAYPOINTS, body.id || params.id, 'waypoint');
    }

    if (action === 'deleteTrack') {
      return softDelete(SHEETS.TRACKS, body.id || params.id, 'track');
    }

    if (action === 'sync') {
      return syncAll(body);
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function openSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheets() {
  const ss = openSpreadsheet();

  Object.keys(SHEETS).forEach(key => {
    const sheetName = SHEETS[key];
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    const headers = HEADERS[sheetName];
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

    let needsHeader = false;

    for (let i = 0; i < headers.length; i++) {
      if (current[i] !== headers[i]) {
        needsHeader = true;
        break;
      }
    }

    if (needsHeader) {
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function getRows(sheetName) {
  const ss = openSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  const headers = values[0];

  return values.slice(1).map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = normalizeValue(row[index]);
    });

    return obj;
  });
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function saveWaypoint(body) {
  const waypoint = body.waypoint || body;

  if (!waypoint.id) {
    return jsonResponse({ ok: false, error: 'Waypoint missing id' });
  }

  waypoint.updated_at = waypoint.updated_at || new Date().toISOString();
  waypoint.synced = true;
  waypoint.deleted = waypoint.deleted || false;

  upsertRow(SHEETS.WAYPOINTS, waypoint);
  logSync(body.device_id || '', 'saveWaypoint', 'ok', waypoint.id);

  return jsonResponse({ ok: true, waypoint });
}

function saveTrack(body) {
  const track = body.track || body;

  if (!track.id) {
    return jsonResponse({ ok: false, error: 'Track missing id' });
  }

  track.updated_at = track.updated_at || new Date().toISOString();
  track.synced = true;
  track.deleted = track.deleted || false;

  if (Array.isArray(track.points)) {
    track.points = JSON.stringify(track.points);
  }

  upsertRow(SHEETS.TRACKS, track);
  logSync(body.device_id || '', 'saveTrack', 'ok', track.id);

  return jsonResponse({ ok: true, track });
}

function softDelete(sheetName, id, type) {
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' });

  const rows = getRows(sheetName);
  const existing = rows.find(row => row.id === id);

  if (!existing) {
    return jsonResponse({ ok: true, deleted: false, message: type + ' not found' });
  }

  existing.deleted = true;
  existing.synced = true;
  existing.updated_at = new Date().toISOString();

  upsertRow(sheetName, existing);
  logSync('', 'delete' + capitalize(type), 'ok', id);

  return jsonResponse({ ok: true, deleted: true, id });
}

function syncAll(body) {
  const waypoints = body.waypoints || [];
  const tracks = body.tracks || [];
  const deviceId = body.device_id || '';

  waypoints.forEach(waypoint => {
    waypoint.synced = true;
    waypoint.updated_at = waypoint.updated_at || new Date().toISOString();
    upsertRow(SHEETS.WAYPOINTS, waypoint);
  });

  tracks.forEach(track => {
    track.synced = true;
    track.updated_at = track.updated_at || new Date().toISOString();

    if (Array.isArray(track.points)) {
      track.points = JSON.stringify(track.points);
    }

    upsertRow(SHEETS.TRACKS, track);
  });

  logSync(deviceId, 'sync', 'ok', `waypoints=${waypoints.length}, tracks=${tracks.length}`);

  return jsonResponse({
    ok: true,
    waypoints: getRows(SHEETS.WAYPOINTS).filter(row => row.deleted !== true && row.deleted !== 'true'),
    tracks: getRows(SHEETS.TRACKS).filter(row => row.deleted !== true && row.deleted !== 'true')
  });
}

function upsertRow(sheetName, item) {
  const ss = openSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = HEADERS[sheetName];

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(item.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  const row = headers.map(header => {
    let value = item[header];

    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      value = JSON.stringify(value);
    }

    if (value === undefined || value === null) value = '';

    return value;
  });

  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  }
}

function logSync(deviceId, action, status, message) {
  const ss = openSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SYNC_LOG);

  sheet.appendRow([
    new Date().toISOString(),
    deviceId || '',
    action || '',
    status || '',
    message || ''
  ]);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function capitalize(str) {
  str = String(str || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

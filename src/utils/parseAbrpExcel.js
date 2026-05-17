import * as XLSX from 'xlsx';

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace('%', '').replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeSoc(value) {
  const n = toNumber(value);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDateTime(value, fallbackDate = null) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
  }
  const text = clean(value);
  // ABRP export: 10/5/2026, 17:16:16
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, d, m, y, hh, mm, ss = '0'] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  // HH:mm or H:mm, with fallback date
  match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match && fallbackDate) {
    const [, hh, mm, ss = '0'] = match;
    const d = new Date(fallbackDate);
    d.setHours(Number(hh), Number(mm), Number(ss), 0);
    return d;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoLocal(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function isoDate(date) {
  return isoLocal(date)?.slice(0, 10) || null;
}

function timeLabel(date) {
  if (!date) return null;
  return `${date.getHours()}:${pad2(date.getMinutes())}`;
}

function parseDateFromTitle(title) {
  const match = clean(title).match(/on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})/i);
  if (!match) return null;
  const [, d, m, y, hh, mm] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0);
}

function parseDurationMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const text = clean(value).toLowerCase();
  let minutes = 0;
  const h = text.match(/(\d+(?:[\.,]\d+)?)\s*h/);
  const m = text.match(/(\d+(?:[\.,]\d+)?)\s*min/);
  if (h) minutes += Number(h[1].replace(',', '.')) * 60;
  if (m) minutes += Number(m[1].replace(',', '.'));
  if (!h && !m) {
    const n = toNumber(text);
    return n;
  }
  return minutes;
}

function extractCoordAndLabel(value) {
  const text = clean(value);
  const coordMatch = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  const coord = coordMatch ? [Number(coordMatch[1]), Number(coordMatch[2])] : null;
  const labelMatch = text.match(/\(([^)]+)\)/s);
  const label = labelMatch ? labelMatch[1].trim() : text.replace(coordMatch?.[0] || '', '').replace(/[()]/g, '').trim();
  return { coord, label: label || null };
}

function normalizeHeader(header) {
  return clean(header).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function findRowIndex(rows, label) {
  const wanted = normalizeHeader(label);
  return rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === wanted));
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key) obj[key] = row[index];
  });
  return obj;
}

function distanceKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lon1] = points[i - 1];
    const [lat2, lon2] = points[i];
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) continue;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}

function avg(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function max(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}

function stableId(fileName, title, start, kind) {
  const base = fileName?.replace(/\.xlsx$/i, '') || `${kind}-${isoLocal(start) || title}`;
  return base.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function parseSheetRows(workbook) {
  const firstName = workbook.SheetNames[0];
  if (!firstName) throw new Error('El Excel no tiene hojas');
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstName], { header: 1, raw: true, defval: null });
}

export async function parseAbrpExcelFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const rows = parseSheetRows(workbook);
  const title = clean(rows[0]?.[0]);
  const titleDate = parseDateFromTitle(title);

  const summaryIndex = findRowIndex(rows, 'Summary');
  const detailsIndex = findRowIndex(rows, 'Details');
  if (summaryIndex < 0 || detailsIndex < 0) throw new Error('No se encuentran bloques Summary/Details de ABRP');

  const summaryHeaders = rows[summaryIndex + 1] || [];
  const summary = rowToObject(summaryHeaders, rows[summaryIndex + 2] || []);
  const type = clean(summary['actividad'] || title).toLowerCase().includes('carga') ? 'Carga' : 'Conducción';
  const kind = type === 'Carga' ? 'charge' : 'drive';

  const detailHeaders = rows[detailsIndex + 1] || [];
  const detailRows = rows.slice(detailsIndex + 2).filter((row) => row.some((cell) => cell !== null && cell !== ''));
  const details = detailRows.map((row) => rowToObject(detailHeaders, row));

  const startFromSummary = parseDateTime(summary['inicio'], titleDate) || titleDate;
  let endFromSummary = parseDateTime(summary['finalizacion'], startFromSummary) || null;
  if (startFromSummary && endFromSummary && endFromSummary < startFromSummary) {
    endFromSummary = new Date(endFromSummary.getTime() + 24 * 60 * 60000);
  }
  const durationMin = parseDurationMinutes(summary['duracion']) ?? (startFromSummary && endFromSummary ? (endFromSummary - startFromSummary) / 60000 : null);

  const startLoc = extractCoordAndLabel(summary['ubicacion inicial']);
  const endLoc = extractCoordAndLabel(summary['ubicacion final']);
  const id = stableId(file.name, title, startFromSummary, kind);

  if (kind === 'charge') {
    const series = details.map((row) => {
      const ts = parseDateTime(row['fecha y hora'], startFromSummary);
      const power = toNumber(row['potencia [kw]']);
      const soc = normalizeSoc(row['soc']);
      return ts ? [isoLocal(ts), power, soc] : null;
    }).filter(Boolean);
    const powers = series.map((sample) => sample[1]).filter(Number.isFinite);
    return {
      id,
      file: file.name,
      title: title || `ABRP Carga ${timeLabel(startFromSummary) || ''}`,
      type: 'Carga',
      date: isoDate(startFromSummary),
      start: isoLocal(startFromSummary),
      end: isoLocal(endFromSummary),
      start_time: timeLabel(startFromSummary),
      end_time: timeLabel(endFromSummary),
      duration: summary['duracion'] || null,
      duration_min: durationMin,
      distance_km: null,
      start_label: startLoc.label,
      end_label: endLoc.label,
      start_coord: startLoc.coord,
      end_coord: endLoc.coord,
      soc_start: normalizeSoc(summary['soc inicial']),
      soc_end: normalizeSoc(summary['soc final']),
      soc_delta: normalizeSoc(summary['soc final']) !== null && normalizeSoc(summary['soc inicial']) !== null ? normalizeSoc(summary['soc final']) - normalizeSoc(summary['soc inicial']) : null,
      energy_kwh: toNumber(summary['energia anadida [kwh]']) ?? toNumber(summary['energia añadida [kwh]']),
      odo_start: toNumber(summary['odometro inicial [km]']) ?? toNumber(summary['odómetro inicial [km]']),
      odo_end: toNumber(summary['odometro final [km]']) ?? toNumber(summary['odómetro final [km]']),
      avg_power_kw: avg(powers),
      max_power_kw: max(powers),
      avg_speed_kmh: null,
      max_speed_kmh: null,
      route: [],
      charge_series: series
    };
  }

  const points = [];
  const route = [];
  details.forEach((row) => {
    const ts = parseDateTime(row['fecha y hora'], startFromSummary);
    const lat = toNumber(row['latitud']);
    const lon = toNumber(row['longitud']);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const speed = toNumber(row['velocidad [km/h]']);
    const soc = normalizeSoc(row['soc']);
    const power = toNumber(row['potencia [kw]']);
    const altitude = toNumber(row['altitud [m]']);
    points.push({ timestamp: isoLocal(ts), lat, lon, speed_kmh: speed, soc, power_kw: power, altitude_m: altitude });
    route.push([lat, lon]);
  });

  const speeds = points.map((p) => p.speed_kmh).filter(Number.isFinite);
  const durationFromDetails = points.length > 1 && points[0].timestamp && points[points.length - 1].timestamp
    ? (new Date(points[points.length - 1].timestamp) - new Date(points[0].timestamp)) / 60000
    : null;
  const start = startFromSummary || parseDateTime(points[0]?.timestamp);
  const end = endFromSummary || parseDateTime(points[points.length - 1]?.timestamp);
  const distanceSummary = toNumber(summary['distancia [km]']);
  const calculatedKm = route.length > 1 ? distanceKm(route) : null;

  return {
    id,
    file: file.name,
    title: title || `ABRP Conducción ${timeLabel(start) || ''}`,
    type: 'Conducción',
    date: isoDate(start),
    start: isoLocal(start),
    end: isoLocal(end),
    start_time: timeLabel(start),
    end_time: timeLabel(end),
    duration: summary['duracion'] || null,
    duration_min: durationMin ?? durationFromDetails,
    distance_km: distanceSummary ?? calculatedKm,
    start_label: startLoc.label,
    end_label: endLoc.label,
    start_coord: startLoc.coord || route[0] || null,
    end_coord: endLoc.coord || route[route.length - 1] || null,
    soc_start: normalizeSoc(summary['soc inicial']) ?? points[0]?.soc ?? null,
    soc_end: normalizeSoc(summary['soc final']) ?? points[points.length - 1]?.soc ?? null,
    soc_delta: null,
    energy_kwh: toNumber(summary['energia anadida [kwh]']) ?? toNumber(summary['energia añadida [kwh]']),
    odo_start: toNumber(summary['odometro inicial [km]']) ?? toNumber(summary['odómetro inicial [km]']),
    odo_end: toNumber(summary['odometro final [km]']) ?? toNumber(summary['odómetro final [km]']),
    avg_power_kw: null,
    max_power_kw: null,
    avg_speed_kmh: avg(speeds) ?? (distanceSummary && durationMin ? distanceSummary / durationMin * 60 : null),
    max_speed_kmh: max(speeds),
    route,
    points
  };
}

export async function parseAbrpExcelFiles(files) {
  const results = [];
  const errors = [];
  for (const file of files) {
    try {
      results.push(await parseAbrpExcelFile(file));
    } catch (error) {
      errors.push({ file: file.name, message: error.message || String(error) });
    }
  }
  return { activities: results, errors };
}

export const HOME_KWH_PRICE_EUR = 0.1176;
export const BATTERY_CAPACITY_KWH = 52;

function computeConsumption(drive) {
  const km = Number(drive.distance_km);
  const socStart = Number(drive.soc_start);
  const socEnd = Number(drive.soc_end);
  if (!Number.isFinite(km) || km < 1) return null;
  if (!Number.isFinite(socStart) || !Number.isFinite(socEnd)) return null;
  // soc values could be 0-1 or 0-100
  const s0 = socStart <= 1 ? socStart : socStart / 100;
  const s1 = socEnd <= 1 ? socEnd : socEnd / 100;
  const delta = s0 - s1;
  if (delta <= 0) return null; // charged during drive? skip
  const kwhUsed = delta * BATTERY_CAPACITY_KWH;
  return (kwhUsed / km) * 100; // kWh/100km
}

export function normalizeData(raw, manualChargeCosts = {}) {
  const rawActivities = (raw.activities || []).map((a) => {
    const kind = a.type === 'Carga' ? 'charge' : 'drive';
    return {
      ...a,
      kind,
      points: Array.isArray(a.points) ? a.points : [],
      samples: Array.isArray(a.samples) ? a.samples : []
    };
  });

  const activities = mergeConsecutiveSegments(rawActivities)
    .map((activity) => {
      activity.calendar_date = activityCalendarDate(activity);
      if (activity.kind === 'charge') {
        activity.charge_category = classifyCharge(activity);
        applyChargeCost(activity, manualChargeCosts);
      }
      if (activity.kind === 'drive') {
        activity.consumption_kwh_100km = computeConsumption(activity);
      }
      return activity;
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const drives = activities.filter((a) => a.kind === 'drive');
  const charges = activities.filter((a) => a.kind === 'charge');
  const days = buildDays(activities);

  return {
    stats: buildStats(raw.stats || {}, drives, charges, activities),
    activities,
    drives,
    charges,
    days
  };
}

const DRIVE_MERGE_MAX_GAP_MIN = 15;
const DRIVE_MERGE_MAX_PLAUSIBLE_SPEED_KMH = 180;
const CHARGE_MERGE_MAX_GAP_MIN = 30;
const HOME_CHARGE_MERGE_MAX_GAP_MIN = 60;
const CHARGE_MERGE_MAX_SOC_GAP_PERCENT = 2;
const CHARGE_MERGE_MAX_DISTANCE_KM = 0.5;

function parseDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function minutesBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return (db.getTime() - da.getTime()) / 60000;
}

function activityStartDate(activity) {
  return String(activity?.start || activity?.date || '').slice(0, 10) || null;
}

function activityCalendarDate(activity) {
  // Para cargas que cruzan medianoche, la actividad pertenece al dia en que empieza.
  // Esto evita que una carga domestica 23:50 -> 00:05 aparezca repartida en dos dias.
  return activity?.calendar_date || activityStartDate(activity) || activity?.date || null;
}

function getRoute(activity) {
  return Array.isArray(activity.route) ? activity.route : [];
}

function getFirstCoord(activity) {
  const route = getRoute(activity);
  if (route.length) return route[0];
  return activity.start_coord || null;
}

function getLastCoord(activity) {
  const route = getRoute(activity);
  if (route.length) return route[route.length - 1];
  return activity.end_coord || null;
}

function validCoord(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const lat = Number(coord[0]);
  const lon = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

function shouldMergeDriveSegments(current, next) {
  if (!current || !next || current.kind !== 'drive' || next.kind !== 'drive') return false;
  const currentDate = current.date || String(current.start || '').slice(0, 10);
  const nextDate = next.date || String(next.start || '').slice(0, 10);
  if (currentDate !== nextDate) return false;

  const gapMin = minutesBetween(current.end, next.start);
  if (!Number.isFinite(gapMin) || gapMin < -1 || gapMin > DRIVE_MERGE_MAX_GAP_MIN) return false;

  const a = validCoord(getLastCoord(current));
  const b = validCoord(getFirstCoord(next));
  if (a && b && gapMin > 0) {
    const gapKm = coordDistanceKm(a, b);
    const requiredSpeed = gapKm / (gapMin / 60);
    if (Number.isFinite(requiredSpeed) && requiredSpeed > DRIVE_MERGE_MAX_PLAUSIBLE_SPEED_KMH) return false;
  }

  const socGap = Number(next.soc_start) - Number(current.soc_end);
  if (Number.isFinite(socGap) && socGap > 3) return false;

  return true;
}

function mergeDrivePair(a, b) {
  const routeA = getRoute(a);
  const routeB = getRoute(b);
  const route = [...routeA, ...routeB];
  const start = a.start || b.start;
  const end = b.end || a.end;
  const durationElapsed = minutesBetween(start, end);
  const durationSum = Number(a.duration_min || 0) + Number(b.duration_min || 0);
  const durationMin = Number.isFinite(durationElapsed) && durationElapsed > 0 ? durationElapsed : durationSum;
  const distanceKm = Number(a.distance_km || 0) + Number(b.distance_km || 0);
  const weightedSpeedNumerator =
    Number(a.avg_speed_kmh || 0) * Number(a.duration_min || 0) +
    Number(b.avg_speed_kmh || 0) * Number(b.duration_min || 0);
  const weightedSpeedDenominator = Number(a.duration_min || 0) + Number(b.duration_min || 0);
  const avgSpeed = weightedSpeedDenominator > 0
    ? weightedSpeedNumerator / weightedSpeedDenominator
    : (durationMin > 0 ? distanceKm / durationMin * 60 : null);

  const mergedSegments = [
    ...(Array.isArray(a.merged_segments) ? a.merged_segments : [a.id]),
    ...(Array.isArray(b.merged_segments) ? b.merged_segments : [b.id])
  ];

  return {
    ...a,
    id: `merged-${mergedSegments.join('__')}`,
    file: [a.file, b.file].filter(Boolean).join(' + '),
    title: 'Trayecto unido',
    date: activityStartDate(a) || String(start || '').slice(0, 10),
    calendar_date: activityCalendarDate(a) || activityStartDate(a) || String(start || '').slice(0, 10),
    start,
    end,
    start_time: a.start_time,
    end_time: b.end_time,
    duration_min: durationMin,
    duration: durationMin,
    distance_km: distanceKm,
    end_label: b.end_label,
    end_coord: b.end_coord,
    soc_end: b.soc_end,
    soc_delta: Number.isFinite(Number(a.soc_start)) && Number.isFinite(Number(b.soc_end)) ? Number(b.soc_end) - Number(a.soc_start) : null,
    energy_kwh: Number(a.energy_kwh || 0) + Number(b.energy_kwh || 0),
    odo_end: b.odo_end,
    avg_speed_kmh: avgSpeed,
    max_speed_kmh: Math.max(Number(a.max_speed_kmh || 0), Number(b.max_speed_kmh || 0)) || null,
    route,
    merged: true,
    merged_segments: mergedSegments,
    merged_count: mergedSegments.length
  };
}

function getSocPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}

function getChargeSeries(activity) {
  return Array.isArray(activity.charge_series) ? activity.charge_series : [];
}

function getChargeLocationText(activity) {
  return [activity.start_label, activity.end_label, activity.location, activity.location_name, activity.title]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();
}

function sameChargeLocation(current, next) {
  const a = validCoord(getLastCoord(current));
  const b = validCoord(getFirstCoord(next));
  if (a && b) {
    const distanceKm = coordDistanceKm(a, b);
    return Number.isFinite(distanceKm) && distanceKm <= CHARGE_MERGE_MAX_DISTANCE_KM;
  }

  const textA = getChargeLocationText(current);
  const textB = getChargeLocationText(next);
  if (!textA || !textB) return true;
  return textA === textB || textA.includes(textB) || textB.includes(textA);
}

function shouldMergeChargeSegments(current, next) {
  if (!current || !next || current.kind !== 'charge' || next.kind !== 'charge') return false;

  const gapMin = minutesBetween(current.end, next.start);
  if (!Number.isFinite(gapMin) || gapMin < -1) return false;

  const bothHome = isHomeCharge(current) && isHomeCharge(next);
  const maxGapMin = bothHome ? HOME_CHARGE_MERGE_MAX_GAP_MIN : CHARGE_MERGE_MAX_GAP_MIN;
  if (gapMin > maxGapMin) return false;

  const currentEndSoc = getSocPercent(current.soc_end);
  const nextStartSoc = getSocPercent(next.soc_start);
  if (Number.isFinite(currentEndSoc) && Number.isFinite(nextStartSoc)) {
    const socGap = Math.abs(nextStartSoc - currentEndSoc);
    if (socGap > CHARGE_MERGE_MAX_SOC_GAP_PERCENT) return false;
  }

  // Caso habitual en casa: el cargador corta cerca de medianoche y continua pocos minutos despues.
  // Si ambas sesiones son de casa, no exigimos que caigan en el mismo dia ni que el texto de ubicacion sea identico.
  if (bothHome) return true;

  if (!sameChargeLocation(current, next)) return false;

  return true;
}

function mergeChargePair(a, b) {
  const start = a.start || b.start;
  const end = b.end || a.end;
  const durationSum = Number(a.duration_min || 0) + Number(b.duration_min || 0);
  const energyKwh = Number(a.energy_kwh || 0) + Number(b.energy_kwh || 0);
  const weightedPowerNumerator =
    Number(a.avg_power_kw || 0) * Number(a.duration_min || 0) +
    Number(b.avg_power_kw || 0) * Number(b.duration_min || 0);
  const weightedPowerDenominator = Number(a.duration_min || 0) + Number(b.duration_min || 0);
  const avgPower = weightedPowerDenominator > 0
    ? weightedPowerNumerator / weightedPowerDenominator
    : (durationSum > 0 ? energyKwh / (durationSum / 60) : null);

  const mergedSegments = [
    ...(Array.isArray(a.merged_segments) ? a.merged_segments : [a.id]),
    ...(Array.isArray(b.merged_segments) ? b.merged_segments : [b.id])
  ];

  const series = [...getChargeSeries(a), ...getChargeSeries(b)].sort((x, y) => {
    const tx = Array.isArray(x) ? x[0] : (x?.timestamp || x?.time || x?.utc || '');
    const ty = Array.isArray(y) ? y[0] : (y?.timestamp || y?.time || y?.utc || '');
    return String(tx).localeCompare(String(ty));
  });

  return {
    ...a,
    id: `merged-charge-${mergedSegments.join('__')}`,
    file: [a.file, b.file].filter(Boolean).join(' + '),
    title: 'Carga unida',
    date: activityStartDate(a) || String(start || '').slice(0, 10),
    calendar_date: activityCalendarDate(a) || activityStartDate(a) || String(start || '').slice(0, 10),
    start,
    end,
    start_time: a.start_time,
    end_time: b.end_time,
    duration_min: durationSum,
    duration: durationSum,
    energy_kwh: energyKwh,
    end_label: b.end_label,
    end_coord: b.end_coord,
    soc_end: b.soc_end,
    soc_delta: Number.isFinite(Number(a.soc_start)) && Number.isFinite(Number(b.soc_end)) ? Number(b.soc_end) - Number(a.soc_start) : null,
    avg_power_kw: avgPower,
    max_power_kw: Math.max(Number(a.max_power_kw || 0), Number(b.max_power_kw || 0)) || null,
    charge_series: series,
    samples: [...(Array.isArray(a.samples) ? a.samples : []), ...(Array.isArray(b.samples) ? b.samples : [])],
    merged: true,
    merged_charge: true,
    merged_segments: mergedSegments,
    merged_count: mergedSegments.length
  };
}

function mergeConsecutiveSegments(activities) {
  const sorted = [...activities].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const result = [];
  for (const activity of sorted) {
    const last = result[result.length - 1];
    if (shouldMergeDriveSegments(last, activity)) {
      result[result.length - 1] = mergeDrivePair(last, activity);
    } else if (shouldMergeChargeSegments(last, activity)) {
      result[result.length - 1] = mergeChargePair(last, activity);
    } else {
      result.push(activity);
    }
  }
  return result;
}

function labelText(charge) {
  return [charge.start_label, charge.end_label, charge.location, charge.location_name, charge.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function coordDistanceKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const [lat1, lon1] = a.map(Number);
  const [lat2, lon2] = b.map(Number);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}

function isHomeCharge(charge) {
  const text = labelText(charge);
  if (text.includes('avenida de europa')) return true;

  // Coordenadas aproximadas de casa en las exportaciones actuales de ABRP.
  // Si en el futuro quieres cambiarlo, lo movemos a configuración.
  const home = [40.44465, -3.78376];
  const startDistance = coordDistanceKm(charge.start_coord, home);
  const endDistance = coordDistanceKm(charge.end_coord, home);
  return [startDistance, endDistance].some((distance) => Number.isFinite(distance) && distance < 0.25);
}

function isDcCharge(charge) {
  const text = labelText(charge);
  if (text.includes(' dc') || text.includes('ccs') || text.includes('fast') || text.includes('rápida') || text.includes('rapida')) return true;
  const maxPower = Number(charge.max_power_kw || 0);
  const avgPower = Number(charge.avg_power_kw || 0);
  // Por encima de 22 kW lo tratamos como DC. En AC doméstica/pública normal no debería pasar de ahí.
  return maxPower > 22 || avgPower > 22;
}

export function classifyCharge(charge) {
  if (isDcCharge(charge)) return 'dc';
  return isHomeCharge(charge) ? 'ac_home' : 'ac_away';
}

function applyChargeCost(charge, manualChargeCosts) {
  const kwh = Number(charge.energy_kwh || 0);
  if (charge.charge_category === 'ac_home') {
    charge.cost_eur = Number.isFinite(kwh) ? kwh * HOME_KWH_PRICE_EUR : null;
    charge.cost_source = 'home_auto';
    charge.home_kwh_price_eur = HOME_KWH_PRICE_EUR;
    return charge;
  }

  const manual = Number(manualChargeCosts?.[charge.id]);
  charge.cost_eur = Number.isFinite(manual) ? manual : null;
  charge.cost_source = Number.isFinite(manual) ? 'manual' : 'pending';
  return charge;
}

function buildStats(baseStats, drives, charges, activities) {
  const breakdown = {
    ac_home_minutes: 0,
    ac_away_minutes: 0,
    dc_minutes: 0,
    ac_max_power_kw: 0,
    dc_max_power_kw: 0,
    ac_home_count: 0,
    ac_away_count: 0,
    dc_count: 0,
    home_cost_eur: 0,
    away_registered_cost_eur: 0,
    known_cost_eur: 0,
    pending_cost_count: 0
  };

  charges.forEach((charge) => {
    const minutes = Number(charge.duration_min || 0);
    const maxPower = Number(charge.max_power_kw || 0);
    const cost = Number(charge.cost_eur);
    if (Number.isFinite(cost)) breakdown.known_cost_eur += cost;
    if (charge.cost_source === 'pending') breakdown.pending_cost_count += 1;

    if (charge.charge_category === 'dc') {
      breakdown.dc_minutes += minutes;
      breakdown.dc_count += 1;
      breakdown.dc_max_power_kw = Math.max(breakdown.dc_max_power_kw, maxPower);
      if (Number.isFinite(cost)) breakdown.away_registered_cost_eur += cost;
    } else if (charge.charge_category === 'ac_home') {
      breakdown.ac_home_minutes += minutes;
      breakdown.ac_home_count += 1;
      breakdown.ac_max_power_kw = Math.max(breakdown.ac_max_power_kw, maxPower);
      if (Number.isFinite(cost)) breakdown.home_cost_eur += cost;
    } else {
      breakdown.ac_away_minutes += minutes;
      breakdown.ac_away_count += 1;
      breakdown.ac_max_power_kw = Math.max(breakdown.ac_max_power_kw, maxPower);
      if (Number.isFinite(cost)) breakdown.away_registered_cost_eur += cost;
    }
  });

  const consumptions = drives.map((d) => d.consumption_kwh_100km).filter(Number.isFinite);
  const avgConsumption = consumptions.length ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length : null;
  const minConsumption = consumptions.length ? Math.min(...consumptions) : null;
  const maxConsumption = consumptions.length ? Math.max(...consumptions) : null;
  const totalKm = drives.reduce((sum, d) => sum + Number(d.distance_km || 0), 0);
  const estimatedRange = avgConsumption > 0 ? (BATTERY_CAPACITY_KWH / avgConsumption) * 100 : null;

  return {
    ...baseStats,
    activities: activities.length,
    drives: drives.length,
    charges: charges.length,
    drive_minutes: drives.reduce((sum, drive) => sum + Number(drive.duration_min || 0), 0) || baseStats.drive_minutes || 0,
    charge_minutes: charges.reduce((sum, charge) => sum + Number(charge.duration_min || 0), 0) || baseStats.charge_minutes || 0,
    charge_kwh: charges.reduce((sum, charge) => sum + Number(charge.energy_kwh || 0), 0) || baseStats.charge_kwh || 0,
    longest_drive_km: drives.reduce((max, drive) => Math.max(max, Number(drive.distance_km || 0)), 0),
    max_drive_speed_kmh: drives.reduce((max, drive) => Math.max(max, Number(drive.max_speed_kmh || 0)), 0),
    total_km: totalKm,
    avg_consumption: avgConsumption,
    min_consumption: minConsumption,
    max_consumption: maxConsumption,
    estimated_range_km: estimatedRange,
    consumption_samples: consumptions.length,
    merged_drives: drives.filter((drive) => drive.merged).length,
    merged_charges: charges.filter((charge) => charge.merged_charge).length,
    charge_breakdown: breakdown
  };
}

export function buildDays(activities) {
  const byDate = new Map();
  activities.forEach((activity) => {
    const date = activityCalendarDate(activity) || activity.date || (activity.start || '').slice(0, 10);
    if (!date) return;
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        activities: [],
        drives: 0,
        charges: 0,
        km: 0,
        kwh: 0,
        minutes_drive: 0,
        minutes_charge: 0,
        max_speed: null,
        avg_speed_weighted_sum: 0,
        avg_speed_weight: 0
      });
    }
    const day = byDate.get(date);
    day.activities.push(activity);
    if (activity.kind === 'drive') {
      day.drives += 1;
      day.km += Number(activity.distance_km || 0);
      day.minutes_drive += Number(activity.duration_min || 0);
      if (activity.max_speed_kmh !== null && activity.max_speed_kmh !== undefined) {
        day.max_speed = Math.max(day.max_speed ?? 0, Number(activity.max_speed_kmh));
      }
      if (activity.avg_speed_kmh && activity.duration_min) {
        day.avg_speed_weighted_sum += Number(activity.avg_speed_kmh) * Number(activity.duration_min);
        day.avg_speed_weight += Number(activity.duration_min);
      }
    } else {
      day.charges += 1;
      day.kwh += Number(activity.energy_kwh || 0);
      day.minutes_charge += Number(activity.duration_min || 0);
    }
  });

  return Array.from(byDate.values())
    .map((day) => ({
      ...day,
      avg_speed: day.avg_speed_weight ? day.avg_speed_weighted_sum / day.avg_speed_weight : null,
      activities: day.activities.sort((a, b) => String(a.start).localeCompare(String(b.start)))
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function calendarRange(days) {
  if (!days.length) return [];
  const first = new Date(`${days[0].date}T12:00:00`);
  const last = new Date(`${days[days.length - 1].date}T12:00:00`);
  const start = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth() + 1, 0);
  const result = [];
  const d = new Date(start);
  while (d <= end) {
    result.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return result;
}

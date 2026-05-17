export function fmtNumber(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(value));
}

export function fmtKm(value) {
  return `${fmtNumber(value, value && value < 10 ? 1 : 0)} km`;
}

export function fmtKwh(value) {
  return `${fmtNumber(value, 1)} kWh`;
}

export function fmtEur(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value));
}

export function fmtPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${fmtNumber(n <= 1 ? n * 100 : n, 0)}%`;
}

export function fmtMinutes(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '—';
  const total = Math.round(Number(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return `${h} h ${m} min`;
}

export function dayLabel(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function dateTimeLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

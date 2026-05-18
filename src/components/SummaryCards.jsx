import { fmtEur, fmtKwh, fmtKm, fmtMinutes, fmtNumber } from '../utils/formatters.js';
import { HOME_KWH_PRICE_EUR } from '../utils/calculations.js';

/* ── SVG Icons (inline, no dependencies) ── */
const icons = {
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  road: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19L8 5" /><path d="M16 5l4 14" /><path d="M12 6v2" /><path d="M12 12v2" /><path d="M12 18v2" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  plug: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" /><path d="M9 7V2" /><path d="M15 7V2" /><rect x="6" y="7" width="12" height="5" rx="1" /><path d="M8 12v2a4 4 0 008 0v-2" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 2" />
    </svg>
  ),
  gauge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15l3.5-7" /><circle cx="12" cy="12" r="10" />
    </svg>
  ),
  euro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12" /><path d="M4 14h9" /><path d="M17 4a8 8 0 010 16" />
    </svg>
  ),
};

function Card({ icon, iconColor, label, value, hint }) {
  return (
    <article className="summary-card">
      <div className={`card-icon ${iconColor || ''}`}>{icon}</div>
      <span className="card-label">{label}</span>
      <strong className="card-value">{value}</strong>
      {hint ? <small className="card-hint">{hint}</small> : null}
    </article>
  );
}

export default function SummaryCards({ data }) {
  const { stats } = data;
  const b = stats.charge_breakdown || {};

  return (
    <section className="summary-grid">
      <Card icon={icons.gauge} label="Consumo medio" value={stats.avg_consumption ? `${fmtNumber(stats.avg_consumption, 1)} kWh` : '—'} hint={stats.consumption_samples ? `${stats.consumption_samples} trayectos · /100km` : 'sin datos'} />
      <Card icon={icons.road}  iconColor="blue" label="Autonomía real estimada" value={stats.estimated_range_km ? fmtKm(stats.estimated_range_km) : '—'} hint="batería 52 kWh completa" />
      <Card icon={icons.bolt}  label="Energía cargada" value={fmtKwh(stats.charge_kwh)} hint={`${stats.charges || 0} sesiones`} />
      <Card icon={icons.clock} iconColor="blue" label="Tiempo conduciendo" value={fmtMinutes(stats.drive_minutes)} hint={`${stats.drives || 0} trayectos`} />
      <Card icon={icons.road}  iconColor="blue" label="Trayecto más largo" value={fmtKm(stats.longest_drive_km)} hint="máximo del periodo" />
      <Card icon={icons.home}  label="AC en casa" value={`${b.ac_home_count || 0}`} hint={fmtMinutes(b.ac_home_minutes)} />
      <Card icon={icons.plug}  iconColor="purple" label="AC fuera" value={`${b.ac_away_count || 0}`} hint={fmtMinutes(b.ac_away_minutes)} />
      <Card icon={icons.gauge} label="Pico AC" value={`${fmtNumber(b.ac_max_power_kw, 1)} kW`} hint="máximo real AC" />
      <Card icon={icons.gauge} iconColor="purple" label="Pico DC" value={`${fmtNumber(b.dc_max_power_kw, 1)} kW`} hint="máximo real DC" />
      <Card icon={icons.euro}  iconColor="amber" label="Coste casa" value={fmtEur(b.home_cost_eur)} hint={`${fmtNumber(HOME_KWH_PRICE_EUR, 4)} €/kWh`} />
      <Card icon={icons.euro}  iconColor="amber" label="Coste fuera" value={fmtEur(b.away_registered_cost_eur)} hint={`${b.pending_cost_count || 0} pendientes`} />
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import SummaryCards from './components/SummaryCards.jsx';
import CalendarView from './components/CalendarView.jsx';
import MapView from './components/MapView.jsx';
import ChargingCurve from './components/ChargingCurve.jsx';
import DailyCharts from './components/DailyCharts.jsx';
import ConsumptionChart from './components/ConsumptionChart.jsx';
import SocHistory from './components/SocHistory.jsx';
import ActivityDetail from './components/ActivityDetail.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import { normalizeData, HOME_KWH_PRICE_EUR } from './utils/calculations.js';
import { loadActivities, saveActivities, deleteAllActivities, deleteActivity, loadManualCosts, saveManualCosts } from './utils/supabase.js';
import { dateTimeLabel, fmtEur, fmtKm, fmtKwh, fmtMinutes, fmtNumber, fmtPercent } from './utils/formatters.js';
import './styles.css';

const MANUAL_CHARGE_COSTS_KEY = 'r5_abrp_manual_charge_costs_v1';
const IMPORTED_ACTIVITIES_KEY = 'r5_abrp_imported_activities_v2';

function loadLocalActivities() {
  try { return JSON.parse(localStorage.getItem(IMPORTED_ACTIVITIES_KEY) || '[]'); }
  catch { return []; }
}
function loadLocalCosts() {
  try { return JSON.parse(localStorage.getItem(MANUAL_CHARGE_COSTS_KEY) || '{}'); }
  catch { return {}; }
}

function mergeActivities(existing, incoming) {
  const byId = new Map();
  existing.forEach((a) => byId.set(a.id, a));
  let added = 0, updated = 0;
  incoming.forEach((a) => {
    if (!a?.id) return;
    if (byId.has(a.id)) { byId.set(a.id, a); updated += 1; }
    else { byId.set(a.id, a); added += 1; }
  });
  return { activities: Array.from(byId.values()), added, updated };
}

function buildData(activities, manualChargeCosts) {
  if (!activities.length) return null;
  const sorted = [...activities].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const raw = { activities: sorted, stats: { files: new Set(sorted.map((a) => a.file || a.id)).size, activities: sorted.length } };
  return normalizeData(raw, manualChargeCosts);
}

/* ── Sidebar nav ── */
const NAV_ITEMS = [
  { id: 'resumen', label: 'Resumen', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'viajes',  label: 'Viajes',  icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { id: 'cargas',  label: 'Cargas',  icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'ajustes', label: 'Ajustes', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

function NavIcon({ d }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/* ── Charge Summary Cards (for Cargas view) ── */
function ChargeSummaryCards({ data }) {
  const { stats } = data;
  const b = stats.charge_breakdown || {};
  const totalKwh = stats.charge_kwh || 0;
  const totalSessions = (b.ac_home_count || 0) + (b.ac_away_count || 0) + (b.dc_count || 0);
  const totalCost = (b.home_cost_eur || 0) + (b.away_registered_cost_eur || 0);
  const avgPerSession = totalSessions > 0 ? totalKwh / totalSessions : 0;

  return (
    <div className="summary-grid charge-summary-grid">
      <article className="summary-card">
        <div className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
        <span className="card-label">Energía total</span>
        <strong className="card-value">{fmtKwh(totalKwh)}</strong>
        <small className="card-hint">{totalSessions} sesiones</small>
      </article>
      <article className="summary-card">
        <div className="card-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15l3.5-7"/><circle cx="12" cy="12" r="10"/></svg></div>
        <span className="card-label">Pico DC</span>
        <strong className="card-value">{fmtNumber(b.dc_max_power_kw, 1)} kW</strong>
        <small className="card-hint">{b.dc_count || 0} cargas DC</small>
      </article>
      <article className="summary-card">
        <div className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15l3.5-7"/><circle cx="12" cy="12" r="10"/></svg></div>
        <span className="card-label">Pico AC</span>
        <strong className="card-value">{fmtNumber(b.ac_max_power_kw, 1)} kW</strong>
        <small className="card-hint">{(b.ac_home_count || 0) + (b.ac_away_count || 0)} cargas AC</small>
      </article>
      <article className="summary-card">
        <div className="card-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
        <span className="card-label">Media por sesión</span>
        <strong className="card-value">{fmtNumber(avgPerSession, 1)} kWh</strong>
        <small className="card-hint">media del periodo</small>
      </article>
      <article className="summary-card">
        <div className="card-icon amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12"/><path d="M4 14h9"/><path d="M17 4a8 8 0 010 16"/></svg></div>
        <span className="card-label">Coste total</span>
        <strong className="card-value">{fmtEur(totalCost)}</strong>
        <small className="card-hint">casa + fuera</small>
      </article>
      <article className="summary-card">
        <div className="card-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="18" height="12" rx="2"/><path d="M23 13v-2"/></svg></div>
        <span className="card-label">Capacidad real estimada</span>
        <strong className="card-value">{stats.avg_implied_capacity_kwh ? `${fmtNumber(stats.avg_implied_capacity_kwh, 1)} kWh` : '—'}</strong>
        <small className="card-hint">{stats.implied_capacity_samples || 0} cargas analizadas</small>
      </article>
    </div>
  );
}

export default function App() {
  const [activities, setActivities] = useState([]);
  const [manualChargeCosts, setManualChargeCosts] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('');
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activeView, setActiveView] = useState('resumen');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        setSyncStatus('Sincronizando…');
        const [remote, remoteCosts] = await Promise.all([loadActivities(), loadManualCosts()]);
        const local = loadLocalActivities();
        if (local.length && !remote.length) {
          setSyncStatus('Migrando…');
          await saveActivities(local);
          const localCosts = loadLocalCosts();
          if (Object.keys(localCosts).length) await saveManualCosts(localCosts);
          setActivities(local);
          setManualChargeCosts(localCosts);
          setSyncStatus('✓ Migrado');
        } else {
          if (local.length && remote.length) {
            const merged = mergeActivities(remote, local);
            if (merged.added > 0) {
              const localOnlyIds = new Set(local.map((a) => a.id));
              const newOnes = merged.activities.filter((a) => localOnlyIds.has(a.id) && !remote.find((r) => r.id === a.id));
              if (newOnes.length) await saveActivities(newOnes);
              setActivities(merged.activities);
            } else { setActivities(remote); }
          } else { setActivities(remote); }
          setManualChargeCosts(remoteCosts || {});
          setSyncStatus(remote.length ? `✓ ${remote.length} act.` : '');
        }
      } catch (err) {
        console.warn('Supabase unavailable:', err);
        setActivities(loadLocalActivities());
        setManualChargeCosts(loadLocalCosts());
        setSyncStatus('⚠ Local');
      }
      setLoading(false);
    }
    init();
  }, []);

  const data = useMemo(() => buildData(activities, manualChargeCosts), [activities, manualChargeCosts]);

  useEffect(() => {
    if (!data || !selectedActivity) return;
    const updated = data.activities.find((a) => a.id === selectedActivity.id);
    if (updated && updated !== selectedActivity) setSelectedActivity(updated);
  }, [data, selectedActivity]);

  useEffect(() => {
    if (!data || selectedDate) return;
    setSelectedDate(data.days[0]?.date || null);
  }, [data, selectedDate]);

  const selectedDay = useMemo(() => {
    if (!data || !selectedDate) return null;
    return data.days.find((d) => d.date === selectedDate) || null;
  }, [data, selectedDate]);

  const mapActivities = useMemo(() => {
    if (!data) return [];
    return selectedDate ? (selectedDay?.activities || []) : (data.activities || []);
  }, [data, selectedDate, selectedDay]);

  const handleSelectDate = useCallback((date) => { setSelectedDate(date); setSelectedActivity(null); }, []);
  const handleSelectActivity = useCallback((activity) => { setSelectedActivity(activity); if (activity?.date) setSelectedDate(activity.date); }, []);

  const handleImportActivities = useCallback(async (incoming) => {
    const result = mergeActivities(activities, incoming || []);
    setActivities(result.activities);
    try { setSyncStatus('Subiendo…'); await saveActivities(incoming || []); setSyncStatus(`✓ ${result.activities.length} act.`); }
    catch (err) { console.warn(err); setSyncStatus('⚠ Local'); }
    localStorage.setItem(IMPORTED_ACTIVITIES_KEY, JSON.stringify(result.activities));
    return result;
  }, [activities]);

  const handleClearImported = useCallback(async () => {
    if (!window.confirm('¿Borrar todas las actividades?')) return;
    try { setSyncStatus('Borrando…'); await deleteAllActivities(); setSyncStatus(''); }
    catch (err) { console.warn(err); setSyncStatus('⚠ Error'); }
    setActivities([]); localStorage.removeItem(IMPORTED_ACTIVITIES_KEY);
    setSelectedActivity(null); setSelectedDate(null);
  }, []);

  const handleFactoryReset = useCallback(async () => {
    if (!window.confirm('¿Reiniciar completamente?')) return;
    try { await deleteAllActivities(); } catch (err) { console.warn(err); }
    Object.keys(localStorage).filter((k) => k.startsWith('r5_abrp_')).forEach((k) => localStorage.removeItem(k));
    setActivities([]); setManualChargeCosts({}); setSelectedActivity(null); setSelectedDate(null); setSyncStatus('');
  }, []);

  const handleExportBackup = useCallback(() => {
    const payload = { version: 1, exported_at: new Date().toISOString(), activities };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'r5_abrp_backup.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, [activities]);

  const handleImportBackup = useCallback((payload) => {
    const list = Array.isArray(payload?.activities) ? payload.activities : Array.isArray(payload) ? payload : [];
    return handleImportActivities(list);
  }, [handleImportActivities]);

  const handleDeleteActivity = useCallback(async (activityId) => {
    if (!window.confirm('¿Borrar esta actividad?')) return;
    const filtered = activities.filter((a) => a.id !== activityId);
    setActivities(filtered);
    if (selectedActivity?.id === activityId) setSelectedActivity(null);
    localStorage.setItem(IMPORTED_ACTIVITIES_KEY, JSON.stringify(filtered));
    try { await deleteActivity(activityId); setSyncStatus(`✓ ${filtered.length} act.`); }
    catch (err) { console.warn(err); setSyncStatus('⚠ Error'); }
  }, [activities, selectedActivity]);

  const handleSaveChargeCost = useCallback((chargeId, value) => {
    setManualChargeCosts((current) => {
      const next = { ...current };
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) delete next[chargeId];
      else next[chargeId] = numeric;
      saveManualCosts(next).catch(console.warn);
      localStorage.setItem(MANUAL_CHARGE_COSTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  function navigateTo(viewId) { setActiveView(viewId); setSidebarOpen(false); }

  if (loading) {
    return <div className="app-loading"><div className="loading-spinner" /><p>Cargando datos…</p></div>;
  }

  const hasData = data && data.activities.length > 0;

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">R5</div>
          <span className="sidebar-title">ABRP Dashboard</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item${activeView === item.id ? ' active' : ''}`} onClick={() => navigateTo(item.id)}>
              <NavIcon d={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {syncStatus && <span className="sync-badge">{syncStatus}</span>}
          <small className="sidebar-version">v0.3.0</small>
        </div>
      </aside>

      {/* ── Mobile topbar ── */}
      <header className="mobile-topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menú">
          <span /><span /><span />
        </button>
        <h1>R5 ABRP</h1>
        {syncStatus && <span className="sync-badge small">{syncStatus}</span>}
      </header>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── Main ── */}
      <main className="main-content">
        {!hasData && activeView !== 'ajustes' ? (
          <div className="empty-state">
            <div>
              <h2>Sin datos cargados</h2>
              <p>Importa tus Excel de ABRP para empezar.</p>
              <button className="ghost-button" onClick={() => navigateTo('ajustes')} style={{ marginTop: '1rem' }}>Ir a Ajustes → Importar</button>
            </div>
          </div>
        ) : (
          <>
            {/* ══ RESUMEN ══ */}
            {activeView === 'resumen' && hasData && (
              <section className="view-section">
                <SummaryCards data={data} />
                <DailyCharts days={data.days} />
                <ConsumptionChart drives={data.drives} avgConsumption={data.stats.avg_consumption} />
              </section>
            )}

            {/* ══ VIAJES ══ */}
            {activeView === 'viajes' && hasData && (
              <section className="view-section">
                <div className="view-header">
                  <h2>Viajes</h2>
                  {selectedActivity && (
                    <button className="ghost-button compact" onClick={() => setSelectedActivity(null)}>← Volver al calendario</button>
                  )}
                </div>

                <CalendarView days={data.days} selectedDate={selectedDate} onSelectDate={handleSelectDate} onSelectActivity={handleSelectActivity} />
                <MapView activities={mapActivities} selectedDate={selectedDate} selectedActivity={selectedActivity} onSelectActivity={handleSelectActivity} />
                {selectedActivity && (
                  <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} onDeleteActivity={handleDeleteActivity} />
                )}
              </section>
            )}

            {/* ══ CARGAS ══ */}
            {activeView === 'cargas' && hasData && (
              <section className="view-section">
                <div className="view-header">
                  <h2>Cargas</h2>
                  {selectedActivity && (
                    <button className="ghost-button compact" onClick={() => setSelectedActivity(null)}>← Volver</button>
                  )}
                </div>

                <ChargeSummaryCards data={data} />
                <SocHistory activities={data.activities} />
                <CalendarView days={data.days} selectedDate={selectedDate} onSelectDate={handleSelectDate} onSelectActivity={handleSelectActivity} />
                <ChargingCurve charges={data.charges} selectedActivity={selectedActivity} onSelectCharge={handleSelectActivity} />
                {selectedActivity && (
                  <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} onDeleteActivity={handleDeleteActivity} />
                )}
              </section>
            )}

            {/* ══ AJUSTES ══ */}
            {activeView === 'ajustes' && (
              <section className="view-section">
                <div className="view-header">
                  <h2>Ajustes</h2>
                  <span className="muted">Importar datos y gestionar el dashboard</span>
                </div>
                <ImportPanel
                  importedActivities={activities}
                  onImportActivities={handleImportActivities}
                  onClearImported={handleClearImported}
                  onFactoryReset={handleFactoryReset}
                  onExportBackup={handleExportBackup}
                  onImportBackup={handleImportBackup}
                />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

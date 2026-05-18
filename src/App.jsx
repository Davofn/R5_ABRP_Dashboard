import { useCallback, useEffect, useMemo, useState } from 'react';
import SummaryCards from './components/SummaryCards.jsx';
import CalendarView from './components/CalendarView.jsx';
import MapView from './components/MapView.jsx';
import ChargingCurve from './components/ChargingCurve.jsx';
import DailyCharts from './components/DailyCharts.jsx';
import ActivityDetail from './components/ActivityDetail.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import { normalizeData } from './utils/calculations.js';
import { loadActivities, saveActivities, deleteAllActivities, deleteActivity, loadManualCosts, saveManualCosts } from './utils/supabase.js';
import { dateTimeLabel, fmtKm, fmtKwh, fmtMinutes, fmtNumber } from './utils/formatters.js';
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

/* ── Sidebar nav items ── */
const NAV_ITEMS = [
  { id: 'resumen',    label: 'Resumen',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'viajes',     label: 'Viajes',     icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { id: 'cargas',     label: 'Cargas',     icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'calendario', label: 'Calendario', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'ajustes',    label: 'Ajustes',    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
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
  const [showImport, setShowImport] = useState(false);
  const [activeView, setActiveView] = useState('resumen');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        setSyncStatus('Sincronizando…');
        const [remote, remoteCosts] = await Promise.all([loadActivities(), loadManualCosts()]);
        const local = loadLocalActivities();
        if (local.length && !remote.length) {
          setSyncStatus('Migrando datos locales a la nube…');
          await saveActivities(local);
          const localCosts = loadLocalCosts();
          if (Object.keys(localCosts).length) await saveManualCosts(localCosts);
          setActivities(local);
          setManualChargeCosts(localCosts);
          setSyncStatus('✓ Migrado a Supabase');
        } else {
          if (local.length && remote.length) {
            const merged = mergeActivities(remote, local);
            if (merged.added > 0) {
              const localOnlyIds = new Set(local.map((a) => a.id));
              const newOnes = merged.activities.filter((a) => localOnlyIds.has(a.id) && !remote.find((r) => r.id === a.id));
              if (newOnes.length) await saveActivities(newOnes);
              setActivities(merged.activities);
            } else {
              setActivities(remote);
            }
          } else {
            setActivities(remote);
          }
          setManualChargeCosts(remoteCosts || {});
          setSyncStatus(remote.length ? `✓ ${remote.length} actividades` : '');
        }
      } catch (err) {
        console.warn('Supabase unavailable, using localStorage:', err);
        setActivities(loadLocalActivities());
        setManualChargeCosts(loadLocalCosts());
        setSyncStatus('⚠ Modo local');
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
    try {
      setSyncStatus('Subiendo…');
      await saveActivities(incoming || []);
      setSyncStatus(`✓ ${result.activities.length} actividades`);
    } catch (err) {
      console.warn('Supabase save failed, saved locally:', err);
      setSyncStatus('⚠ Guardado local');
    }
    localStorage.setItem(IMPORTED_ACTIVITIES_KEY, JSON.stringify(result.activities));
    return result;
  }, [activities]);

  const handleClearImported = useCallback(async () => {
    if (!window.confirm('¿Borrar todas las actividades? Se eliminan de la nube y del navegador.')) return;
    try { setSyncStatus('Borrando…'); await deleteAllActivities(); setSyncStatus(''); }
    catch (err) { console.warn(err); setSyncStatus('⚠ Error al borrar'); }
    setActivities([]); localStorage.removeItem(IMPORTED_ACTIVITIES_KEY);
    setSelectedActivity(null); setSelectedDate(null);
  }, []);

  const handleFactoryReset = useCallback(async () => {
    if (!window.confirm('¿Reiniciar completamente? Se borran actividades y costes de la nube y el navegador.')) return;
    try { await deleteAllActivities(); } catch (err) { console.warn(err); }
    Object.keys(localStorage).filter((k) => k.startsWith('r5_abrp_')).forEach((k) => localStorage.removeItem(k));
    setActivities([]); setManualChargeCosts({}); setSelectedActivity(null); setSelectedDate(null); setSyncStatus('');
  }, []);

  const handleExportBackup = useCallback(() => {
    const payload = { version: 1, exported_at: new Date().toISOString(), activities };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'r5_abrp_dashboard_backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [activities]);

  const handleImportBackup = useCallback((payload) => {
    const list = Array.isArray(payload?.activities) ? payload.activities : Array.isArray(payload) ? payload : [];
    return handleImportActivities(list);
  }, [handleImportActivities]);

  const handleDeleteActivity = useCallback(async (activityId) => {
    if (!window.confirm('¿Borrar esta actividad? Se elimina de la nube y del navegador.')) return;
    const filtered = activities.filter((a) => a.id !== activityId);
    setActivities(filtered);
    if (selectedActivity?.id === activityId) setSelectedActivity(null);
    localStorage.setItem(IMPORTED_ACTIVITIES_KEY, JSON.stringify(filtered));
    try { await deleteActivity(activityId); setSyncStatus(`✓ ${filtered.length} actividades`); }
    catch (err) { console.warn(err); setSyncStatus('⚠ Error al borrar'); }
  }, [activities, selectedActivity]);

  const handleSaveChargeCost = useCallback((chargeId, value) => {
    setManualChargeCosts((current) => {
      const next = { ...current };
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) delete next[chargeId];
      else next[chargeId] = numeric;
      saveManualCosts(next).catch((err) => console.warn('Cost save error:', err));
      localStorage.setItem(MANUAL_CHARGE_COSTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  function navigateTo(viewId) {
    setActiveView(viewId);
    setSidebarOpen(false);
    if (viewId === 'ajustes') setShowImport(true);
  }

  /* ── Render ── */
  if (loading) {
    return <div className="app-loading"><div className="loading-spinner" /><p>Cargando datos ABRP…</p></div>;
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
            <button
              key={item.id}
              className={`nav-item${activeView === item.id ? ' active' : ''}`}
              onClick={() => navigateTo(item.id)}
            >
              <NavIcon d={item.icon} />
              <span>{item.label}</span>
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

      {/* ── Main content ── */}
      <main className="main-content">
        {!hasData && activeView !== 'ajustes' ? (
          <div className="empty-state">
            <div>
              <h2>Sin datos cargados</h2>
              <p>Importa tus Excel de ABRP para empezar.</p>
              <button className="ghost-button" onClick={() => navigateTo('ajustes')} style={{ marginTop: '1rem' }}>
                Ir a Ajustes → Importar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── RESUMEN ── */}
            {activeView === 'resumen' && hasData && (
              <section className="view-resumen">
                <SummaryCards data={data} />
                <div className="resumen-grid">
                  <div className="resumen-left">
                    <MapView
                      activities={mapActivities}
                      selectedDate={selectedDate}
                      selectedActivity={selectedActivity}
                      onSelectActivity={handleSelectActivity}
                    />
                  </div>
                  <div className="resumen-right">
                    <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} onDeleteActivity={handleDeleteActivity} />
                  </div>
                </div>
                <DailyCharts days={data.days} />
              </section>
            )}

            {/* ── VIAJES ── */}
            {activeView === 'viajes' && hasData && (
              <section className="view-viajes">
                <div className="view-header">
                  <h2>Viajes</h2>
                  <span className="muted">{data.drives?.length || 0} trayectos registrados</span>
                </div>
                <div className="viajes-grid">
                  <div className="viajes-map">
                    <MapView
                      activities={mapActivities}
                      selectedDate={selectedDate}
                      selectedActivity={selectedActivity}
                      onSelectActivity={handleSelectActivity}
                    />
                  </div>
                  <div className="viajes-detail">
                    <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} onDeleteActivity={handleDeleteActivity} />
                    {selectedActivity ? null : (
                      <div className="activity-list panel">
                        <p className="eyebrow">Últimos trayectos</p>
                        {(data.drives || []).slice(-10).reverse().map((drive) => (
                          <button key={drive.id} onClick={() => handleSelectActivity(drive)}>
                            <strong>{dateTimeLabel(drive.start)}</strong>
                            <small>{fmtKm(drive.distance_km)} · {fmtMinutes(drive.duration_min)} · {fmtNumber(drive.avg_speed_kmh, 0)} km/h</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── CARGAS ── */}
            {activeView === 'cargas' && hasData && (
              <section className="view-cargas">
                <div className="view-header">
                  <h2>Cargas</h2>
                  <span className="muted">{data.charges?.length || 0} sesiones de carga</span>
                </div>
                <ChargingCurve
                  charges={data.charges}
                  selectedActivity={selectedActivity}
                  onSelectCharge={handleSelectActivity}
                />
                <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} onDeleteActivity={handleDeleteActivity} />
              </section>
            )}

            {/* ── CALENDARIO ── */}
            {activeView === 'calendario' && hasData && (
              <section className="view-calendario">
                <CalendarView
                  days={data.days}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  onSelectActivity={handleSelectActivity}
                />
                {selectedActivity && (
                  <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} onDeleteActivity={handleDeleteActivity} />
                )}
              </section>
            )}

            {/* ── AJUSTES ── */}
            {activeView === 'ajustes' && (
              <section className="view-ajustes">
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

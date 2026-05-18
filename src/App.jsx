import { useCallback, useEffect, useMemo, useState } from 'react';
import SummaryCards from './components/SummaryCards.jsx';
import CalendarView from './components/CalendarView.jsx';
import MapView from './components/MapView.jsx';
import ChargingCurve from './components/ChargingCurve.jsx';
import DailyCharts from './components/DailyCharts.jsx';
import ActivityDetail from './components/ActivityDetail.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import { normalizeData } from './utils/calculations.js';
import { loadActivities, saveActivities, deleteAllActivities, loadManualCosts, saveManualCosts } from './utils/supabase.js';
import { dateTimeLabel, fmtKm, fmtKwh, fmtMinutes, fmtNumber } from './utils/formatters.js';
import './styles.css';

/* ── localStorage fallback keys (legacy + migration) ── */
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
  let added = 0;
  incoming.forEach((a) => {
    if (!a?.id || byId.has(a.id)) return;
    byId.set(a.id, a);
    added += 1;
  });
  return { activities: Array.from(byId.values()), added };
}

function buildData(activities, manualChargeCosts) {
  if (!activities.length) return null;
  const sorted = [...activities].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const raw = { activities: sorted, stats: { files: new Set(sorted.map((a) => a.file || a.id)).size, activities: sorted.length } };
  return normalizeData(raw, manualChargeCosts);
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

  /* ── Initial load: try Supabase, fall back to localStorage ── */
  useEffect(() => {
    async function init() {
      try {
        setSyncStatus('Sincronizando…');
        const [remote, remoteCosts] = await Promise.all([loadActivities(), loadManualCosts()]);

        // If localStorage has data that Supabase doesn't, migrate it
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
          // Merge: Supabase is source of truth, but keep any local-only items
          if (local.length && remote.length) {
            const merged = mergeActivities(remote, local);
            if (merged.added > 0) {
              // Upload the local-only ones
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
    // Save to both Supabase and localStorage
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
    try {
      setSyncStatus('Borrando…');
      await deleteAllActivities();
      setSyncStatus('');
    } catch (err) {
      console.warn('Supabase delete failed:', err);
      setSyncStatus('⚠ Error al borrar');
    }
    setActivities([]);
    localStorage.removeItem(IMPORTED_ACTIVITIES_KEY);
    setSelectedActivity(null);
    setSelectedDate(null);
  }, []);

  const handleFactoryReset = useCallback(async () => {
    if (!window.confirm('¿Reiniciar completamente? Se borran actividades y costes de la nube y el navegador.')) return;
    try {
      await deleteAllActivities();
    } catch (err) { console.warn(err); }
    Object.keys(localStorage).filter((k) => k.startsWith('r5_abrp_')).forEach((k) => localStorage.removeItem(k));
    setActivities([]);
    setManualChargeCosts({});
    setSelectedActivity(null);
    setSelectedDate(null);
    setSyncStatus('');
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

  const handleSaveChargeCost = useCallback((chargeId, value) => {
    setManualChargeCosts((current) => {
      const next = { ...current };
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) delete next[chargeId];
      else next[chargeId] = numeric;
      // Save to Supabase + localStorage
      saveManualCosts(next).catch((err) => console.warn('Cost save error:', err));
      localStorage.setItem(MANUAL_CHARGE_COSTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /* ── Render ── */
  if (loading) {
    return <main className="app-shell"><div className="empty-state">Cargando datos ABRP…</div></main>;
  }
  if (error) {
    return <main className="app-shell"><div className="empty-state">Error: {error}</div></main>;
  }

  const hasData = data && data.activities.length > 0;
  const importVisible = showImport || !hasData;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <h1>R5 ABRP Dashboard</h1>
          {hasData && (
            <span className="top-bar-period">{data.days[0]?.date || ''} → {data.days[data.days.length - 1]?.date || ''}</span>
          )}
          {syncStatus && <span className="sync-badge">{syncStatus}</span>}
        </div>
        <div className="top-bar-right">
          <button className={`ghost-button compact${importVisible ? ' active' : ''}`} onClick={() => setShowImport(!showImport)}>
            {importVisible ? '✕ Cerrar' : '↑ Importar Excel'}
          </button>
        </div>
      </header>

      {importVisible && (
        <ImportPanel
          importedActivities={activities}
          onImportActivities={handleImportActivities}
          onClearImported={handleClearImported}
          onFactoryReset={handleFactoryReset}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
        />
      )}

      {hasData && (
        <>
          <SummaryCards data={data} />

          {selectedActivity ? (
            <section className="selected-activity panel">
              <p className="eyebrow">Actividad seleccionada</p>
              <h2>{selectedActivity.kind === 'drive' ? 'Trayecto' : 'Carga'} · {dateTimeLabel(selectedActivity.start)}</h2>
              <div className="selected-grid">
                <span>{selectedActivity.kind === 'drive' ? fmtKm(selectedActivity.distance_km) : fmtKwh(selectedActivity.energy_kwh)}</span>
                <span>{fmtMinutes(selectedActivity.duration_min)}</span>
                {selectedActivity.kind === 'drive' ? (
                  <>
                    <span>{fmtNumber(selectedActivity.avg_speed_kmh, 1)} km/h media</span>
                    <span>{fmtNumber(selectedActivity.max_speed_kmh, 1)} km/h máx.</span>
                  </>
                ) : (
                  <>
                    <span>{fmtNumber(selectedActivity.avg_power_kw, 1)} kW media</span>
                    <span>{fmtNumber(selectedActivity.max_power_kw, 1)} kW pico</span>
                  </>
                )}
              </div>
            </section>
          ) : null}

          <CalendarView
            days={data.days}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onSelectActivity={handleSelectActivity}
          />

          <div className="dashboard-grid">
            <MapView
              activities={mapActivities}
              selectedDate={selectedDate}
              selectedActivity={selectedActivity}
              onSelectActivity={handleSelectActivity}
            />
            <DailyCharts days={data.days} />
          </div>

          <ChargingCurve
            charges={data.charges}
            selectedActivity={selectedActivity}
            onSelectCharge={handleSelectActivity}
          />

          <ActivityDetail activity={selectedActivity} onSaveChargeCost={handleSaveChargeCost} />
        </>
      )}

      <footer className="footer-note">
        Datos sincronizados con Supabase. Importa Excel de ABRP desde cualquier dispositivo.
      </footer>
    </main>
  );
}

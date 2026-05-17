import { useCallback, useEffect, useMemo, useState } from 'react';
import SummaryCards from './components/SummaryCards.jsx';
import CalendarView from './components/CalendarView.jsx';
import MapView from './components/MapView.jsx';
import ChargingCurve from './components/ChargingCurve.jsx';
import DailyCharts from './components/DailyCharts.jsx';
import ActivityDetail from './components/ActivityDetail.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import { normalizeData } from './utils/calculations.js';
import { dateTimeLabel, fmtKm, fmtKwh, fmtMinutes, fmtNumber } from './utils/formatters.js';
import './styles.css';

const MANUAL_CHARGE_COSTS_KEY = 'r5_abrp_manual_charge_costs_v1';
const IMPORTED_ACTIVITIES_KEY = 'r5_abrp_imported_activities_v2';
const LEGACY_IMPORTED_KEYS = [
  'r5_abrp_imported_activities_v1',
  'r5_abrp_imported_activities_v2'
];

function loadManualChargeCosts() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_CHARGE_COSTS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveManualChargeCosts(costs) {
  localStorage.setItem(MANUAL_CHARGE_COSTS_KEY, JSON.stringify(costs));
}

function loadImportedActivities() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IMPORTED_ACTIVITIES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveImportedActivities(activities) {
  localStorage.setItem(IMPORTED_ACTIVITIES_KEY, JSON.stringify(activities));
}

function mergeActivities(existing, incoming) {
  const byId = new Map();
  existing.forEach((activity) => byId.set(activity.id, activity));
  let added = 0;
  incoming.forEach((activity) => {
    if (!activity?.id || byId.has(activity.id)) return;
    byId.set(activity.id, activity);
    added += 1;
  });
  return { activities: Array.from(byId.values()), added };
}

function combineRawData(base, importedActivities) {
  if (!base) return null;
  const baseActivities = Array.isArray(base.activities) ? base.activities : [];
  const byId = new Map();
  [...baseActivities, ...(importedActivities || [])].forEach((activity) => {
    if (activity?.id) byId.set(activity.id, activity);
  });
  const activities = Array.from(byId.values()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return {
    ...base,
    stats: {
      ...(base.stats || {}),
      files: new Set(activities.map((activity) => activity.file || activity.id)).size,
      activities: activities.length
    },
    activities
  };
}

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [manualChargeCosts, setManualChargeCosts] = useState(() => loadManualChargeCosts());
  const [importedActivities, setImportedActivities] = useState(() => loadImportedActivities());
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    fetch(`./data/abrp_data.json?v=0.2.5-${Date.now()}`)
      .then((response) => {
        if (!response.ok) throw new Error(`No se pudo cargar el JSON (${response.status})`);
        return response.json();
      })
      .then((json) => setRawData(json))
      .catch((err) => setError(err.message));
  }, []);

  const combinedRawData = useMemo(() => combineRawData(rawData, importedActivities), [rawData, importedActivities]);
  const data = useMemo(() => combinedRawData ? normalizeData(combinedRawData, manualChargeCosts) : null, [combinedRawData, manualChargeCosts]);

  useEffect(() => {
    if (!data || !selectedActivity) return;
    const updated = data.activities.find((activity) => activity.id === selectedActivity.id);
    if (updated && updated !== selectedActivity) setSelectedActivity(updated);
  }, [data, selectedActivity]);

  useEffect(() => {
    if (!data || selectedDate) return;
    const firstDay = data.days[0]?.date;
    setSelectedDate(firstDay || null);
  }, [data, selectedDate]);

  const selectedDay = useMemo(() => {
    if (!data || !selectedDate) return null;
    return data.days.find((day) => day.date === selectedDate) || null;
  }, [data, selectedDate]);

  const mapActivities = useMemo(() => {
    if (!data) return [];
    if (selectedDate) return selectedDay?.activities || [];
    return data.activities || [];
  }, [data, selectedDate, selectedDay]);

  const handleSelectDate = useCallback((date) => {
    setSelectedDate(date);
    setSelectedActivity(null);
  }, []);

  const handleSelectActivity = useCallback((activity) => {
    setSelectedActivity(activity);
    if (activity?.date) setSelectedDate(activity.date);
  }, []);


  const handleImportActivities = useCallback((activities) => {
    const result = mergeActivities(importedActivities, activities || []);
    setImportedActivities(result.activities);
    saveImportedActivities(result.activities);
    return result;
  }, [importedActivities]);

  const handleClearImported = useCallback(() => {
    if (!window.confirm('¿Borrar todos los Excel importados localmente? Esta acción deja el dashboard sin datos importados.')) return;
    setImportedActivities([]);
    LEGACY_IMPORTED_KEYS.forEach((key) => localStorage.removeItem(key));
    saveImportedActivities([]);
    setSelectedActivity(null);
    setSelectedDate(null);
  }, []);

  const handleFactoryReset = useCallback(() => {
    if (!window.confirm('¿Reiniciar completamente el dashboard en este navegador? Se borrarán importaciones locales y costes manuales.')) return;
    Object.keys(localStorage)
      .filter((key) => key.startsWith('r5_abrp_'))
      .forEach((key) => localStorage.removeItem(key));
    setImportedActivities([]);
    setManualChargeCosts({});
    setSelectedActivity(null);
    setSelectedDate(null);
  }, []);

  const handleExportBackup = useCallback(() => {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      activities: importedActivities
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'r5_abrp_dashboard_backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [importedActivities]);

  const handleImportBackup = useCallback((payload) => {
    const activities = Array.isArray(payload?.activities) ? payload.activities : Array.isArray(payload) ? payload : [];
    return handleImportActivities(activities);
  }, [handleImportActivities]);

  const handleSaveChargeCost = useCallback((chargeId, value) => {
    setManualChargeCosts((current) => {
      const next = { ...current };
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        delete next[chargeId];
      } else {
        next[chargeId] = numeric;
      }
      saveManualChargeCosts(next);
      return next;
    });
  }, []);

  if (error) {
    return <main className="app-shell"><div className="empty-state">Error cargando datos: {error}</div></main>;
  }

  if (!data) {
    return <main className="app-shell"><div className="empty-state">Cargando datos ABRP…</div></main>;
  }

  const hasData = data.activities.length > 0;
  const importVisible = showImport || !hasData;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <h1>R5 ABRP Dashboard</h1>
          {data.activities.length > 0 && (
            <span className="top-bar-period">{data.days[0]?.date || ''} → {data.days[data.days.length - 1]?.date || ''}</span>
          )}
        </div>
        <div className="top-bar-right">
          <button className={`ghost-button compact${importVisible ? ' active' : ''}`} onClick={() => setShowImport(!showImport)}>
            {importVisible ? '✕ Cerrar' : '↑ Importar Excel'}
          </button>
        </div>
      </header>

      {importVisible && (
        <ImportPanel
          importedActivities={importedActivities}
          onImportActivities={handleImportActivities}
          onClearImported={handleClearImported}
          onFactoryReset={handleFactoryReset}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
        />
      )}

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

      <footer className="footer-note">
        Datos generados a partir de exportaciones Excel de ABRP. Esta versión arranca sin datos iniciales; todo lo visible viene de importaciones locales del navegador.
      </footer>
    </main>
  );
}

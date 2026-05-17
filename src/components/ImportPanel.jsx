import { useRef, useState } from 'react';
import { parseAbrpExcelFiles } from '../utils/parseAbrpExcel.js';

function activityLabel(activity) {
  const type = activity.type === 'Carga' ? 'Carga' : 'Trayecto';
  const start = activity.start_time || activity.start?.slice(11, 16) || '—';
  const date = activity.date || 'sin fecha';
  const value = activity.type === 'Carga'
    ? `${Number(activity.energy_kwh || 0).toFixed(1)} kWh`
    : `${Number(activity.distance_km || 0).toFixed(1)} km`;
  return `${type} · ${date} ${start} · ${value}`;
}

export default function ImportPanel({ importedActivities, onImportActivities, onClearImported, onFactoryReset, onExportBackup, onImportBackup }) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState([]);
  const [lastImport, setLastImport] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  async function processFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => /\.xlsx$/i.test(file.name));
    if (!files.length) {
      setStatus('Selecciona uno o varios Excel .xlsx de ABRP.');
      return;
    }
    setStatus(`Procesando ${files.length} Excel…`);
    setErrors([]);
    setLastImport(null);
    setShowDetails(false);

    const result = await parseAbrpExcelFiles(files);
    const imported = onImportActivities(result.activities);
    const skipped = result.activities.length - imported.added;
    const nextImport = {
      files: files.length,
      parsed: result.activities.length,
      added: imported.added,
      skipped,
      activities: result.activities || []
    };
    setLastImport(nextImport);
    setErrors(result.errors || []);
    setStatus(
      `${imported.added} actividad(es) añadida(s). ${skipped > 0 ? `${skipped} duplicada(s) ignorada(s).` : ''}`
    );
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    processFiles(event.dataTransfer.files);
  }

  function handleBackupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const result = onImportBackup(parsed);
        setStatus(`Backup importado: ${result.added} actividad(es) añadida(s).`);
        setLastImport({
          files: 1,
          parsed: Array.isArray(parsed?.activities) ? parsed.activities.length : 0,
          added: result.added,
          skipped: 0,
          activities: Array.isArray(parsed?.activities) ? parsed.activities : []
        });
        setShowDetails(false);
        setErrors([]);
      } catch (error) {
        setStatus('No se pudo importar el backup JSON.');
        setErrors([{ file: file.name, message: error.message || String(error) }]);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function clearImportNotice() {
    setStatus('');
    setErrors([]);
    setLastImport(null);
    setShowDetails(false);
  }

  return (
    <section className="panel import-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Importador local</p>
          <h2>Subir Excel ABRP</h2>
          <p className="panel-subtitle">Arrastra exportaciones de carga o trayecto con coordenadas. Se guardan en este navegador y se ignoran duplicados.</p>
        </div>
        <div className="import-actions">
          <button type="button" className="ghost-button" onClick={onExportBackup} disabled={!importedActivities.length}>Exportar backup</button>
          <button type="button" className="ghost-button" onClick={() => backupInputRef.current?.click()}>Importar backup</button>
          <button type="button" className="danger-button" onClick={onClearImported} disabled={!importedActivities.length}>Borrar importados</button>
          <button type="button" className="danger-button" onClick={onFactoryReset}>Reset total</button>
        </div>
      </div>

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
      >
        <strong>Arrastra aquí los Excel de ABRP</strong>
        <span>o pulsa para seleccionarlos</span>
        <small>Soporta: cargas y trayectos con bloque Details/GPS.</small>
      </div>

      <input ref={fileInputRef} type="file" accept=".xlsx" multiple hidden onChange={(event) => processFiles(event.target.files)} />
      <input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={handleBackupFile} />

      <div className="import-footer">
        <span>{importedActivities.length} actividad(es) guardada(s) localmente en este navegador.</span>
        <small>Reset total borra también datos/costes antiguos guardados en este navegador.</small>
      </div>

      {(status || lastImport || errors.length) ? (
        <div className="import-result">
          <div className="import-result-header">
            <div>
              {status ? <strong>{status}</strong> : <strong>Resultado de importación</strong>}
              {lastImport ? (
                <small>
                  {lastImport.files} archivo(s) procesado(s) · {lastImport.parsed} actividad(es) detectada(s) · {lastImport.added} nueva(s) · {lastImport.skipped} duplicada(s)
                </small>
              ) : null}
            </div>
            <div className="import-result-actions">
              {lastImport?.activities?.length ? (
                <button type="button" className="ghost-button compact" onClick={() => setShowDetails((value) => !value)}>
                  {showDetails ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              ) : null}
              <button type="button" className="ghost-button compact" onClick={clearImportNotice}>Limpiar aviso</button>
            </div>
          </div>

          {showDetails && lastImport?.activities?.length ? (
            <div className="imported-list compact-list">
              {lastImport.activities.slice(0, 8).map((activity) => (
                <div key={activity.id} className="imported-row">
                  <span className={`pill ${activity.type === 'Carga' ? 'charge' : 'drive'}`}>{activity.type === 'Carga' ? 'Carga' : 'Trayecto'}</span>
                  <span>{activityLabel(activity)}</span>
                </div>
              ))}
              {lastImport.activities.length > 8 ? <small>+{lastImport.activities.length - 8} actividad(es) más</small> : null}
            </div>
          ) : null}

          {errors.length ? (
            <div className="import-errors">
              {errors.map((error) => <p key={`${error.file}-${error.message}`}><strong>{error.file}</strong>: {error.message}</p>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

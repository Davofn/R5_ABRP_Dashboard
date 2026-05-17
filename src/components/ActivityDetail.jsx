import { useEffect, useState } from 'react';
import { dateTimeLabel, fmtEur, fmtKwh, fmtKm, fmtMinutes, fmtNumber, fmtPercent } from '../utils/formatters.js';
import { HOME_KWH_PRICE_EUR } from '../utils/calculations.js';

function chargeTypeLabel(category) {
  if (category === 'dc') return 'DC';
  if (category === 'ac_home') return 'AC en casa';
  if (category === 'ac_away') return 'AC fuera de casa';
  return 'Carga';
}

function DetailMetric({ label, value }) {
  return (
    <div className="detail-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function DriveDetail({ activity }) {
  return (
    <>
      <div className="detail-header">
        <div>
          <p className="eyebrow">Detalle seleccionado</p>
          <h2>Trayecto · {dateTimeLabel(activity.start)}</h2>
          <p className="panel-subtitle">
            {activity.start_label || 'Origen sin nombre'} → {activity.end_label || 'Destino sin nombre'}
          </p>
        </div>
        <span className="pill drive">Trayecto</span>
      </div>

      <div className="detail-grid">
        <DetailMetric label="Distancia" value={fmtKm(activity.distance_km)} />
        <DetailMetric label="Duración" value={fmtMinutes(activity.duration_min)} />
        <DetailMetric label="Velocidad media" value={`${fmtNumber(activity.avg_speed_kmh, 1)} km/h`} />
        <DetailMetric label="Velocidad máxima" value={`${fmtNumber(activity.max_speed_kmh, 1)} km/h`} />
        <DetailMetric label="SoC" value={`${fmtPercent(activity.soc_start)} → ${fmtPercent(activity.soc_end)}`} />
        <DetailMetric label="Tramos" value={activity.merged ? `${activity.merged_count} unidos` : '1'} />
      </div>

      {activity.merged ? (
        <p className="detail-note">
          Este trayecto aparece unido porque ABRP lo dividió en varios tramos consecutivos. Se ha conservado la ruta GPS completa y la velocidad máxima registrada de todos los tramos.
        </p>
      ) : null}
    </>
  );
}

function ChargeCostEditor({ activity, onSaveChargeCost }) {
  const [value, setValue] = useState('');
  const isHome = activity.charge_category === 'ac_home';
  const hasManualCost = activity.cost_source === 'manual';

  useEffect(() => {
    setValue(hasManualCost && Number.isFinite(Number(activity.cost_eur)) ? String(Number(activity.cost_eur).toFixed(2)) : '');
  }, [activity.id, activity.cost_eur, hasManualCost]);

  if (isHome) {
    return (
      <p className="detail-note cost-note">
        Coste calculado automáticamente para carga en casa: {fmtEur(activity.cost_eur)} usando {fmtNumber(HOME_KWH_PRICE_EUR, 4)} €/kWh.
      </p>
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSaveChargeCost?.(activity.id, value === '' ? null : Number(value));
  }

  function handleClear() {
    setValue('');
    onSaveChargeCost?.(activity.id, null);
  }

  return (
    <form className="manual-cost-editor" onSubmit={handleSubmit}>
      <div>
        <small>Coste de esta carga fuera de casa</small>
        <label>
          <span>€</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Pendiente"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      </div>
      <button type="submit">Guardar coste</button>
      {hasManualCost ? <button type="button" className="ghost-button" onClick={handleClear}>Quitar</button> : null}
      <p>
        ABRP no suele traer el precio real pagado. Este importe se guarda localmente en este navegador.
      </p>
    </form>
  );
}

function ChargeDetail({ activity, onSaveChargeCost }) {
  const costLabel = activity.cost_source === 'pending'
    ? 'Pendiente'
    : activity.cost_source === 'home_auto'
      ? `${fmtEur(activity.cost_eur)} · casa`
      : `${fmtEur(activity.cost_eur)} · manual`;

  return (
    <>
      <div className="detail-header">
        <div>
          <p className="eyebrow">Detalle seleccionado</p>
          <h2>Carga · {dateTimeLabel(activity.start)}</h2>
          <p className="panel-subtitle">{activity.start_label || activity.location || activity.title || 'Ubicación sin nombre'}</p>
        </div>
        <span className="pill charge">{chargeTypeLabel(activity.charge_category)}</span>
      </div>

      <div className="detail-grid">
        <DetailMetric label="Energía cargada" value={fmtKwh(activity.energy_kwh)} />
        <DetailMetric label="Duración" value={fmtMinutes(activity.duration_min)} />
        <DetailMetric label="Potencia media" value={`${fmtNumber(activity.avg_power_kw, 1)} kW`} />
        <DetailMetric label="Potencia máxima" value={`${fmtNumber(activity.max_power_kw, 1)} kW`} />
        <DetailMetric label="SoC" value={`${fmtPercent(activity.soc_start)} → ${fmtPercent(activity.soc_end)}`} />
        <DetailMetric label="Coste" value={costLabel} />
        <DetailMetric label="Tramos" value={activity.merged_charge ? `${activity.merged_count} unidos` : '1'} />
      </div>

      <ChargeCostEditor activity={activity} onSaveChargeCost={onSaveChargeCost} />

      {activity.merged_charge ? (
        <p className="detail-note">
          Esta carga aparece unida porque ABRP la dividió en sesiones consecutivas con un hueco breve y SoC correlativo. El tiempo de carga suma solo los tramos de carga, no el parón intermedio.
        </p>
      ) : null}

      <p className="detail-note">
        La curva superior se sincroniza con esta carga cuando la seleccionas desde el calendario, el mapa o el selector de cargas.
      </p>
    </>
  );
}

export default function ActivityDetail({ activity, onSaveChargeCost }) {
  return (
    <section className="panel activity-detail-panel">
      {!activity ? (
        <div className="empty-detail">
          <p className="eyebrow">Detalle</p>
          <h2>Selecciona un trayecto o una carga</h2>
          <p>
            Pulsa una actividad en el calendario, una ruta en el mapa o una carga en la gráfica para ver aquí solo sus datos concretos.
          </p>
        </div>
      ) : activity.kind === 'drive' ? (
        <DriveDetail activity={activity} />
      ) : (
        <ChargeDetail activity={activity} onSaveChargeCost={onSaveChargeCost} />
      )}
    </section>
  );
}

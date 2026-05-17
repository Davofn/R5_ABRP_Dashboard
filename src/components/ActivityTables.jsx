import { dateTimeLabel, fmtEur, fmtKwh, fmtKm, fmtMinutes, fmtNumber, fmtPercent } from '../utils/formatters.js';

export function TripsTable({ drives, onSelectActivity }) {
  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Trayectos</p>
          <h2>Listado de trayectos</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Inicio</th><th>Ruta</th><th>Km</th><th>Duración</th><th>Vel. media</th><th>Vel. máx.</th><th>Tramos</th><th>SoC</th>
            </tr>
          </thead>
          <tbody>
            {drives.map((drive) => (
              <tr key={drive.id} onClick={() => onSelectActivity(drive)}>
                <td>{dateTimeLabel(drive.start)}</td>
                <td><strong>{drive.start_label || '—'}</strong><br/><small>{drive.end_label || '—'}</small></td>
                <td>{fmtKm(drive.distance_km)}</td>
                <td>{fmtMinutes(drive.duration_min)}</td>
                <td>{fmtNumber(drive.avg_speed_kmh, 1)} km/h</td>
                <td>{fmtNumber(drive.max_speed_kmh, 1)} km/h</td>
                <td>{drive.merged ? `${drive.merged_count} unidos` : '1'}</td>
                <td>{fmtPercent(drive.soc_start)} → {fmtPercent(drive.soc_end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ChargesTable({ charges, onSelectActivity }) {
  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Cargas</p>
          <h2>Listado de cargas</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Inicio</th><th>Ubicación</th><th>Energía</th><th>Coste</th><th>Duración</th><th>Potencia máx.</th><th>SoC</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((charge) => (
              <tr key={charge.id} onClick={() => onSelectActivity(charge)}>
                <td>{dateTimeLabel(charge.start)}</td>
                <td><strong>{charge.start_label || charge.title}</strong></td>
                <td>{fmtKwh(charge.energy_kwh)}</td>
                <td>{fmtEur(charge.cost_eur)}</td>
                <td>{fmtMinutes(charge.duration_min)}</td>
                <td>{fmtNumber(charge.max_power_kw, 1)} kW</td>
                <td>{fmtPercent(charge.soc_start)} → {fmtPercent(charge.soc_end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

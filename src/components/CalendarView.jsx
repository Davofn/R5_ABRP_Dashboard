import { calendarRange } from '../utils/calculations.js';
import { dayLabel, fmtKwh, fmtKm, fmtMinutes, fmtNumber } from '../utils/formatters.js';

const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default function CalendarView({ days, selectedDate, onSelectDate, onSelectActivity }) {
  const daysMap = new Map(days.map((day) => [day.date, day]));
  const range = calendarRange(days);
  const first = range[0] ? new Date(`${range[0]}T12:00:00`) : null;
  const offset = first ? (first.getDay() + 6) % 7 : 0;
  const cells = [...Array(offset).fill(null), ...range];
  const selected = daysMap.get(selectedDate) || days[0];

  return (
    <section className="panel calendar-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Calendario</p>
          <h2>Actividad por día</h2>
        </div>
        <span className="legend"><i className="dot drive-dot" /> Trayectos <i className="dot charge-dot" /> Cargas</span>
      </div>

      <div className="calendar-layout">
        <div className="calendar">
          {weekDays.map((d) => <div className="weekday" key={d}>{d}</div>)}
          {cells.map((date, index) => {
            const day = date ? daysMap.get(date) : null;
            const isSelected = date && selectedDate === date;
            return (
              <button
                key={`${date || 'empty'}-${index}`}
                className={`calendar-cell ${day ? 'has-data' : ''} ${isSelected ? 'selected' : ''}`}
                disabled={!date}
                onClick={() => date && onSelectDate(date)}
              >
                {date ? <span className="day-number">{Number(date.slice(8, 10))}</span> : null}
                {day ? (
                  <>
                    <span className="mini-stats">{fmtNumber(day.km, 0)} km</span>
                    <span className="calendar-dots">
                      {day.drives ? <i className="dot drive-dot" /> : null}
                      {day.charges ? <i className="dot charge-dot" /> : null}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>

        <aside className="day-detail">
          {selected ? (
            <>
              <p className="eyebrow">{dayLabel(selected.date)}</p>
              <h3>{fmtKm(selected.km)} · {fmtKwh(selected.kwh)}</h3>
              <div className="day-metrics">
                <span>{selected.drives} trayectos</span>
                <span>{selected.charges} cargas</span>
                <span>{fmtMinutes(selected.minutes_drive)} conduciendo</span>
                <span>{fmtNumber(selected.avg_speed, 1)} km/h media</span>
                <span>{fmtNumber(selected.max_speed, 1)} km/h máx.</span>
              </div>
              <div className="activity-list compact">
                {selected.activities.map((activity) => (
                  <button key={activity.id} onClick={() => onSelectActivity(activity)}>
                    <span className={`pill ${activity.kind}`}>{activity.kind === 'drive' ? 'Trayecto' : 'Carga'}</span>
                    <strong>{activity.start_time || '—'} · {activity.kind === 'drive' ? fmtKm(activity.distance_km) : fmtKwh(activity.energy_kwh)}</strong>
                    <small>
                      {activity.kind === 'drive'
                        ? `${fmtNumber(activity.avg_speed_kmh, 1)} km/h media · ${fmtNumber(activity.max_speed_kmh, 1)} km/h máx.${activity.merged ? ` · unido (${activity.merged_count} tramos)` : ''}`
                        : (activity.start_label || activity.title)}
                    </small>
                  </button>
                ))}
              </div>
            </>
          ) : <p>No hay datos seleccionados.</p>}
        </aside>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { fmtKwh, fmtMinutes, fmtNumber, fmtPercent } from '../utils/formatters.js';

function toPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}

function parseTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minuteFrom(startDate, sampleDate, fallback) {
  if (startDate && sampleDate) return Math.max(0, (sampleDate.getTime() - startDate.getTime()) / 60000);
  return fallback;
}

function samplesForCharge(charge) {
  const series = charge.charge_series || charge.samples || charge.points || [];
  if (!series.length) return [];
  const explicitStart = parseTimestamp(charge.start) || parseTimestamp(charge.start_time);
  const firstTimestamp = Array.isArray(series[0]) ? parseTimestamp(series[0][0]) : parseTimestamp(series[0]?.timestamp || series[0]?.time || series[0]?.utc);
  const startDate = explicitStart || firstTimestamp;

  const parsed = series.map((sample, index) => {
    if (Array.isArray(sample)) {
      const ts = parseTimestamp(sample[0]);
      const power = sample[1] === null || sample[1] === undefined ? null : Number(sample[1]);
      const soc = toPercent(sample[2]);
      return { x: minuteFrom(startDate, ts, index), timestamp: ts, soc, power: Number.isFinite(power) ? Math.max(0, power) : null, voltage: null };
    }
    const ts = parseTimestamp(sample.timestamp || sample.time || sample.utc);
    const minuteRaw = sample.minute ?? sample.minutes ?? sample.t;
    const minute = minuteRaw === undefined || minuteRaw === null ? index : Number(minuteRaw);
    const soc = toPercent(sample.soc ?? sample.SOC ?? sample.soc_percent);
    const powerRaw = sample.power ?? sample.power_kw ?? sample.charge_power_kw;
    const voltageRaw = sample.voltage ?? sample.voltage_v;
    const power = powerRaw === undefined || powerRaw === null ? null : Number(powerRaw);
    return {
      x: Number.isFinite(minute) ? minute : minuteFrom(startDate, ts, index),
      timestamp: ts, soc,
      power: Number.isFinite(power) ? Math.max(0, power) : null,
      voltage: voltageRaw === undefined || voltageRaw === null ? null : Number(voltageRaw)
    };
  }).filter((s) => Number.isFinite(s.x) && (Number.isFinite(s.soc) || Number.isFinite(s.power) || Number.isFinite(s.voltage)));

  const byKey = new Map();
  parsed.forEach((s) => { const key = s.timestamp ? s.timestamp.toISOString() : s.x.toFixed(2); byKey.set(key, s); });
  return Array.from(byKey.values()).sort((a, b) => a.x - b.x);
}

function fallbackSamples(charge) {
  const start = toPercent(charge.soc_start) ?? 0;
  const end = toPercent(charge.soc_end) ?? start;
  const duration = Number(charge.duration_min || 1);
  const power = Number(charge.avg_power_kw || charge.max_power_kw || 0);
  return [
    { x: 0, soc: start, power },
    { x: duration / 2, soc: (start + end) / 2, power },
    { x: duration, soc: end, power: Number(charge.max_power_kw || power) }
  ];
}

function timeLabelFromMinute(start, minute) {
  const startDate = parseTimestamp(start);
  if (!startDate) return `${Math.round(minute)} min`;
  const d = new Date(startDate.getTime() + minute * 60000);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function niceSocBounds(samples) {
  const values = samples.map((s) => s.soc).filter(Number.isFinite);
  if (!values.length) return { min: 0, max: 100 };
  const min = Math.max(0, Math.floor((Math.min(...values) - 4) / 5) * 5);
  const max = Math.min(100, Math.ceil((Math.max(...values) + 4) / 5) * 5);
  return { min, max: Math.max(max, min + 10) };
}

function nicePowerMax(samples) {
  const values = samples.map((s) => s.power).filter(Number.isFinite);
  if (!values.length) return 5;
  const max = Math.max(...values);
  if (max <= 5) return Math.ceil(max + 1);
  if (max <= 25) return Math.ceil(max / 5) * 5;
  return Math.ceil(max / 10) * 10;
}

const CHART_STYLE = {
  socColor: '#60a5fa',
  socFill: 'rgba(96, 165, 250, 0.15)',
  powerColor: '#34d399',
  powerFill: 'rgba(52, 211, 153, 0.15)',
  grid: 'rgba(148, 163, 184, 0.08)',
  tooltip: 'rgba(10, 16, 28, 0.95)',
  tooltipBorder: 'rgba(148, 163, 184, 0.2)',
  label: '#94a3b8',
  tick: '#64748b',
};

export default function ChargingCurve({ charges, selectedActivity, onSelectCharge }) {
  const allCharges = useMemo(() => charges || [], [charges]);
  const defaultCharge = selectedActivity?.kind === 'charge' ? selectedActivity : allCharges[0];
  const [selectedId, setSelectedId] = useState(defaultCharge?.id);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (selectedActivity?.kind === 'charge') setSelectedId(selectedActivity.id);
  }, [selectedActivity]);

  const selected = allCharges.find((charge) => charge.id === selectedId) || allCharges[0];
  const chartSamples = useMemo(() => {
    if (!selected) return [];
    const samples = samplesForCharge(selected);
    return samples.length ? samples : fallbackSamples(selected);
  }, [selected]);

  useEffect(() => {
    if (!canvasRef.current || !selected || !chartSamples.length) return;
    const ctx = canvasRef.current.getContext('2d');
    const socBounds = niceSocBounds(chartSamples);
    const powerMax = nicePowerMax(chartSamples);

    /* Gradient fills */
    const socGrad = ctx.createLinearGradient(0, 0, 0, 380);
    socGrad.addColorStop(0, 'rgba(96, 165, 250, 0.25)');
    socGrad.addColorStop(1, 'rgba(96, 165, 250, 0.01)');

    const powerGrad = ctx.createLinearGradient(0, 0, 0, 380);
    powerGrad.addColorStop(0, 'rgba(52, 211, 153, 0.25)');
    powerGrad.addColorStop(1, 'rgba(52, 211, 153, 0.01)');

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'SoC (%)',
            data: chartSamples.filter((s) => Number.isFinite(s.soc)).map((s) => ({ x: s.x, y: s.soc })),
            yAxisID: 'soc',
            tension: 0.3,
            fill: true,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: CHART_STYLE.socColor,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            borderColor: CHART_STYLE.socColor,
            backgroundColor: socGrad,
          },
          {
            label: 'Potencia (kW)',
            data: chartSamples.filter((s) => Number.isFinite(s.power)).map((s) => ({ x: s.x, y: s.power })),
            yAxisID: 'power',
            tension: 0.2,
            fill: true,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: CHART_STYLE.powerColor,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            borderColor: CHART_STYLE.powerColor,
            backgroundColor: powerGrad,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: CHART_STYLE.label,
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              padding: 20,
              font: { family: "'DM Sans', sans-serif", size: 12 },
            }
          },
          tooltip: {
            backgroundColor: CHART_STYLE.tooltip,
            borderColor: CHART_STYLE.tooltipBorder,
            borderWidth: 1,
            titleColor: '#f0f4fa',
            bodyColor: '#f0f4fa',
            padding: 14,
            cornerRadius: 12,
            titleFont: { family: "'DM Sans', sans-serif", weight: '700', size: 13 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            callbacks: {
              title: (items) => {
                const minute = items[0]?.parsed?.x ?? 0;
                return `${timeLabelFromMinute(selected.start, minute)} · ${Math.round(minute)} min`;
              },
              label: (item) => {
                const suffix = item.dataset.yAxisID === 'soc' ? '%' : ' kW';
                return ` ${item.dataset.label}: ${fmtNumber(item.parsed.y, 1)}${suffix}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: Math.max(...chartSamples.map((s) => s.x), Number(selected.duration_min || 0)),
            ticks: {
              color: CHART_STYLE.tick,
              maxTicksLimit: 7,
              callback: (value) => timeLabelFromMinute(selected.start, value),
              font: { size: 11 },
            },
            grid: { color: CHART_STYLE.grid }
          },
          soc: {
            position: 'left',
            min: socBounds.min,
            max: socBounds.max,
            ticks: {
              color: CHART_STYLE.socColor,
              callback: (value) => `${value}%`,
              font: { family: "'JetBrains Mono', monospace", size: 11 },
            },
            grid: { color: CHART_STYLE.grid }
          },
          power: {
            position: 'right',
            min: 0,
            max: powerMax,
            ticks: {
              color: CHART_STYLE.powerColor,
              callback: (value) => `${value} kW`,
              font: { family: "'JetBrains Mono', monospace", size: 11 },
            },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
    return () => chartRef.current?.destroy();
  }, [selected, chartSamples]);

  function handleChange(event) {
    const id = event.target.value;
    setSelectedId(id);
    const charge = allCharges.find((item) => item.id === id);
    if (charge) onSelectCharge(charge);
  }

  if (!selected) return null;

  const lastSample = chartSamples[chartSamples.length - 1] || {};
  const firstSample = chartSamples[0] || {};

  return (
    <section className="panel charge-curve-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Cargas</p>
          <h2>Curva de carga</h2>
          <p className="panel-subtitle">Datos reales por muestra de ABRP: SoC y potencia frente a la hora.</p>
        </div>
        <select value={selected.id} onChange={handleChange}>
          {allCharges.map((charge) => (
            <option key={charge.id} value={charge.id}>{charge.title || charge.id}</option>
          ))}
        </select>
      </div>

      <div className="charge-summary charge-summary-enhanced">
        <span>SoC {fmtPercent(selected.soc_start)} → {fmtPercent(selected.soc_end)}</span>
        <span>{fmtKwh(selected.energy_kwh)}</span>
        <span>{fmtMinutes(selected.duration_min)}</span>
        <span>Pico {fmtNumber(selected.max_power_kw, 1)} kW</span>
        <span>{chartSamples.length} muestras</span>
      </div>

      <div className="charge-live-values">
        <div><small>Inicio</small><strong>{timeLabelFromMinute(selected.start, firstSample.x || 0)}</strong></div>
        <div><small>Fin</small><strong>{timeLabelFromMinute(selected.start, lastSample.x || selected.duration_min || 0)}</strong></div>
        <div><small>SoC final muestra</small><strong>{Number.isFinite(lastSample.soc) ? fmtNumber(lastSample.soc, 0) + '%' : '—'}</strong></div>
        <div><small>Potencia media</small><strong>{Number.isFinite(Number(selected.avg_power_kw)) ? fmtNumber(selected.avg_power_kw, 1) + ' kW' : '—'}</strong></div>
      </div>

      <div className="chart-box charge-chart-box">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

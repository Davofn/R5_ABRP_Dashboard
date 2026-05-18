import { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { fmtNumber } from '../utils/formatters.js';

const COLORS = {
  soc: '#60a5fa',
  socFill: 'rgba(96, 165, 250, 0.12)',
  charge: '#facc15',
  chargeFill: 'rgba(250, 204, 21, 0.08)',
  grid: 'rgba(255, 255, 255, 0.05)',
  tick: '#6b7280',
  label: '#9ca3af',
  tooltip: 'rgba(30, 32, 40, 0.95)',
  tooltipBorder: 'rgba(255, 255, 255, 0.08)',
};

function toPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}

export default function SocHistory({ activities }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const dataPoints = useMemo(() => {
    const points = [];
    const sorted = [...activities]
      .filter((a) => a.start)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));

    sorted.forEach((a) => {
      const socStart = toPercent(a.soc_start);
      const socEnd = toPercent(a.soc_end);
      const startTime = new Date(a.start).getTime();
      const endTime = a.end ? new Date(a.end).getTime() : startTime;
      if (!Number.isFinite(startTime)) return;

      if (Number.isFinite(socStart)) {
        points.push({ x: startTime, y: socStart, kind: a.kind, phase: 'start', activity: a });
      }
      if (Number.isFinite(socEnd) && Number.isFinite(endTime)) {
        points.push({ x: endTime, y: socEnd, kind: a.kind, phase: 'end', activity: a });
      }
    });

    return points.sort((a, b) => a.x - b.x);
  }, [activities]);

  useEffect(() => {
    if (!canvasRef.current || dataPoints.length < 2) return;
    if (chartRef.current) chartRef.current.destroy();
    const ctx = canvasRef.current.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 350);
    grad.addColorStop(0, 'rgba(96, 165, 250, 0.18)');
    grad.addColorStop(1, 'rgba(96, 165, 250, 0.01)');

    // Color each segment: green/yellow for charge (going up), blue for drive (going down)
    const segmentColors = dataPoints.map((p, i) => {
      if (i === 0) return COLORS.soc;
      const prev = dataPoints[i - 1];
      return p.y > prev.y ? COLORS.charge : COLORS.soc;
    });

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: 'SoC %',
          data: dataPoints.map((p) => ({ x: p.x, y: p.y })),
          fill: true,
          backgroundColor: grad,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: dataPoints.map((p) => p.kind === 'charge' ? COLORS.charge : COLORS.soc),
          pointBorderColor: dataPoints.map((p) => p.kind === 'charge' ? COLORS.charge : COLORS.soc),
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          tension: 0.2,
          segment: {
            borderColor: (ctx) => {
              const i = ctx.p1DataIndex;
              if (i < dataPoints.length && dataPoints[i].y > dataPoints[ctx.p0DataIndex]?.y) return COLORS.charge;
              return COLORS.soc;
            }
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: COLORS.tooltip,
            borderColor: COLORS.tooltipBorder,
            borderWidth: 1,
            titleColor: '#f3f4f6',
            bodyColor: '#f3f4f6',
            padding: 12,
            cornerRadius: 10,
            titleFont: { family: "'DM Sans', sans-serif", weight: '700', size: 13 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx === undefined) return '';
                const p = dataPoints[idx];
                const d = new Date(p.x);
                return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              },
              label: (item) => {
                const p = dataPoints[item.dataIndex];
                const label = p.kind === 'charge' ? '⚡ Carga' : '🚗 Trayecto';
                return ` ${label} · SoC ${fmtNumber(p.y, 0)}%`;
              },
              afterLabel: (item) => {
                const p = dataPoints[item.dataIndex];
                const a = p.activity;
                if (p.kind === 'drive' && a.distance_km) return ` ${fmtNumber(a.distance_km, 1)} km`;
                if (p.kind === 'charge' && a.energy_kwh) return ` ${fmtNumber(a.energy_kwh, 1)} kWh`;
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day', tooltipFormat: 'dd MMM', displayFormats: { day: 'dd MMM' } },
            ticks: { color: COLORS.tick, font: { size: 11 }, maxTicksLimit: 10 },
            grid: { color: COLORS.grid },
            adapters: { date: {} }
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              color: COLORS.soc,
              callback: (v) => `${v}%`,
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              stepSize: 20,
            },
            grid: { color: COLORS.grid },
          }
        }
      }
    });

    return () => chartRef.current?.destroy();
  }, [dataPoints]);

  if (dataPoints.length < 2) return null;

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Batería</p>
          <h2>Historial de SoC</h2>
          <p className="panel-subtitle">Evolución del nivel de batería. Amarillo = cargando, azul = conduciendo.</p>
        </div>
      </div>
      <div className="chart-box small">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

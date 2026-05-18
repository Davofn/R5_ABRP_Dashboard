import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';
import { fmtNumber } from '../utils/formatters.js';

Chart.register(annotationPlugin);

const COLORS = {
  bar: '#60a5fa',
  barBg: 'rgba(96, 165, 250, 0.35)',
  avg: '#facc15',
  grid: 'rgba(255, 255, 255, 0.05)',
  tick: '#6b7280',
  label: '#9ca3af',
  tooltip: 'rgba(30, 32, 40, 0.95)',
  tooltipBorder: 'rgba(255, 255, 255, 0.08)',
};

export default function ConsumptionChart({ drives, avgConsumption }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const validDrives = drives.filter((d) => Number.isFinite(d.consumption_kwh_100km) && d.distance_km >= 1);

  useEffect(() => {
    if (!canvasRef.current || !validDrives.length) return;
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, 'rgba(96, 165, 250, 0.5)');
    grad.addColorStop(1, 'rgba(96, 165, 250, 0.02)');

    const labels = validDrives.map((d) => {
      const date = (d.start || '').slice(5, 10);
      const time = (d.start || '').slice(11, 16);
      return `${date} ${time}`;
    });

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'kWh/100km',
            data: validDrives.map((d) => Math.round(d.consumption_kwh_100km * 10) / 10),
            backgroundColor: grad,
            borderColor: COLORS.bar,
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
              afterBody: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx === undefined) return '';
                const d = validDrives[idx];
                return [
                  `${fmtNumber(d.distance_km, 1)} km`,
                  `${fmtNumber(d.avg_speed_kmh, 0)} km/h media`,
                  `SoC ${fmtNumber((d.soc_start <= 1 ? d.soc_start * 100 : d.soc_start), 0)}% → ${fmtNumber((d.soc_end <= 1 ? d.soc_end * 100 : d.soc_end), 0)}%`
                ].join('\n');
              }
            }
          },
          annotation: avgConsumption ? {
            annotations: {
              avgLine: {
                type: 'line',
                yMin: avgConsumption,
                yMax: avgConsumption,
                borderColor: COLORS.avg,
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: `Media: ${fmtNumber(avgConsumption, 1)}`,
                  position: 'end',
                  backgroundColor: 'rgba(250, 204, 21, 0.15)',
                  color: COLORS.avg,
                  font: { family: "'JetBrains Mono', monospace", size: 11, weight: '600' },
                  padding: { x: 8, y: 4 },
                  borderRadius: 6,
                }
              }
            }
          } : {}
        },
        scales: {
          x: {
            ticks: { color: COLORS.tick, font: { size: 10 }, maxRotation: 45 },
            grid: { color: COLORS.grid },
          },
          y: {
            title: { display: true, text: 'kWh/100km', color: COLORS.label, font: { size: 12 } },
            ticks: {
              color: COLORS.bar,
              font: { family: "'JetBrains Mono', monospace", size: 11 },
            },
            grid: { color: COLORS.grid },
          }
        }
      }
    });

    return () => chartRef.current?.destroy();
  }, [validDrives, avgConsumption]);

  if (!validDrives.length) return null;

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Consumo</p>
          <h2>Consumo real por trayecto</h2>
          <p className="panel-subtitle">Calculado a partir del SoC y los km reales de cada trayecto. La línea amarilla marca la media.</p>
        </div>
      </div>
      <div className="chart-box small">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

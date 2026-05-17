import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const CHART_COLORS = {
  drive: '#3b82f6',
  charge: '#00E676',
  driveBg: 'rgba(59, 130, 246, 0.35)',
  chargeBg: 'rgba(0, 230, 118, 0.25)',
  grid: 'rgba(148, 163, 184, 0.08)',
  tick: '#64748b',
  label: '#94a3b8',
  tooltip: 'rgba(10, 16, 28, 0.95)',
  tooltipBorder: 'rgba(148, 163, 184, 0.2)',
};

export default function DailyCharts({ days }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');

    /* Gradient fills */
    const driveGrad = ctx.createLinearGradient(0, 0, 0, 500);
    driveGrad.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    driveGrad.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

    const chargeGrad = ctx.createLinearGradient(0, 0, 0, 500);
    chargeGrad.addColorStop(0, 'rgba(0, 230, 118, 0.4)');
    chargeGrad.addColorStop(1, 'rgba(0, 230, 118, 0.02)');

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days.map((day) => day.date.slice(5)),
        datasets: [
          {
            label: 'Km',
            data: days.map((day) => day.km),
            yAxisID: 'km',
            backgroundColor: driveGrad,
            borderColor: CHART_COLORS.drive,
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: 'kWh cargados',
            data: days.map((day) => day.kwh),
            yAxisID: 'kwh',
            backgroundColor: chargeGrad,
            borderColor: CHART_COLORS.charge,
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
          legend: {
            position: 'bottom',
            labels: {
              color: CHART_COLORS.label,
              usePointStyle: true,
              pointStyle: 'rectRounded',
              boxWidth: 10,
              padding: 20,
              font: { family: "'DM Sans', sans-serif", size: 12 },
            }
          },
          tooltip: {
            backgroundColor: CHART_COLORS.tooltip,
            borderColor: CHART_COLORS.tooltipBorder,
            borderWidth: 1,
            titleColor: '#f0f4fa',
            bodyColor: '#f0f4fa',
            padding: 12,
            cornerRadius: 10,
            titleFont: { family: "'DM Sans', sans-serif", weight: '700', size: 13 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          }
        },
        scales: {
          x: {
            ticks: { color: CHART_COLORS.tick, font: { size: 11 } },
            grid: { color: CHART_COLORS.grid },
          },
          km: {
            position: 'left',
            ticks: { color: CHART_COLORS.drive, font: { family: "'JetBrains Mono', monospace", size: 11 } },
            grid: { color: CHART_COLORS.grid },
          },
          kwh: {
            position: 'right',
            ticks: { color: CHART_COLORS.charge, font: { family: "'JetBrains Mono', monospace", size: 11 } },
            grid: { drawOnChartArea: false },
          }
        }
      }
    });
    return () => chartRef.current?.destroy();
  }, [days]);

  return (
    <section className="panel chart-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Estadísticas</p>
          <h2>Kilómetros y carga por día</h2>
        </div>
      </div>
      <div className="chart-box small">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

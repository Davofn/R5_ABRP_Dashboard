import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { dateTimeLabel, fmtKm, fmtNumber, fmtPercent } from '../utils/formatters.js';

function routePoints(activity) {
  const sourcePoints = Array.isArray(activity.route) && activity.route.length ? activity.route : activity.points;
  if (Array.isArray(sourcePoints) && sourcePoints.length) {
    return sourcePoints
      .map((point) => Array.isArray(point) ? point : [point.lat, point.lon])
      .filter((point) => point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
  }
  const result = [];
  if (activity.start_coord) result.push(activity.start_coord);
  if (activity.end_coord) result.push(activity.end_coord);
  return result;
}

export default function MapView({ activities, selectedDate, selectedActivity, onSelectActivity }) {
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map('r5-map', { scrollWheelZoom: true }).setView([40.42, -3.7], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      subdomains: 'abcd'
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = [];

    activities.forEach((activity) => {
      if (activity.kind === 'drive') {
        const points = routePoints(activity);
        if (points.length < 2) return;
        const latLngs = points.map((p) => [Number(p[0]), Number(p[1])]);
        latLngs.forEach((p) => bounds.push(p));
        const isSelected = selectedActivity?.id === activity.id;
        const line = L.polyline(latLngs, {
          color: isSelected ? '#38bdf8' : '#3b82f6',
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 1 : 0.6
        }).addTo(layer);
        line.bindPopup(`
          <strong>${activity.title || 'Trayecto'}</strong><br/>
          ${dateTimeLabel(activity.start)}<br/>
          Distancia: ${fmtKm(activity.distance_km)}<br/>
          Velocidad media: ${fmtNumber(activity.avg_speed_kmh, 1)} km/h<br/>
          Velocidad máxima: ${fmtNumber(activity.max_speed_kmh, 1)} km/h<br/>
          SoC: ${fmtPercent(activity.soc_start)} → ${fmtPercent(activity.soc_end)}<br/>
          ${activity.merged ? `Trayecto unido: ${activity.merged_count} tramos` : ''}
        `);
        line.on('click', () => onSelectActivity(activity));
      }

      if (activity.kind === 'charge' && activity.start_coord) {
        const p = [Number(activity.start_coord[0]), Number(activity.start_coord[1])];
        bounds.push(p);
        const marker = L.circleMarker(p, {
          radius: selectedActivity?.id === activity.id ? 9 : 6,
          color: '#00E676',
          fillColor: '#00E676',
          fillOpacity: 0.85,
          weight: 2
        }).addTo(layer);
        marker.bindPopup(`
          <strong>${activity.title || 'Carga'}</strong><br/>
          ${dateTimeLabel(activity.start)}<br/>
          Energía: ${fmtNumber(activity.energy_kwh, 1)} kWh<br/>
          Potencia máx.: ${fmtNumber(activity.max_power_kw, 1)} kW<br/>
          SoC: ${fmtPercent(activity.soc_start)} → ${fmtPercent(activity.soc_end)}<br/>
          ${activity.merged ? `Trayecto unido: ${activity.merged_count} tramos` : ''}
        `);
        marker.on('click', () => onSelectActivity(activity));
      }
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
  }, [activities, selectedActivity, onSelectActivity]);

  return (
    <section className="panel map-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Mapa</p>
          <h2>Trayectos y puntos de carga</h2>
          <small className="muted">Mostrando solo las actividades del día seleccionado{selectedDate ? `: ${selectedDate}` : ''}</small>
        </div>
      </div>
      <div id="r5-map" />
    </section>
  );
}

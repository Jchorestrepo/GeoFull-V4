import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Layers,
  Search,
  Maximize2,
  Minimize2,
  Filter,
  RefreshCw,
  PieChart,
  Target,
  Zap,
  Calendar
} from 'lucide-react';
import axios from 'axios';

// Fix default Leaflet markers in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SECTOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#84cc16', '#a855f7', '#6366f1', '#14b8a6', '#f43f5e'
];

function getSectorColor(sectorName) {
  if (!sectorName) return '#ef4444'; // Red for unassigned
  let hash = 0;
  for (let i = 0; i < sectorName.length; i++) hash = sectorName.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % SECTOR_PALETTE.length;
  return SECTOR_PALETTE[index];
}

function createPackageIcon(color, isSelected = false) {
  const size = isSelected ? 24 : 16;
  const border = isSelected ? '3px solid #f59e0b' : '2px solid white';
  const shadow = isSelected ? '0 0 12px rgba(245, 158, 11, 0.9)' : '0 2px 6px rgba(0,0,0,0.5)';
  return L.divIcon({
    className: 'custom-package-div-icon',
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: ${border};
        box-shadow: ${shadow};
        transition: all 0.2s ease;
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Sleek Clean Badge for Zone Counts (No dark container, clean colored pills with number & percentage)
function createZoneCountBadgeIcon(zoneName, count, pct, color) {
  return L.divIcon({
    className: 'zone-number-badge-clean',
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transform: translate(-50%, -50%);
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
      ">
        <div style="
          background-color: ${color};
          color: #ffffff;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          font-weight: 900;
          font-size: 14px;
          padding: 3px 10px;
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 10px ${color}80;
          border: 2px solid #ffffff;
          white-space: nowrap;
          line-height: 1.2;
          letter-spacing: -0.02em;
        ">
          ${count}
        </div>
        <div style="
          font-family: Inter, system-ui, -apple-system, sans-serif;
          font-size: 10.5px;
          font-weight: 800;
          color: #ffffff;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.9);
          margin-top: 2px;
          white-space: nowrap;
        ">
          ${pct}%
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
}

export function BodegaMap({ height = '600px', onZoneAssigned }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const geojsonLayerRef = useRef(null);
  const markersGroupRef = useRef(null);

  const [geojsonData, setGeojsonData] = useState(null);
  const [ordersData, setOrdersData] = useState([]);
  const [zonesList, setZonesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedZone, setSelectedZone] = useState('TODOS');
  const [selectedDate, setSelectedDate] = useState('TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('ZONAS_AGRUPADAS'); // 'ZONAS_AGRUPADAS' | 'PUNTOS_INDIVIDUALES'

  const { activeTenantId } = useAuth();

  // Fetch Polygons and Orders
  const loadMapData = async () => {
    setLoading(true);
    try {
      const [resGeoJSON, resOrders, resZones] = await Promise.all([
        axios.get('/api/v1/zones/geojson'),
        axios.get('/api/v1/orders/', { params: { solo_bodega: true } }),
        axios.get('/api/v1/zones/')
      ]);

      setGeojsonData(resGeoJSON.data);
      setOrdersData(resOrders.data);
      setZonesList(resZones.data);
    } catch (err) {
      console.error("Error cargando datos del mapa", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMapData();
  }, [activeTenantId]);

  // Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Prevent duplicate init

    // Center on Medellín default coordinates [6.244, -75.573]
    const map = L.map(mapContainerRef.current, {
      center: [6.244, -75.573],
      zoom: 13,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      scrollWheelZoom: true,
      preferCanvas: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    markersGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle GeoJSON Polygons Render
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !geojsonData) return;

    if (geojsonLayerRef.current) {
      map.removeLayer(geojsonLayerRef.current);
    }

    if (geojsonData.features && geojsonData.features.length > 0) {
      const geoLayer = L.geoJSON(geojsonData, {
        style: (feature) => {
          const color = feature.properties?.color || getSectorColor(feature.properties?.name);
          return {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.15
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          layer.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
              <div style="font-weight: 800; color: #1e293b; font-size: 13px; margin-bottom: 2px;">
                🗺️ Zona: ${props.name || 'Sin Nombre'}
              </div>
              <div style="font-size: 11px; color: #64748b;">
                Código: <strong>${props.code || 'ZONA-PROP'}</strong>
              </div>
            </div>
          `);

          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({ fillOpacity: 0.35, weight: 3 });
            },
            mouseout: (e) => {
              geoLayer.resetStyle(e.target);
            }
          });
        }
      }).addTo(map);

      geojsonLayerRef.current = geoLayer;

      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
      } catch (e) {}
    }
  }, [geojsonData]);

  // Geocoded orders filtered by status
  const geocodedOrders = useMemo(() => {
    const FINISHED_STATUSES = ['ENTREGADO', 'PERDIDO', 'DEVUELTO', 'DEVUELTO_PROVEEDOR', 'DEVOLUCION', 'ANULADO'];
    return ordersData.filter(o => o.latitud && o.longitud && !FINISHED_STATUSES.includes(o.estado));
  }, [ordersData]);

  // Extract unique import dates (YYYY-MM-DD)
  const availableDates = useMemo(() => {
    const datesSet = new Set();
    geocodedOrders.forEach(o => {
      if (o.fecha_importacion) {
        const d = String(o.fecha_importacion).split('T')[0];
        if (d) datesSet.add(d);
      }
    });
    return Array.from(datesSet).sort().reverse();
  }, [geocodedOrders]);

  // Orders filtered by Import Date, Zone & Search
  const filteredOrders = useMemo(() => {
    return geocodedOrders.filter(o => {
      // Date filter
      if (selectedDate !== 'TODAS') {
        const itemDate = o.fecha_importacion ? String(o.fecha_importacion).split('T')[0] : '';
        if (itemDate !== selectedDate) return false;
      }

      // Zone filter
      const matchesZone =
        selectedZone === 'TODOS'
          ? true
          : selectedZone === 'FUERA_DE_ZONA'
          ? !o.zona_nombre
          : o.zona_nombre === selectedZone;

      // Search filter
      const cleanSearch = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !cleanSearch ||
        o.guia.toLowerCase().includes(cleanSearch) ||
        (o.direccion_limpia || o.direccion_original).toLowerCase().includes(cleanSearch) ||
        (o.cliente || '').toLowerCase().includes(cleanSearch);

      return matchesZone && matchesSearch;
    });
  }, [geocodedOrders, selectedDate, selectedZone, searchTerm]);

  // RENDER MARKERS (OPTIMIZED: AGGREGATED BADGES VS INDIVIDUAL PUNTOS)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();

    // MODE 1: ZONAS AGRUPADAS (Insignia elegante con conteo y porcentaje)
    if (viewMode === 'ZONAS_AGRUPADAS' && selectedZone === 'TODOS' && !searchTerm) {
      const totalInView = filteredOrders.length;
      const countsByZone = {};
      let unassignedCount = 0;
      let unassignedSumLat = 0;
      let unassignedSumLng = 0;

      filteredOrders.forEach(o => {
        if (o.zona_nombre) {
          countsByZone[o.zona_nombre] = (countsByZone[o.zona_nombre] || 0) + 1;
        } else {
          unassignedCount++;
          unassignedSumLat += parseFloat(o.latitud);
          unassignedSumLng += parseFloat(o.longitud);
        }
      });

      // Render 1 Glass Badge per zone centroid
      if (geojsonData && geojsonData.features) {
        geojsonData.features.forEach(feature => {
          const zoneName = feature.properties?.name;
          const count = countsByZone[zoneName] || 0;
          if (!zoneName) return;

          try {
            const geoLayer = L.geoJSON(feature);
            const center = geoLayer.getBounds().getCenter();
            const color = feature.properties?.color || getSectorColor(zoneName);
            const pct = totalInView > 0 ? ((count / totalInView) * 100).toFixed(1) : '0';

            const icon = createZoneCountBadgeIcon(zoneName, count, pct, color);
            const badgeMarker = L.marker(center, { icon });

            badgeMarker.on('click', () => {
              setSelectedZone(zoneName);
              setViewMode('PUNTOS_INDIVIDUALES');
              map.fitBounds(geoLayer.getBounds(), { padding: [50, 50] });
            });

            markersGroupRef.current.addLayer(badgeMarker);
          } catch (e) {}
        });
      }

      // Render Badge for Fuera de Zona if any
      if (unassignedCount > 0) {
        const avgLat = unassignedSumLat / unassignedCount;
        const avgLng = unassignedSumLng / unassignedCount;
        const pct = totalInView > 0 ? ((unassignedCount / totalInView) * 100).toFixed(1) : '0';
        const icon = createZoneCountBadgeIcon('FUERA DE ZONA', unassignedCount, pct, '#ef4444');
        const badgeMarker = L.marker([avgLat, avgLng], { icon });

        badgeMarker.on('click', () => {
          setSelectedZone('FUERA_DE_ZONA');
          setViewMode('PUNTOS_INDIVIDUALES');
        });

        markersGroupRef.current.addLayer(badgeMarker);
      }

    } else {
      // MODE 2: PUNTOS INDIVIDUALES
      const MAX_INDIVIDUAL_MARKERS = 300;
      const ordersToRender = filteredOrders.slice(0, MAX_INDIVIDUAL_MARKERS);

      ordersToRender.forEach((o) => {
        const color = getSectorColor(o.zona_nombre);
        const icon = createPackageIcon(color);
        const marker = L.marker([o.latitud, o.longitud], { icon });

        const popupDiv = document.createElement('div');
        popupDiv.className = 'p-1 font-sans text-slate-900';
        popupDiv.style.minWidth = '240px';
        popupDiv.style.maxWidth = '300px';

        popupDiv.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; border-b: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
            <span style="font-weight: 800; color: #2563eb; font-size: 13px; font-mono: monospace;">📦 Guía #${o.guia}</span>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 9999px; background: ${o.zona_nombre ? '#dcfce7' : '#fee2e2'}; color: ${o.zona_nombre ? '#166534' : '#991b1b'};">
              ${o.zona_nombre || 'FUERA DE ZONA'}
            </span>
          </div>

          <div style="font-size: 11px; margin-bottom: 6px;">
            <div style="font-weight: 700; color: #15803d; margin-bottom: 2px;">
              ✓ Direcc. Limpia: <span style="font-weight: 600; color: #0f172a;">${o.direccion_limpia || o.direccion_original}</span>
            </div>
            <div style="color: #64748b; font-style: italic; font-size: 10.5px;">
              Orig: ${o.direccion_original}
            </div>
          </div>

          <div style="font-size: 11px; color: #475569; margin-bottom: 8px; border-top: 1px dashed #e2e8f0; margin-top: 6px; padding-top: 4px;">
            <div>👤 <strong>Cliente:</strong> ${o.cliente || 'Consumidor Final'}</div>
            ${o.telefono_cliente ? `<div>📞 <strong>Tel:</strong> ${o.telefono_cliente}</div>` : ''}
            ${o.nivel_precision ? `<div>🎯 <strong>Precisión:</strong> ${o.nivel_precision} (${o.confianza_score || 95}%)</div>` : ''}
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
            <label style="font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; display: block; margin-bottom: 3px;">
              Reasignar Zona / Sector:
            </label>
            <select id="select-zone-${o.id}" style="width: 100%; font-size: 11px; padding: 4px 6px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 600; color: #0f172a;">
              ${!o.zona_nombre ? '<option value="">-- Seleccionar Zona --</option>' : ''}
              ${zonesList.map(z => `<option value="${z.id}" ${z.nombre === o.zona_nombre ? 'selected' : ''}>${z.nombre}</option>`).join('')}
            </select>
          </div>
        `;

        const selectElem = popupDiv.querySelector(`#select-zone-${o.id}`);
        if (selectElem) {
          selectElem.addEventListener('change', async (e) => {
            const newZoneId = e.target.value;
            if (!newZoneId) return;
            try {
              await axios.patch(`/api/v1/orders/${o.id}/assign-zone`, { zona_id: newZoneId });
              onZoneAssigned?.();
              loadMapData();
            } catch (err) {
              alert("No se pudo reasignar la zona: " + (err.response?.data?.detail || err.message));
            }
          });
        }

        marker.bindPopup(popupDiv);
        markersGroupRef.current.addLayer(marker);
      });

      if (filteredOrders.length > 0) {
        try {
          const bounds = L.latLngBounds(ordersToRender.map(o => [o.latitud, o.longitud]));
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
          }
        } catch (e) {}
      }
    }
  }, [filteredOrders, geocodedOrders, geojsonData, viewMode, selectedZone, searchTerm, zonesList, onZoneAssigned]);

  const toggleFullscreen = () => {
    const elem = mapContainerRef.current?.parentElement;
    if (!elem) return;
    if (!document.fullscreenElement) {
      elem.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className={`relative rounded-3xl border border-white/10 overflow-hidden bg-slate-950 flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`} style={{ height: isFullscreen ? '100vh' : height }}>
      
      {/* Top Filter Bar Controls */}
      <div className="p-3 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2 flex-wrap">
          {/* VIEW MODE TOGGLE BUTTONS */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              onClick={() => { setViewMode('ZONAS_AGRUPADAS'); setSelectedZone('TODOS'); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'ZONAS_AGRUPADAS'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              <span>Conteo por Zonas</span>
            </button>
            <button
              onClick={() => setViewMode('PUNTOS_INDIVIDUALES')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'PUNTOS_INDIVIDUALES'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Puntos Individuales</span>
            </button>
          </div>

          {/* DATE IMPORT FILTER */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold outline-none focus:border-blue-500"
            >
              <option value="TODAS">📅 Todas las Fechas</option>
              {availableDates.map(d => (
                <option key={d} value={d}>
                  📅 {d}
                </option>
              ))}
            </select>
          </div>

          {/* ZONE FILTER */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedZone}
              onChange={(e) => {
                const z = e.target.value;
                setSelectedZone(z);
                if (z !== 'TODOS') setViewMode('PUNTOS_INDIVIDUALES');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold outline-none focus:border-blue-500"
            >
              <option value="TODOS">Todas las Zonas ({filteredOrders.length})</option>
              <option value="FUERA_DE_ZONA">Fuera de Zona ({filteredOrders.filter(o => !o.zona_nombre).length})</option>
              {zonesList.map(z => (
                <option key={z.id} value={z.nombre}>
                  {z.nombre} ({filteredOrders.filter(o => o.zona_nombre === z.nombre).length})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-semibold">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mostrando: <strong className="text-emerald-400">{filteredOrders.length}</strong> / {geocodedOrders.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (e.target.value.trim()) setViewMode('PUNTOS_INDIVIDUALES');
              }}
              placeholder="Buscar Guía, Dirección o Cliente..."
              className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-blue-500 w-44 md:w-56"
            />
          </div>

          <button
            onClick={loadMapData}
            title="Recargar datos"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de Pantalla Completa' : 'Pantalla Completa'}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Map Element Container */}
      <div className="flex-1 w-full relative">
        <div ref={mapContainerRef} className="w-full h-full z-0" />
        
        {loading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-20 flex items-center justify-center text-white text-xs font-semibold gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
            <span>Cargando Polígonos GeoJSON y Paquetes...</span>
          </div>
        )}

        {/* Floating Mode Info Badge */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-white/10 text-[11px] text-slate-300 backdrop-blur-md flex items-center gap-2 shadow-xl">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>
              Modo: <strong className="text-white">{viewMode === 'ZONAS_AGRUPADAS' ? '📊 Conteo por Zonas' : '📍 Puntos Individuales'}</strong>
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

export default BodegaMap;

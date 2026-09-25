import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { ExcelUploader } from '../components/orders/ExcelUploader';
import { ZoneUploader } from '../components/map/ZoneUploader';
import { BarcodeScannerStation } from '../components/orders/BarcodeScannerStation';
import { dataCache } from '../lib/dataCache';
import {
  MapPin,
  Layers,
  Upload,
  X,
  Filter,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  Phone,
  User,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import axios from 'axios';

export function SectorizacionPage() {
  const [orders, setOrders] = useState([]);
  const [zones, setZones] = useState([]);
  const [filterZone, setFilterZone] = useState('TODOS');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTab, setUploadTab] = useState('ORDERS');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  // Cargar lista de zonas y pedidos usando dataCache para navegación INSTANTÁNEA (0ms)
  const fetchOrdersAndZones = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh) {
        dataCache.invalidateAll();
      }
      const [ordersRes, zonesRes] = await Promise.all([
        dataCache.getOrders(forceRefresh),
        dataCache.getZones(forceRefresh)
      ]);
      setOrders(ordersRes);
      setZones(zonesRes);
    } catch (err) {
      console.error("Error al cargar pedidos/zonas", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { activeTenantId } = useAuth();

  useEffect(() => {
    fetchOrdersAndZones(true);
  }, [activeTenantId, fetchOrdersAndZones]);

  // Manejar asignación manual de zona desde el selector desplegable
  const handleAssignZone = async (orderId, newZoneId) => {
    if (!newZoneId) return;
    try {
      const res = await axios.patch(
        `/api/v1/orders/${orderId}/assign-zone`,
        { zona_id: newZoneId }
      );

      setToast({
        type: 'success',
        title: 'Zona Asignada Manualmente',
        message: `La guía ${res.data.guia} fue reasignada a la zona '${res.data.zona_nombre}'`
      });

      // Update cache instantly
      dataCache.updateSingleOrderInCache(res.data);
      fetchOrdersAndZones();
    } catch (err) {
      console.error("Error asignando zona", err);
      setToast({
        type: 'error',
        title: 'Error de Asignación',
        message: err.response?.data?.detail || 'No se pudo asignar la zona'
      });
    }
  };

  const handleUploadComplete = (summary) => {
    fetchOrdersAndZones(true);
    if (summary) {
      setToast({
        type: 'success',
        title: 'Importación Completada',
        message: `Lote de ${summary.total} pedidos procesado en PostGIS.`
      });
    }
  };

  const filteredOrders = orders.filter(o => {
    if (filterZone === 'TODOS') return true;
    if (filterZone === 'FUERA_DE_ZONA') return !o.zona_nombre;
    return o.zona_nombre === filterZone;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-400" />
            Etapa 1 — Sectorización & Importación Masiva
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Geocodificación PostGIS en tiempo real, escaneo inteligente por voz y asignación manual de zonas.
          </p>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchOrdersAndZones(true)}
            className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition-all border border-slate-700"
            title="Refrescar Datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-500/20"
          >
            <Upload className="w-4 h-4" />
            Importar Pedidos / Zonas
          </button>
        </div>
      </div>

      {/* Grid: Active Zones Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Zonas GeoJSON Activas</p>
            <h3 className="text-2xl font-extrabold text-white">{zones.length} Zonas</h3>
            <p className="text-[11px] text-emerald-400 mt-0.5">Evaluadas en simultáneo en PostGIS</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Pedidos Sectorizados (Bodega)</p>
            <h3 className="text-2xl font-extrabold text-white">
              {orders.filter(o => o.zona_nombre).length} / {orders.length}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Asignación automática</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Fuera de Zona</p>
            <h3 className="text-2xl font-extrabold text-white">
              {orders.filter(o => !o.zona_nombre).length} Pedidos
            </h3>
            <p className="text-[11px] text-red-400 mt-0.5">Requieren asignación manual</p>
          </div>
        </GlassCard>
      </div>

      {/* Barcode Scanner & Voice Announcement Station with Giant Display */}
      <BarcodeScannerStation />

      {/* Main Content Grid: Zones List & Sectorized Orders Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Zonas Personalizadas List */}
        <GlassCard className="p-5 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Zonas de la Empresa ({zones.length})
            </h3>
            <Badge variant="titanium">GeoJSON</Badge>
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto custom-scrollbar">
            {zones.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No hay zonas GeoJSON cargadas. Usa el botón "Importar Pedidos / Zonas".
              </div>
            ) : (
              zones.map((z) => {
                const countInZone = orders.filter(o => o.zona_nombre === z.nombre).length;
                return (
                  <div
                    key={z.id || z.nombre}
                    onClick={() => setFilterZone(filterZone === z.nombre ? 'TODOS' : z.nombre)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      filterZone === z.nombre
                        ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: z.color || '#10b981' }}
                      />
                      <div>
                        <h4 className="font-semibold text-xs text-white">{z.nombre}</h4>
                        <p className="text-[10px] text-slate-400">Código: {z.codigo || 'ZONA-PROP'}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-slate-700">
                      {countInZone}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </GlassCard>

        {/* Right Column: Sectorized Orders Table with Manual Zone Selector */}
        <GlassCard className="lg:col-span-2 p-5 rounded-3xl border border-white/10 space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="font-bold text-sm text-white">Pedidos Importados en Bodega</h3>
              <p className="text-[11px] text-slate-400">Mostrando: Guía, Dirección Limpia, Cliente, Teléfono y Zona Asignada</p>
            </div>

            {/* Zone Filter Pill */}
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <button
                onClick={() => setFilterZone('TODOS')}
                className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-all ${
                  filterZone === 'TODOS'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Todos ({orders.length})
              </button>
              <button
                onClick={() => setFilterZone('FUERA_DE_ZONA')}
                className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-all ${
                  filterZone === 'FUERA_DE_ZONA'
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Fuera de Zona ({orders.filter(o => !o.zona_nombre).length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[440px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Guía</th>
                  <th className="p-3">Dirección</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Teléfono</th>
                  <th className="p-3">Zona Asignada (Selector Manual)</th>
                  <th className="p-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                      No hay pedidos cargados en la zona seleccionada. Usa el botón "Importar Pedidos / Zonas".
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/30 transition-all">
                      <td className="p-3">
                        <Badge variant="purple" className="text-[10px] font-mono uppercase">
                          {o.tenant_id || activeTenantId || 'Empresa'}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono font-bold text-blue-400">{o.guia}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-200">{o.direccion_limpia || o.direccion_original}</div>
                        {o.observaciones_entrega && (
                          <div className="text-[10px] text-amber-400/90 truncate max-w-[180px]">
                            Obs: {o.observaciones_entrega}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>{o.cliente || 'Consumidor Final'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-slate-300 font-mono">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{o.telefono_cliente || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <select
                          value={o.zona_id || ''}
                          onChange={(e) => handleAssignZone(o.id, e.target.value)}
                          className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all ${
                            o.zona_nombre
                              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 focus:border-emerald-400'
                              : 'bg-red-950/60 border-red-500/40 text-red-300 focus:border-red-400'
                          }`}
                        >
                          {!o.zona_nombre && <option value="">-- FUERA DE ZONA (Seleccionar) --</option>}
                          {zones.map(z => (
                            <option key={z.id} value={z.id} className="bg-slate-900 text-white">
                              {z.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-right">
                        <Badge variant={o.estado === 'SECTORIZADO' ? 'emerald' : 'red'}>
                          {o.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* DISCREET IMPORT MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-2xl p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Centro de Importación Masiva</h3>
                  <p className="text-xs text-slate-400">Importa pedidos Excel o Polígonos GeoJSON de Zonas</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 p-1 bg-slate-950/80 rounded-2xl border border-white/5">
              <button
                onClick={() => setUploadTab('ORDERS')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  uploadTab === 'ORDERS'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel / CSV de Pedidos
              </button>
              <button
                onClick={() => setUploadTab('ZONES')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  uploadTab === 'ZONES'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                GeoJSON de Zonas
              </button>
            </div>

            <div className="pt-2">
              {uploadTab === 'ORDERS' ? (
                <ExcelUploader onBatchComplete={handleUploadComplete} />
              ) : (
                <ZoneUploader onZonesUploaded={handleUploadComplete} />
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

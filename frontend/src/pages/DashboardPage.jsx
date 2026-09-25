import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { BodegaMap } from '../components/map/BodegaMap';
import {
  LayoutDashboard,
  RefreshCw,
  Package,
  CheckCircle2,
  Target,
  Warehouse,
  DollarSign,
  MapPin,
  TrendingUp,
  Truck,
  ArrowRight,
  ShieldCheck,
  Zap,
  FileSpreadsheet,
  Users,
  Map,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import axios from 'axios';

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();

  const fetchDashboardStats = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await axios.get('/api/v1/reconciliation/dashboard-stats', {
        headers: { 'X-Tenant-ID': activeTenantId || 'empresa_demo' }
      });
      setStats(res.data);
      if (isManual) {
        setToast({ message: 'Dashboard actualizado en tiempo real', type: 'success' });
      }
    } catch (err) {
      console.error('Error al obtener estadísticas del dashboard:', err);
      setToast({ message: 'Error al conectar con el servidor de métricas', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const scrollToMap = () => {
    const el = document.getElementById('mapa-dashboard');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const fmtCOP = (val) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-900/60 rounded-2xl w-1/3 border border-white/5"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-900/60 rounded-3xl border border-white/5"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-slate-900/60 rounded-3xl border border-white/5"></div>
          <div className="h-72 bg-slate-900/60 rounded-3xl border border-white/5"></div>
        </div>
      </div>
    );
  }

  const resumen = stats?.resumen_ejecutivo || {};
  const estados = stats?.estados || {};
  const precision = stats?.precision_catastral || {};
  const zonas = stats?.zonas_distribucion || [];
  const flota = stats?.top_flota || [];

  return (
    <div className="space-y-6 pb-8">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <LayoutDashboard className="w-7 h-7 text-blue-500" />
              Dashboard Ejecutivo & Centro de Control
            </h2>
            <Badge variant="titanium">GeoFull V4 SaaS</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Mapeo estratégico en tiempo real de SLA, precisión catastral, inventario y mapa cartográfico.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-white/10 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-slate-300 font-medium">{activeTenantId || 'empresa_demo'}</span>
          </div>

          <button
            onClick={() => fetchDashboardStats(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs font-semibold transition-all backdrop-blur-md active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Refrescar Métricas'}
          </button>
        </div>
      </div>

      {/* FILA 1: HERO EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* TOTAL ENVIOS */}
        <GlassCard className="p-5 relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="absolute top-0 right-0 p-4 text-blue-500/10 group-hover:text-blue-500/20 transition-all">
            <Package className="w-16 h-16 -mr-4 -mt-4" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Total Envíos</span>
            <Badge variant="titanium">Hoy</Badge>
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight mt-2">
            {(resumen.total_pedidos || 0).toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2">
            <span className="text-blue-400 font-semibold">{estados.creados_pendientes || 0}</span>
            <span>pendientes por despachar</span>
          </div>
        </GlassCard>

        {/* SLA DE ENTREGAS */}
        <GlassCard className="p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 p-4 text-emerald-500/10 group-hover:text-emerald-500/20 transition-all">
            <CheckCircle2 className="w-16 h-16 -mr-4 -mt-4" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>SLA Cumplimiento</span>
            <Badge variant="emerald">{resumen.sla_cumplimiento_pct || 0}%</Badge>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight mt-2">
            {resumen.sla_cumplimiento_pct || 0}%
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, resumen.sla_cumplimiento_pct || 0)}%` }}
            ></div>
          </div>
        </GlassCard>

        {/* PRECISIÓN CATASTRAL ROOFTOP */}
        <GlassCard className="p-5 relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="absolute top-0 right-0 p-4 text-blue-500/10 group-hover:text-blue-500/20 transition-all">
            <Target className="w-16 h-16 -mr-4 -mt-4" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Rooftop Exacto</span>
            <Badge variant="titanium">±2m</Badge>
          </div>
          <div className="text-3xl font-extrabold text-blue-400 tracking-tight mt-2">
            {resumen.precision_rooftop_pct || 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Medellín EPSG:4326</span>
          </div>
        </GlassCard>

        {/* INVENTARIO BODEGA */}
        <GlassCard className="p-5 relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="absolute top-0 right-0 p-4 text-amber-500/10 group-hover:text-amber-500/20 transition-all">
            <Warehouse className="w-16 h-16 -mr-4 -mt-4" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>En Bodega (QR)</span>
            <Badge variant={resumen.retencion_critica_24h > 0 ? 'red' : 'amber'}>
              {resumen.retencion_critica_24h > 0 ? `${resumen.retencion_critica_24h} ret. >24h` : 'OK'}
            </Badge>
          </div>
          <div className="text-3xl font-extrabold text-amber-400 tracking-tight mt-2">
            {resumen.en_bodega || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Escaneados listos para ruta
          </div>
        </GlassCard>

        {/* PRE-LIQUIDACION NETO */}
        <GlassCard className="p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 p-4 text-emerald-500/10 group-hover:text-emerald-500/20 transition-all">
            <DollarSign className="w-16 h-16 -mr-4 -mt-4" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Nómina Estimada</span>
            <Badge variant="emerald">Neto</Badge>
          </div>
          <div className="text-2xl font-extrabold text-emerald-300 tracking-tight mt-2 truncate">
            {fmtCOP(resumen.neto_nomina_estimado)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 truncate">
            Vales desc: <span className="text-red-400 font-medium">{fmtCOP(resumen.total_vales_pendientes)}</span>
          </div>
        </GlassCard>
      </div>

      {/* MAPA CARTOGRÁFICO EMBEDDED EN DASHBOARD */}
      <div id="mapa-dashboard">
        <GlassCard className="p-5 space-y-4 border border-blue-500/20 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Map className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Mapa Cartográfico & Polígonos de Bodega
                  <Badge variant="emerald">GeoJSON & PostGIS</Badge>
                </h3>
                <p className="text-xs text-slate-400">
                  Inspección interactiva en tiempo real: Polígonos GeoJSON de zonas y pines de paquetes geolocalizados
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowMap(!showMap)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 border border-white/10 transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>{showMap ? 'Ocultar Mapa' : 'Desplegar Mapa'}</span>
              {showMap ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showMap && (
            <div className="rounded-2xl overflow-hidden border border-white/10 transition-all duration-300">
              <BodegaMap height="480px" />
            </div>
          )}
        </GlassCard>
      </div>

      {/* SECCIÓN 2: CALIDAD CATASTRAL & MAPA Y COBERTURA EN ZONAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SEMÁFORO DE PRECISIÓN CATASTRAL */}
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Calidad de Geocodificación Catastral</h3>
                <p className="text-xs text-slate-400">Distribución de precisión espacial en las direcciones de Medellín</p>
              </div>
            </div>
            <button
              onClick={scrollToMap}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-all"
            >
              <span>Ver Mapa</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {/* EXACTO ROOFTOP */}
            <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-emerald-500/20 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  🟢 Rooftop Exacto (±2m)
                </span>
                <span className="font-bold text-white">{precision.rooftop_exacto || 0} guías</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      resumen.total_pedidos > 0
                        ? ((precision.rooftop_exacto || 0) / resumen.total_pedidos) * 100
                        : 0
                    }%`
                  }}
                ></div>
              </div>
            </div>

            {/* APROXIMADO VIA */}
            <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-amber-500/20 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  🟡 Aproximado / Vía o Esquina
                </span>
                <span className="font-bold text-white">{precision.aproximada || 0} guías</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      resumen.total_pedidos > 0
                        ? ((precision.aproximada || 0) / resumen.total_pedidos) * 100
                        : 0
                    }%`
                  }}
                ></div>
              </div>
            </div>

            {/* AMBIGUO / REVISIÓN */}
            <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-red-500/20 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  🔴 Ambiguo / Sin Coincidencia
                </span>
                <span className="font-bold text-white">{precision.ambigua || 0} guías</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-red-500 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      resumen.total_pedidos > 0
                        ? ((precision.ambigua || 0) / resumen.total_pedidos) * 100
                        : 0
                    }%`
                  }}
                ></div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* DISTRIBUCIÓN POR ZONAS GEOJSON */}
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Densidad de Envíos por Zona GeoJSON</h3>
                <p className="text-xs text-slate-400">Distribución de carga operativa en sectores activos</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/sectorizacion')}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-all"
            >
              <span>Gestión Zonas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5 pt-1">
            {zonas.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay envíos asignados a zonas aún o no se han cargado polígonos GeoJSON.
              </div>
            ) : (
              zonas.map((z, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-white/5 hover:border-white/10 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-bold flex items-center justify-center border border-blue-500/20">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">{z.zona}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-extrabold text-white">{z.cantidad} guías</span>
                    <span className="text-[10px] text-slate-500">
                      ({resumen.total_pedidos > 0 ? Math.round((z.cantidad / resumen.total_pedidos) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      {/* SECCIÓN 3: EMBUDO OPERATIVO DE PEDIDOS */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Embudo del Estado Operativo</h3>
              <p className="text-xs text-slate-400">Flujo completo desde importación hasta la conciliación final de entregas</p>
            </div>
          </div>

          <button
            onClick={() => navigate('/conciliacion')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-all border border-white/10"
          >
            <span>Ir a Conciliación</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          {/* CREADOS */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-white/5 text-center space-y-1">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">1. Pendientes</span>
            <div className="text-xl font-black text-white">{estados.creados_pendientes || 0}</div>
            <span className="text-[10px] text-slate-500">Sin escaneo QR</span>
          </div>

          {/* BODEGA */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-amber-500/20 text-center space-y-1">
            <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">2. En Bodega</span>
            <div className="text-xl font-black text-amber-400">{estados.en_bodega || 0}</div>
            <span className="text-[10px] text-slate-500">Listos en almacén</span>
          </div>

          {/* EN RUTA */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-blue-500/20 text-center space-y-1">
            <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">3. En Ruta</span>
            <div className="text-xl font-black text-blue-400">{estados.en_ruta || 0}</div>
            <span className="text-[10px] text-slate-500">En poder de conductor</span>
          </div>

          {/* ENTREGADOS */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-emerald-500/20 text-center space-y-1">
            <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">4. Entregados</span>
            <div className="text-xl font-black text-emerald-400">{estados.entregados || 0}</div>
            <span className="text-[10px] text-slate-500">Conciliados OK</span>
          </div>

          {/* NOVEDADES */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-red-500/20 text-center space-y-1">
            <span className="text-[10px] text-red-400 font-medium uppercase tracking-wider">5. Novedades</span>
            <div className="text-xl font-black text-red-400">{estados.novedades || 0}</div>
            <span className="text-[10px] text-slate-500">Devolución / Fallo</span>
          </div>

          {/* FUERA DE ZONA */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-purple-500/20 text-center space-y-1">
            <span className="text-[10px] text-purple-400 font-medium uppercase tracking-wider">6. Sin Zona</span>
            <div className="text-xl font-black text-purple-400">{estados.fuera_de_zona || 0}</div>
            <span className="text-[10px] text-slate-500">Requiere re-sectorizar</span>
          </div>
        </div>
      </GlassCard>

      {/* SECCIÓN 4: RENDIMIENTO DE LA FLOTA DE DOMICILIARIOS & ACCIONES RÁPIDAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TOP CONDUCTORES (2 COLS) */}
        <GlassCard className="lg:col-span-2 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Top Domiciliarios por Entregas Efectivas</h3>
                <p className="text-xs text-slate-400">Rendimiento operativo individual y devengado en el ciclo actual</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/personal')}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-all"
            >
              <span>Ver Personal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto pt-1">
            {flota.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay entregas registradas por domiciliarios en este período.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Conductor</th>
                    <th className="py-2.5 px-3 text-center">Cédula</th>
                    <th className="py-2.5 px-3 text-center">Entregados</th>
                    <th className="py-2.5 px-3 text-center">En Ruta</th>
                    <th className="py-2.5 px-3 text-right">Tarifa</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {flota.map((d, i) => (
                    <tr key={d.id || i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3 font-semibold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] flex items-center justify-center font-bold">
                          {i + 1}
                        </span>
                        {d.nombre}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">{d.cedula}</td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="emerald">{d.entregados}</Badge>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-300">{d.en_ruta}</td>
                      <td className="py-3 px-3 text-right text-slate-400">{fmtCOP(d.tarifa)}</td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-400">{fmtCOP(d.subtotal_ganado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </GlassCard>

        {/* PANEL DE ACCIONES EJECUTIVAS RÁPIDAS */}
        <GlassCard className="p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Accesos Directos Ejecutivo</h3>
                <p className="text-xs text-slate-400">Atajos rápidos a flujos clave</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={scrollToMap}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-blue-600/20 border border-white/10 hover:border-blue-500/30 text-xs font-semibold text-white transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <Map className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span>Ver Mapa Cartográfico</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors" />
              </button>

              <button
                onClick={() => navigate('/sectorizacion')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-emerald-600/20 border border-white/10 hover:border-emerald-500/30 text-xs font-semibold text-white transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span>Configurar Zonas GeoJSON</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </button>

              <button
                onClick={() => navigate('/conciliacion')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-amber-600/20 border border-white/10 hover:border-amber-500/30 text-xs font-semibold text-white transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <Warehouse className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span>Escanear QR / Conciliar Entregas</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
              </button>

              <button
                onClick={() => navigate('/personal')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-purple-600/20 border border-white/10 hover:border-purple-500/30 text-xs font-semibold text-white transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span>Liquidar Nómina & Vales</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 transition-colors" />
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 mt-4">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Multi-tenant RLS Activo</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Todos los indicadores están aislados mediante la clave RLS <code className="text-blue-300 font-mono">{activeTenantId || 'empresa_demo'}</code>.
            </p>
          </div>
        </GlassCard>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default DashboardPage;

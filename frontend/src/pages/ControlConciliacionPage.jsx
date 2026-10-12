import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { RouteUploader } from '../components/reconciliation/RouteUploader';
import { NominaLiquidacionView } from '../components/payroll/NominaLiquidacionView';
import { dataCache } from '../lib/dataCache';
import {
  Truck,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Upload,
  X,
  Filter,
  UserCheck,
  Calendar,
  AlertCircle,
  Merge,
  FileSpreadsheet,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import axios from 'axios';

export function ControlConciliacionPage() {
  const [activeMainTab, setActiveMainTab] = useState('rutas_diarias');
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filterState, setFilterState] = useState('TODOS');
  const [filterDriver, setFilterDriver] = useState('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUnifyModal, setShowUnifyModal] = useState(false);
  const [selectedDriversToUnify, setSelectedDriversToUnify] = useState([]);
  const [realCedula, setRealCedula] = useState('');
  const [unifying, setUnifying] = useState(false);
  const [toast, setToast] = useState(null);
  const [isStale, setIsStale] = useState(dataCache.isStale('reconciliationOrders'));

  const { activeTenantId } = useAuth();

  useEffect(() => {
    const unsub = dataCache.subscribe(() => {
      setIsStale(dataCache.isStale('reconciliationOrders'));
    });
    return () => unsub();
  }, []);

  // Cargar datos de conciliación optimizados (sub-20ms) usando dataCache
  const fetchReconciliationData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh) {
        dataCache.notifyMutation();
      }
      const [resSummary, resOrders] = await Promise.all([
        dataCache.getReconciliationSummary(forceRefresh),
        dataCache.getReconciliationOrders(forceRefresh)
      ]);
      setSummary(resSummary);
      setOrders(resOrders || []);
      setIsStale(dataCache.isStale('reconciliationOrders'));
    } catch (err) {
      console.error("Error al cargar datos de conciliación", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReconciliationData(false);
  }, [activeTenantId, fetchReconciliationData]);

  const handleUnifyDrivers = async () => {
    if (selectedDriversToUnify.length < 2) {
      alert("Selecciona al menos 2 domiciliarios para unificar");
      return;
    }
    if (!realCedula.trim()) {
      alert("Ingresa la Cédula Real que unificará a estos conductores");
      return;
    }

    setUnifying(true);
    try {
      const res = await axios.post('/api/v1/reconciliation/drivers/unify', {
        cedula_real: realCedula.trim(),
        driver_ids: selectedDriversToUnify
      });

      setToast({
        type: 'success',
        title: 'Conductores Unificados',
        message: res.data.message
      });

      setShowUnifyModal(false);
      setSelectedDriversToUnify([]);
      setRealCedula('');
      dataCache.notifyMutation();
      fetchReconciliationData(true);
    } catch (err) {
      console.error("Error unificando conductores", err);
      setToast({
        type: 'error',
        title: 'Error de Unificación',
        message: err.response?.data?.detail || 'No se pudieron unificar los domiciliarios'
      });
    } finally {
      setUnifying(false);
    }
  };

  const handleRouteUploadComplete = (data) => {
    dataCache.notifyMutation();
    fetchReconciliationData(true);
    setToast({
      type: 'success',
      title: 'Conciliación iMile Exitosa',
      message: `Procesadas ${data.total_procesados} entregas: ${data.entregados_count} Entregados, ${data.asignados_count} En Ruta.`
    });
  };

  // Filtrado memoizado por estado, domiciliario y búsqueda instantánea
  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter(o => {
      if (filterDriver !== 'TODOS' && o.domiciliario_nombre !== filterDriver) return false;

      if (filterState === 'TODOS' && !(o.estado === 'ENTREGADO' || o.estado === 'ASIGNADO')) return false;
      if (filterState === 'ENTREGADO' && o.estado !== 'ENTREGADO') return false;
      if (filterState === 'ASIGNADO' && o.estado !== 'ASIGNADO') return false;
      if (filterState === 'PENDIENTE_PAGO' && !(o.estado === 'ENTREGADO' && !o.pagado_conductor)) return false;

      if (!term) return true;
      const guiaMatch = o.guia?.toLowerCase().includes(term);
      const driverMatch = o.domiciliario_nombre?.toLowerCase().includes(term);
      const clienteMatch = o.cliente?.toLowerCase().includes(term);
      const provMatch = o.proveedor_entrega?.toLowerCase().includes(term);
      return guiaMatch || driverMatch || clienteMatch || provMatch;
    });
  }, [orders, filterDriver, filterState, searchTerm]);

  // Reiniciar a la primera página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDriver, filterState, searchTerm]);

  // Paginación instantánea
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const metrics = summary?.metricas || { total_entregados: 0, total_asignados_en_ruta: 0, total_pendientes_pago_nomina: 0 };
  const driversList = summary?.domiciliarios || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-400 shrink-0" />
            Etapa 5 — Control y Conciliación Diaria (Entregas iMile)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Importación de planillas de rutas iMile, autocreación de domiciliarios, control de entregas e historial de nómina pendiente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => fetchReconciliationData(true)}
            disabled={loading}
            className="touch-target p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 flex items-center justify-center disabled:opacity-50"
            title="Refrescar datos (0ms en caché)"
            aria-label="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={() => setShowUnifyModal(true)}
            className="flex-1 sm:flex-initial touch-target flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
          >
            <Merge className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Unificar por Cédula</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex-1 sm:flex-initial touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-500/20"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Importar Rutas</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <GlassCard className="p-4 sm:p-5 rounded-3xl border border-white/10 flex items-center gap-3 sm:gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Total Entregados</p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-white">{metrics.total_entregados}</h3>
            <p className="text-[11px] text-emerald-400 mt-0.5 truncate">Con Hora de Entrega</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">En Ruta (Asignados)</p>
            <h3 className="text-2xl font-extrabold text-white">{metrics.total_asignados_en_ruta}</h3>
            <p className="text-[11px] text-amber-400 mt-0.5">Pendientes de Entregar</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Pendientes Pago Nómina</p>
            <h3 className="text-2xl font-extrabold text-white">{metrics.total_pendientes_pago_nomina}</h3>
            <p className="text-[11px] text-purple-400 mt-0.5">pagado_conductor = FALSE</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Domiciliarios Registrados</p>
            <h3 className="text-2xl font-extrabold text-white">{driversList.length}</h3>
            <p className="text-[11px] text-blue-400 mt-0.5">Auto-detectados</p>
          </div>
        </GlassCard>
      </div>

      {/* Main Content Grid: Drivers List & Reconciliation Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Drivers Tally */}
        <GlassCard className="p-5 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-400" />
              Domiciliarios ({driversList.length})
            </h3>
            <Badge variant="blue">Rutas iMile</Badge>
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto custom-scrollbar">
            {driversList.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                {loading ? 'Cargando domiciliarios...' : 'No hay domiciliarios con entregas. Importa una planilla iMile.'}
              </div>
            ) : (
              driversList.map((d) => (
                <div
                  key={d.domiciliario_id || d.domiciliario}
                  onClick={() => setFilterDriver(filterDriver === d.domiciliario ? 'TODOS' : d.domiciliario)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    filterDriver === d.domiciliario
                      ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-0.5">
                    <h4 className="font-semibold text-xs text-white flex items-center gap-1.5">
                      <span>{d.domiciliario}</span>
                      {d.cedula.startsWith('AUTO-DA') && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">Auto</span>
                      )}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono">CC: {d.cedula}</p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Entregados">
                      {d.total_entregados}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20" title="En Ruta">
                      {d.total_en_ruta}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        {/* Right Column: Reconciled Orders & Delivery Log Table */}
        <GlassCard className="lg:col-span-2 p-5 rounded-3xl border border-white/10 space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="font-bold text-sm text-white">Historial de Conciliaciones & Entregas iMile</h3>
              <p className="text-[11px] text-slate-400">Guías asignadas a conductores y registro de horas de entrega</p>
            </div>

            {/* Instant Search & State Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar guía, conductor, cliente..."
                  className="pl-8 pr-3 py-1.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60 transition-all w-44 md:w-56"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* State Filter Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterState('TODOS')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'TODOS' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  Todos ({orders.length})
                </button>
                <button
                  onClick={() => setFilterState('ENTREGADO')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'ENTREGADO' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  Entregados
                </button>
                <button
                  onClick={() => setFilterState('ASIGNADO')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'ASIGNADO' ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  En Ruta
                </button>
                <button
                  onClick={() => setFilterState('PENDIENTE_PAGO')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'PENDIENTE_PAGO' ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  Pend. Nómina
                </button>
              </div>
            </div>
          </div>

          <div className="rt-wrap overflow-x-auto max-h-[440px] overflow-y-auto custom-scrollbar">
            <table className="rt w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40 sticky top-0 z-10 backdrop-blur-md">
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Guía</th>
                  <th className="p-3">Domiciliario (DA Name)</th>
                  <th className="p-3">Fecha / Hora Entrega</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Estado Pedido</th>
                  <th className="p-3 text-right">Pago Conductor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                        <span>Cargando entregas conciliadas...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                      {searchTerm
                        ? 'No se encontraron entregas que coincidan con la búsqueda.'
                        : 'No se encontraron registros de entregas para los filtros seleccionados. Usa el botón "Importar Rutas".'}
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/30 transition-all">
                      <td data-label="Empresa" className="p-3">
                        <Badge variant="purple" className="text-[10px] font-mono uppercase">
                          {o.tenant_id || activeTenantId || 'Empresa'}
                        </Badge>
                      </td>
                      <td className="rt-title p-3 font-mono font-bold text-blue-400">{o.guia}</td>
                      <td data-label="Domiciliario" className="p-3 font-semibold text-slate-200">
                        {o.domiciliario_nombre || 'SIN ASIGNAR'}
                      </td>
                      <td data-label="Fecha / Hora" className="p-3 font-mono text-slate-300">
                        {o.fecha_entrega ? (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{new Date(o.fecha_entrega).toLocaleString('es-CO')}</span>
                          </div>
                        ) : (
                          <span className="text-amber-400/80 text-[11px]">En Ruta (Sin Hora)</span>
                        )}
                      </td>
                      <td data-label="Proveedor" className="p-3">
                        <Badge variant="blue">{o.proveedor_entrega || 'iMile'}</Badge>
                      </td>
                      <td data-label="Estado" className="p-3">
                        <Badge variant={o.estado === 'ENTREGADO' ? 'emerald' : o.estado === 'ASIGNADO' ? 'amber' : 'titanium'}>
                          {o.estado}
                        </Badge>
                      </td>
                      <td data-label="Pago" className="p-3 text-right font-mono">
                        {o.pagado_conductor ? (
                          <span className="text-emerald-400 font-bold text-[11px]">PAGADO</span>
                        ) : (
                          <span className="text-purple-400 font-bold text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                            PENDIENTE NÓMINA
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Controls: Pagination & Items Per Page */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Mostrar por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-white/10 rounded-xl px-2 py-1 text-white font-mono focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <span className="text-[11px] text-slate-500">
                (Mostrando {filteredOrders.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredOrders.length)} de {filteredOrders.length} pedidos)
              </span>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-300 border border-white/5 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-mono font-bold text-white bg-slate-950/80 border border-white/10 rounded-xl text-xs">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-300 border border-white/5 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* DISCREET ROUTE UPLOAD MODAL */}
      {showUploadModal && (
        <div className="modal-overlay bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="modal-sheet w-full max-w-2xl p-5 sm:p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/95 text-white space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Importar Planilla de Rutas iMile</h3>
                  <p className="text-xs text-slate-400">Concilia entregas, asigna conductores y actualiza horas de entrega</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="touch-target p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center justify-center"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <RouteUploader onBatchComplete={handleRouteUploadComplete} />
          </GlassCard>
        </div>
      )}

      {/* DRIVER UNIFICATION MODAL */}
      {showUnifyModal && (
        <div className="modal-overlay bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="modal-sheet w-full max-w-lg p-5 sm:p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/95 text-white space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Merge className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">Unificar Domiciliarios por Cédula</h3>
              </div>
              <button
                onClick={() => setShowUnifyModal(false)}
                className="touch-target text-slate-400 hover:text-white p-1 rounded-lg flex items-center justify-center"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Selecciona 2 o más domiciliarios generados automáticamente que pertenezcan a la misma persona e ingresa su Cédula Real. Sus alias y entregas se consolidarán automáticamente.
              </p>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Cédula Real del Conductor (*):</label>
                <input
                  type="text"
                  value={realCedula}
                  onChange={(e) => setRealCedula(e.target.value)}
                  placeholder="Ej: 1020304050"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Seleccionar Domiciliarios a Unificar:</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  {driversList.map(d => (
                    <label key={d.domiciliario_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDriversToUnify.includes(d.domiciliario_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDriversToUnify([...selectedDriversToUnify, d.domiciliario_id]);
                          } else {
                            setSelectedDriversToUnify(selectedDriversToUnify.filter(id => id !== d.domiciliario_id));
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-200">{d.domiciliario}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({d.cedula})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleUnifyDrivers}
              disabled={unifying || selectedDriversToUnify.length < 2 || !realCedula.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-500/20 touch-target"
            >
              {unifying ? 'Unificando...' : 'Confirmar Unificación de Conductores'}
            </button>
          </GlassCard>
        </div>
      )}

      {/* Toast */}
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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  RefreshCw,
  Barcode,
  Package,
  Volume2,
  VolumeX,
  RotateCcw,
  Building2,
  ClipboardPaste
} from 'lucide-react';
import axios from 'axios';

export function ControlConciliacionPage() {
  const [activeMainTab, setActiveMainTab] = useState('rutas_diarias');
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filterState, setFilterState] = useState('ASIGNADO');
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

  // Estado para el Lector de Códigos de Barras y Devoluciones (Bodega vs Proveedor)
  const [returnMode, setReturnMode] = useState('BODEGA'); // 'BODEGA' | 'PROVEEDOR'
  const [scanInputType, setScanInputType] = useState('individual'); // 'individual' | 'lote'
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [lastScannedReturn, setLastScannedReturn] = useState(null);
  const [recentReturns, setRecentReturns] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const barcodeInputRef = useRef(null);

  // Estado para pegado masivo / lote (Excel / texto)
  const [batchInput, setBatchInput] = useState('');
  const [processingBatch, setProcessingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

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

  // Sintetizador Web Audio para confirmación del escaneo (beeps tipo lector de caja/bodega)
  const playScannerSound = useCallback((type) => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;

      if (type === 'success') {
        // Beep Agudo Estándar de pistola de código de barras (880 Hz, 120ms)
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else {
        // Tono grave de error (220 Hz, 280ms)
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch {
      // AudioContext failure gracefully ignored
    }
  }, [soundEnabled]);

  // Parser de guías pegadas en lote (desde Excel o texto)
  const detectedGuides = useMemo(() => {
    if (!batchInput.trim()) return [];
    const items = batchInput.split(/[\r\n,;\t]+/)
      .map(s => s.trim())
      .filter(Boolean);
    return Array.from(new Set(items));
  }, [batchInput]);

  // Manejador del escáner de códigos de barras individual (Bodega vs Proveedor)
  const handleScanReturn = async (e) => {
    if (e) e.preventDefault();
    const code = barcodeInput.trim();
    if (!code || scanningBarcode) return;

    setScanningBarcode(true);
    const isProv = returnMode === 'PROVEEDOR';
    try {
      const res = await axios.post('/api/v1/reconciliation/scan-return-to-warehouse', {
        barcode: code,
        motivo: isProv ? 'DEVOLUCION_PROVEEDOR' : 'NO_ENTREGADO_RUTA',
        tipo_destino: returnMode
      });

      playScannerSound('success');
      const data = res.data;
      setLastScannedReturn(data);
      setRecentReturns(prev => [
        {
          ...data,
          time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        },
        ...prev.filter(item => item.guia !== data.guia).slice(0, 14)
      ]);

      setToast({
        type: 'success',
        title: isProv ? 'Devuelto al Proveedor' : 'Reingresado a Bodega',
        message: isProv
          ? `Guía ${data.guia} enviada al PROVEEDOR (retirada de ${data.domiciliario_anterior}).`
          : `Guía ${data.guia} reingresada a BODEGA (retirada de ${data.domiciliario_anterior}).`
      });

      setBarcodeInput('');
      dataCache.notifyMutation();
      fetchReconciliationData(true);
    } catch (err) {
      console.error("Error al procesar devolución", err);
      playScannerSound('error');
      const msg = err.response?.data?.detail || 'No se pudo procesar la devolución.';
      setToast({
        type: 'error',
        title: 'Error de Escaneo',
        message: msg
      });
    } finally {
      setScanningBarcode(false);
      barcodeInputRef.current?.focus();
    }
  };

  // Manejador para procesamiento en lote masivo pegado de Excel o documento
  const handleBatchReturn = async () => {
    if (detectedGuides.length === 0 || processingBatch) return;

    setProcessingBatch(true);
    const isProv = returnMode === 'PROVEEDOR';
    try {
      const res = await axios.post('/api/v1/reconciliation/batch-return-to-warehouse', {
        barcodes: detectedGuides,
        tipo_destino: returnMode,
        motivo: isProv ? 'DEVOLUCION_PROVEEDOR_LOTE' : 'REINGRESO_BODEGA_LOTE'
      });

      playScannerSound('success');
      const data = res.data;
      setBatchResult(data);

      setToast({
        type: data.exitosos_count > 0 ? 'success' : 'error',
        title: isProv ? 'Lote Devuelto al Proveedor' : 'Lote Reingresado a Bodega',
        message: `Procesadas ${data.exitosos_count} de ${data.total_recibidos} guías con éxito.${data.fallidos_count > 0 ? ` (${data.fallidos_count} novedades)` : ''}`
      });

      if (data.exitosos_count > 0) {
        setBatchInput('');
        dataCache.notifyMutation();
        fetchReconciliationData(true);
      }
    } catch (err) {
      console.error("Error al procesar lote", err);
      playScannerSound('error');
      const msg = err.response?.data?.detail || 'Error al procesar el lote de guías.';
      setToast({
        type: 'error',
        title: 'Error de Lote',
        message: msg
      });
    } finally {
      setProcessingBatch(false);
    }
  };

  // Auto-detección de pegado multilínea en el input individual
  const handleSingleInputPaste = (e) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    const tokens = text.split(/[\r\n,;\t]+/).map(s => s.trim()).filter(Boolean);
    if (tokens.length > 1) {
      e.preventDefault();
      setScanInputType('lote');
      setBatchInput(text);
      setToast({
        type: 'info',
        title: 'Modo Lote Detectado',
        message: `Se detectaron ${tokens.length} guías pegadas. Cambiado a modo Pegar Lote.`
      });
    }
  };

  // Filtrado memoizado por estado, domiciliario y búsqueda instantánea
  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter(o => {
      if (filterDriver !== 'TODOS' && o.domiciliario_nombre !== filterDriver) return false;

      if (filterState === 'TODOS' && !(o.estado === 'ENTREGADO' || o.estado === 'ASIGNADO' || o.estado === 'DEVUELTO_PROVEEDOR')) return false;
      if (filterState === 'ENTREGADO' && o.estado !== 'ENTREGADO') return false;
      if (filterState === 'ASIGNADO' && o.estado !== 'ASIGNADO') return false;
      if (filterState === 'DEVUELTO_PROVEEDOR' && o.estado !== 'DEVUELTO_PROVEEDOR') return false;
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

  const metrics = summary?.metricas || { total_entregados: 0, total_asignados_en_ruta: 0, total_pendientes_pago_nomina: 0, total_devueltos_proveedor: 0 };
  const allDrivers = summary?.domiciliarios || [];
  const driversList = useMemo(() => {
    return allDrivers.filter(d => (Number(d.total_en_ruta) || 0) > 0);
  }, [allDrivers]);

  useEffect(() => {
    if (filterDriver !== 'TODOS' && !driversList.some(d => d.domiciliario === filterDriver)) {
      setFilterDriver('TODOS');
    }
  }, [driversList, filterDriver]);

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
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
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Domiciliarios con Pendientes</p>
            <h3 className="text-2xl font-extrabold text-white">{driversList.length}</h3>
            <p className="text-[11px] text-blue-400 mt-0.5">
              Con paquetes en ruta {allDrivers.length > 0 ? `(${allDrivers.length} reg.)` : ''}
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Barcode Scanner & Batch Return Processor Card */}
      <GlassCard className={`p-4 sm:p-5 rounded-3xl border transition-all duration-300 shadow-2xl relative overflow-hidden backdrop-blur-xl ${
        returnMode === 'PROVEEDOR'
          ? 'bg-gradient-to-b from-rose-950/40 via-slate-900/90 to-slate-900/90 border-rose-500/50 shadow-rose-950/30'
          : 'bg-slate-900/60 border-white/10'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl border shrink-0 shadow-inner transition-colors ${
              returnMode === 'PROVEEDOR'
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
              {returnMode === 'PROVEEDOR' ? <Truck className="w-6 h-6" /> : <Barcode className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {returnMode === 'PROVEEDOR' ? 'Devolución de Ruta / Inventario al Proveedor' : 'Recepción de Devoluciones a Bodega'}
                </h3>
                {returnMode === 'PROVEEDOR' ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 animate-pulse font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    MODO: DEVOLUCIÓN A PROVEEDOR
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Modo Bodega Activo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {returnMode === 'PROVEEDOR'
                  ? 'Las guías escaneadas o pegadas pasarán a DEVUELTO_PROVEEDOR y se descontarán de la ruta.'
                  : 'Las guías devueltas por los domiciliarios se reingresarán a bodega (EN_BODEGA) y se liberarán de la ruta.'}
              </p>
            </div>
          </div>

          {/* Mode Switchers: Bodega vs Proveedor & Sound */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Toggle Destination: Bodega vs Proveedor */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-950/80 border border-white/10 gap-1">
              <button
                type="button"
                onClick={() => setReturnMode('BODEGA')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  returnMode === 'BODEGA'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>A Bodega</span>
              </button>

              <button
                type="button"
                onClick={() => setReturnMode('PROVEEDOR')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  returnMode === 'PROVEEDOR'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 font-bold'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-rose-400" />
                <span>Devolver al Proveedor</span>
              </button>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`touch-target p-2.5 rounded-2xl border text-xs flex items-center gap-1.5 transition-all ${
                soundEnabled
                  ? 'bg-slate-800 border-white/10 text-slate-300 hover:text-white'
                  : 'bg-slate-900 border-white/5 text-slate-500'
              }`}
              title={soundEnabled ? 'Sonido activado' : 'Sonido silenciado'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
        </div>

        {/* Input Method Tabs: Escáner 1 a 1 vs Pegar Lote */}
        <div className="mt-4 flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScanInputType('individual')}
              className={`px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                scanInputType === 'individual'
                  ? 'bg-slate-800 text-white border border-white/10'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>Escáner 1 a 1</span>
            </button>

            <button
              type="button"
              onClick={() => setScanInputType('lote')}
              className={`px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                scanInputType === 'lote'
                  ? 'bg-slate-800 text-white border border-white/10'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Pegar Lote (Excel / Lista)</span>
              {detectedGuides.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono text-[10px]">
                  {detectedGuides.length}
                </span>
              )}
            </button>
          </div>

          <span className="text-[11px] text-slate-400 hidden sm:inline">
            {scanInputType === 'individual' ? 'Presiona Enter o pistolea' : 'Pega columnas directas de Excel'}
          </span>
        </div>

        {/* Form: Single Scan vs Batch Mode */}
        {scanInputType === 'individual' ? (
          <form onSubmit={handleScanReturn} className="mt-3 flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <Barcode className={`w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
                returnMode === 'PROVEEDOR' ? 'text-rose-400' : 'text-slate-400'
              }`} />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onPaste={handleSingleInputPaste}
                placeholder={
                  returnMode === 'PROVEEDOR'
                    ? "⚠️ MODO PROVEEDOR ACTIVO: Escanea la guía o pega una lista para devolver al proveedor..."
                    : "Escanea el código de barras de la guía o escribe el número y presiona Enter..."
                }
                disabled={scanningBarcode}
                autoFocus
                className={`w-full pl-11 pr-10 py-3 rounded-2xl text-sm md:text-base font-mono focus:outline-none transition-all shadow-inner ${
                  returnMode === 'PROVEEDOR'
                    ? 'bg-rose-950/30 border-2 border-rose-500/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/30 text-rose-100 placeholder:text-rose-400/40'
                    : 'bg-slate-950/80 border border-white/15 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 text-white placeholder:text-slate-500'
                }`}
              />
              {barcodeInput && (
                <button
                  type="button"
                  onClick={() => { setBarcodeInput(''); barcodeInputRef.current?.focus(); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={scanningBarcode || !barcodeInput.trim()}
              className={`touch-target px-5 py-3 rounded-2xl disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                returnMode === 'PROVEEDOR'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
              }`}
            >
              {scanningBarcode ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : returnMode === 'PROVEEDOR' ? (
                <>
                  <Truck className="w-4 h-4" />
                  <span>Devolver a Proveedor</span>
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  <span>Reingresar a Bodega</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Batch Paste Textarea */
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <textarea
                rows={4}
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder={`Pega aquí el listado de guías copiado de Excel o texto (una guía por línea o separadas por comas):\nEjemplo:\nJTC000152512270\nJTC000169117449\nJTC000155632773`}
                disabled={processingBatch}
                className={`w-full p-3.5 rounded-2xl text-xs md:text-sm font-mono focus:outline-none transition-all shadow-inner custom-scrollbar ${
                  returnMode === 'PROVEEDOR'
                    ? 'bg-rose-950/30 border-2 border-rose-500/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/30 text-rose-100 placeholder:text-rose-400/40'
                    : 'bg-slate-950/80 border border-white/15 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 text-white placeholder:text-slate-500'
                }`}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Guías identificadas:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                  detectedGuides.length > 0
                    ? (returnMode === 'PROVEEDOR' ? 'bg-rose-500/20 text-rose-300' : 'bg-blue-500/20 text-blue-300')
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  {detectedGuides.length}
                </span>
                {detectedGuides.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setBatchInput(''); setBatchResult(null); }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 underline ml-1"
                  >
                    Borrar texto
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleBatchReturn}
                disabled={processingBatch || detectedGuides.length === 0}
                className={`touch-target px-5 py-2.5 rounded-2xl disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${
                  returnMode === 'PROVEEDOR'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                }`}
              >
                {processingBatch ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Procesando lote de {detectedGuides.length} guías...</span>
                  </>
                ) : returnMode === 'PROVEEDOR' ? (
                  <>
                    <Truck className="w-4 h-4" />
                    <span>Procesar {detectedGuides.length || ''} Guías a Proveedor</span>
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    <span>Reingresar {detectedGuides.length || ''} Guías a Bodega</span>
                  </>
                )}
              </button>
            </div>

            {/* Batch Result Summary Banner */}
            {batchResult && (
              <div className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                batchResult.fallidos_count > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    {batchResult.message}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Éxito: <strong className="text-emerald-400">{batchResult.exitosos_count}</strong> | Novedades: <strong className="text-amber-400">{batchResult.fallidos_count}</strong>
                  </span>
                </div>

                {batchResult.fallidos && batchResult.fallidos.length > 0 && (
                  <div className="pt-2 border-t border-white/5 space-y-1">
                    <p className="text-[11px] font-semibold text-amber-300">Guías que no se pudieron procesar:</p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {batchResult.fallidos.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-slate-950/80 border border-amber-500/30 text-[10px] font-mono text-amber-200">
                          {f.guia} ({f.motivo})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Feedback of Last Single Scan */}
        {scanInputType === 'individual' && lastScannedReturn && (
          <div className={`mt-3.5 p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn ${
            lastScannedReturn.nuevo_estado === 'DEVUELTO_PROVEEDOR'
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                lastScannedReturn.nuevo_estado === 'DEVUELTO_PROVEEDOR'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white text-sm">
                    {lastScannedReturn.guia}
                  </span>
                  <Badge variant={lastScannedReturn.nuevo_estado === 'DEVUELTO_PROVEEDOR' ? 'red' : 'emerald'} className="text-[10px]">
                    {lastScannedReturn.nuevo_estado === 'DEVUELTO_PROVEEDOR' ? 'DEVUELTO A PROVEEDOR' : 'EN BODEGA'}
                  </Badge>
                  <span className="text-[11px] text-slate-400">
                    Zona: <strong className="text-slate-200">{lastScannedReturn.zona_nombre}</strong>
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Retirado con éxito de la ruta de: <strong className="text-amber-400">{lastScannedReturn.domiciliario_anterior}</strong>
                </p>
              </div>
            </div>
            <div className={`text-left sm:text-right text-[11px] font-mono shrink-0 ${
              lastScannedReturn.nuevo_estado === 'DEVUELTO_PROVEEDOR' ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {lastScannedReturn.nuevo_estado === 'DEVUELTO_PROVEEDOR' ? 'Devuelto al Proveedor' : 'Devuelto a Bodega'}
            </div>
          </div>
        )}

        {/* Tray of recent returns in current session */}
        {recentReturns.length > 1 && (
          <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center gap-2 overflow-x-auto custom-scrollbar text-xs">
            <span className="text-[11px] font-medium text-slate-400 shrink-0">Recientes en sesión ({recentReturns.length}):</span>
            {recentReturns.map((item, idx) => (
              <div
                key={`${item.guia}-${idx}`}
                className="px-2.5 py-1 rounded-xl bg-slate-950/60 border border-white/5 flex items-center gap-1.5 shrink-0 text-[11px]"
              >
                <span className="font-mono text-blue-400 font-bold">{item.guia}</span>
                <span className="text-slate-500">•</span>
                <span className="text-amber-300 truncate max-w-[130px]">{item.domiciliario_anterior}</span>
                <span className={`text-[10px] font-mono px-1 rounded ${
                  item.nuevo_estado === 'DEVUELTO_PROVEEDOR' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {item.nuevo_estado === 'DEVUELTO_PROVEEDOR' ? 'PROV' : 'BOD'}
                </span>
                <span className="text-slate-500 font-mono text-[10px]">({item.time})</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Main Content Grid: Drivers List & Reconciliation Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Drivers Tally */}
        <GlassCard className="p-5 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-400" />
              Domiciliarios con Pendientes ({driversList.length})
            </h3>
            <Badge variant="amber">En Ruta</Badge>
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto custom-scrollbar">
            {driversList.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                {loading ? 'Cargando domiciliarios...' : 'No hay domiciliarios con paquetes pendientes en ruta.'}
              </div>
            ) : (
              driversList.map((d) => (
                <div
                  key={d.domiciliario_id || d.domiciliario}
                  onClick={() => setFilterDriver(filterDriver === d.domiciliario ? 'TODOS' : d.domiciliario)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    filterDriver === d.domiciliario
                      ? 'bg-amber-600/20 border-amber-500/50 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-0.5">
                    <h4 className="font-semibold text-xs text-white flex items-center gap-1.5">
                      <span>{d.domiciliario}</span>
                      {d.cedula && d.cedula.startsWith('AUTO-DA') && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">Auto</span>
                      )}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono">CC: {d.cedula}</p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Entregados">
                      {d.total_entregados}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20" title="En Ruta (Pendientes)">
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
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Historial de Conciliaciones & Entregas iMile</span>
                {filterDriver !== 'TODOS' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    Conductor: {filterDriver}
                    <button
                      onClick={(e) => { e.stopPropagation(); setFilterDriver('TODOS'); }}
                      className="hover:text-white ml-0.5"
                      title="Quitar filtro de conductor"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </h3>
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
                  onClick={() => setFilterState('ASIGNADO')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'ASIGNADO' ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  En Ruta ({metrics.total_asignados_en_ruta})
                </button>
                <button
                  onClick={() => setFilterState('ENTREGADO')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'ENTREGADO' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  Entregados ({metrics.total_entregados})
                </button>
                <button
                  onClick={() => setFilterState('DEVUELTO_PROVEEDOR')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'DEVUELTO_PROVEEDOR' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  Devueltos Prov. ({metrics.total_devueltos_proveedor || 0})
                </button>
                <button
                  onClick={() => setFilterState('TODOS')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    filterState === 'TODOS' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  Todos ({orders.length})
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
                        <Badge variant={o.estado === 'ENTREGADO' ? 'emerald' : o.estado === 'ASIGNADO' ? 'amber' : o.estado === 'DEVUELTO_PROVEEDOR' ? 'red' : 'titanium'}>
                          {o.estado === 'DEVUELTO_PROVEEDOR' ? 'DEVUELTO PROV.' : o.estado}
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

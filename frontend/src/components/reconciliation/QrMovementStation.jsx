import React, { useState, useEffect, useMemo, useCallback } from 'react';
import QRCode from 'qrcode';
import axios from 'axios';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  QrCode,
  ClipboardPaste,
  LayoutGrid,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Trash2,
  Copy,
  Check,
  Building2,
  Truck,
  Sparkles,
  RefreshCw,
  EyeOff,
  Eye,
  ArrowDownToLine,
  Smartphone,
  Keyboard
} from 'lucide-react';

/**
 * Componente individual que renderiza un código QR de alto contraste en un Data URL
 * óptimo para lectura rápida desde cámaras de celulares (apps de proveedores como iMile).
 */
function QrCodeImage({ value, size = 180, className = '' }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch((err) => {
        console.error('Error generando QR:', err);
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-white/90 rounded-2xl flex items-center justify-center animate-pulse ${className}`}
      >
        <QrCode className="w-8 h-8 text-slate-400" />
      </div>
    );
  }

  return (
    <div className={`bg-white p-2.5 rounded-2xl shadow-xl inline-flex items-center justify-center ${className}`}>
      <img
        src={dataUrl}
        alt={`QR ${value}`}
        style={{ width: size, height: size }}
        className="block select-none"
      />
    </div>
  );
}

export function QrMovementStation({
  orders = [],
  filteredOrders = [],
  filterDriver = 'TODOS',
  filterState = 'ASIGNADO',
  playScannerSound,
  onMovementApplied,
  setToast
}) {
  const [rawText, setRawText] = useState('');
  const [viewMode, setViewMode] = useState('carousel'); // 'carousel' | 'grid'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scannedMap, setScannedMap] = useState({});
  const [hideScannedInGrid, setHideScannedInGrid] = useState(false);
  const [qrSizeGrid, setQrSizeGrid] = useState(160);
  const [copiedGuia, setCopiedGuia] = useState(null);
  const [movementType, setMovementType] = useState('BODEGA'); // 'BODEGA' | 'PROVEEDOR'
  const [applyScope, setApplyScope] = useState('ALL'); // 'ALL' | 'SCANNED_ONLY'
  const [submittingMovement, setSubmittingMovement] = useState(false);
  const [keyboardNavEnabled, setKeyboardNavEnabled] = useState(true);

  // Extraer listado único de guías desde el texto pegado
  const guidesList = useMemo(() => {
    if (!rawText.trim()) return [];
    const tokens = rawText
      .split(/[\r\n,;\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(tokens));
  }, [rawText]);

  // Mapa rápido de pedidos existentes para mostrar contexto (conductor, estado, zona)
  const ordersByGuia = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      if (o.guia) {
        map.set(o.guia.toUpperCase(), o);
      }
    }
    return map;
  }, [orders]);

  // Ajustar índice del carrusel si cambia la longitud de la lista
  useEffect(() => {
    if (currentIndex >= guidesList.length && guidesList.length > 0) {
      setCurrentIndex(guidesList.length - 1);
    } else if (guidesList.length === 0) {
      setCurrentIndex(0);
    }
  }, [guidesList.length, currentIndex]);

  const scannedCount = useMemo(() => {
    return guidesList.filter((g) => scannedMap[g]).length;
  }, [guidesList, scannedMap]);

  const progressPercent = guidesList.length > 0
    ? Math.round((scannedCount / guidesList.length) * 100)
    : 0;

  // Traer guías desde la tabla superior filtrada
  const handleLoadFromTable = () => {
    if (!filteredOrders || filteredOrders.length === 0) {
      setToast?.({
        type: 'error',
        title: 'Sin guías en la tabla',
        message: 'No hay pedidos en el filtro actual de la tabla superior para cargar.'
      });
      return;
    }
    const list = filteredOrders.map((o) => o.guia).filter(Boolean);
    const unique = Array.from(new Set(list));
    setRawText(unique.join('\n'));
    setCurrentIndex(0);
    setScannedMap({});
    setToast?.({
      type: 'success',
      title: 'Guías Cargadas a Estación QR',
      message: `Se generaron ${unique.length} códigos QR desde la tabla filtrada.`
    });
  };

  const toggleScanned = useCallback((guia, forceValue = undefined) => {
    if (!guia) return;
    setScannedMap((prev) => {
      const nextVal = forceValue !== undefined ? forceValue : !prev[guia];
      return { ...prev, [guia]: nextVal };
    });
  }, []);

  const handleMarkAndNext = useCallback(() => {
    if (guidesList.length === 0) return;
    const currentGuia = guidesList[currentIndex];
    if (currentGuia) {
      toggleScanned(currentGuia, true);
      playScannerSound?.('success');
    }
    if (currentIndex < guidesList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [guidesList, currentIndex, toggleScanned, playScannerSound]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < guidesList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, guidesList.length]);

  // Atajos de teclado en modo carrusel (Flechas / Espacio) cuando no se está escribiendo en un input/textarea
  useEffect(() => {
    if (!keyboardNavEnabled || viewMode !== 'carousel' || guidesList.length === 0) return;

    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleMarkAndNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardNavEnabled, viewMode, guidesList.length, handleNext, handlePrev, handleMarkAndNext]);

  const handleCopyGuia = async (guia) => {
    try {
      await navigator.clipboard.writeText(guia);
      setCopiedGuia(guia);
      setTimeout(() => setCopiedGuia(null), 1500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  // Aplicar movimiento en GeoFull (A Bodega o Devolver al Proveedor)
  const handleApplyMovement = async () => {
    const targetGuides =
      applyScope === 'SCANNED_ONLY'
        ? guidesList.filter((g) => scannedMap[g])
        : guidesList;

    if (targetGuides.length === 0 || submittingMovement) {
      setToast?.({
        type: 'error',
        title: 'Sin guías seleccionadas',
        message:
          applyScope === 'SCANNED_ONLY'
            ? 'No has marcado ningún QR como escaneado todavía.'
            : 'Pega o carga al menos una guía para aplicar el movimiento.'
      });
      return;
    }

    setSubmittingMovement(true);
    const isProv = movementType === 'PROVEEDOR';
    try {
      const res = await axios.post('/api/v1/reconciliation/batch-return-to-warehouse', {
        barcodes: targetGuides,
        tipo_destino: movementType,
        motivo: isProv ? 'MOVIMIENTO_QR_PROVEEDOR' : 'MOVIMIENTO_QR_BODEGA'
      });

      const data = res.data;
      playScannerSound?.('success');
      setToast?.({
        type: data.exitosos_count > 0 ? 'success' : 'error',
        title: isProv ? 'Movimiento a Proveedor Aplicado' : 'Movimiento a Bodega Aplicado',
        message: `Se actualizaron ${data.exitosos_count} de ${data.total_recibidos} guías en GeoFull.${
          data.fallidos_count > 0 ? ` (${data.fallidos_count} novedades)` : ''
        }`
      });

      if (data.exitosos_count > 0) {
        onMovementApplied?.();
      }
    } catch (err) {
      playScannerSound?.('error');
      const msg = err.response?.data?.detail || 'Error al registrar el movimiento de las guías.';
      setToast?.({
        type: 'error',
        title: 'Error en Movimiento',
        message: msg
      });
    } finally {
      setSubmittingMovement(false);
    }
  };

  const currentGuia = guidesList[currentIndex] || null;
  const currentOrderInfo = currentGuia ? ordersByGuia.get(currentGuia.toUpperCase()) : null;

  const visibleGridGuides = useMemo(() => {
    return guidesList
      .map((guia, idx) => ({ guia, idx }))
      .filter((item) => (hideScannedInGrid ? !scannedMap[item.guia] : true));
  }, [guidesList, hideScannedInGrid, scannedMap]);

  return (
    <GlassCard className="p-5 sm:p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl space-y-5">
      {/* Header de la Estación QR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 shrink-0 shadow-lg shadow-blue-500/10">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                Generador de Códigos QR y Movimientos para App del Proveedor
              </h3>
              <Badge variant="blue" className="text-[10px] flex items-center gap-1">
                <Smartphone className="w-3 h-3" />
                Escaneo desde Celular
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Pega un listado de guías o trae las filtradas de la tabla superior para generar sus códigos QR individuales, escanearlos fácilmente desde la app del proveedor y registrar su movimiento.
            </p>
          </div>
        </div>

        {/* Controles rápidos de carga y modo de visualización */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadFromTable}
            disabled={!filteredOrders || filteredOrders.length === 0}
            className="touch-target px-3.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-white/10 flex items-center gap-2 transition-all cursor-pointer"
            title="Cargar todas las guías que están actualmente filtradas en la tabla de arriba"
          >
            <ArrowDownToLine className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              Traer de Tabla ({filteredOrders.length})
              {filterDriver !== 'TODOS' ? ` • ${filterDriver}` : ''}
            </span>
          </button>

          <div className="flex items-center p-1 rounded-2xl bg-slate-950/80 border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setViewMode('carousel')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'carousel'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Modo 1 a 1 (Carrusel)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cuadrícula ({guidesList.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Layout Principal: Columna Izquierda (Entrada de Guías + Movimiento) y Columna Derecha (Visor de QRs) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Panel Izquierdo: Pegado de Guías y Acción en GeoFull */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-blue-400" />
                <span>Listado de Guías (Excel / Texto)</span>
              </label>
              {guidesList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setScannedMap({});
                    setCurrentIndex(0);
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpiar ({guidesList.length})</span>
                </button>
              )}
            </div>

            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Pega aquí la columna de guías desde Excel o escribe una por línea:\nJTC000152512270\nJTC000169117449\nJTC000155632773`}
              className="w-full p-3 rounded-xl bg-slate-900/90 border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 text-xs sm:text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none custom-scrollbar"
            />

            {/* Barra de Progreso de Escaneo con Celular */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Progreso de escaneo móvil:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {scannedCount} / {guidesList.length} ({progressPercent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {scannedCount > 0 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setScannedMap({})}
                    className="text-[11px] text-slate-400 hover:text-white underline"
                  >
                    Desmarcar todos los escaneados
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Panel de Movimiento Opcional en GeoFull */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Aplicar Movimiento en GeoFull</span>
              </h4>
              <span className="text-[10px] font-mono text-slate-400">Opcional</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Además de escanear los QR con la app del proveedor, puedes actualizar el estado de estas guías en GeoFull en un clic:
            </p>

            {/* Destino: A Bodega vs Proveedor */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMovementType('BODEGA')}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  movementType === 'BODEGA'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-md'
                    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>A Bodega</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementType('PROVEEDOR')}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  movementType === 'PROVEEDOR'
                    ? 'bg-rose-600/20 border-rose-500 text-rose-300 shadow-md'
                    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>A Proveedor</span>
              </button>
            </div>

            {/* Alcance: Todas las del listado vs Solo las ya escaneadas */}
            <div className="flex items-center gap-2 text-[11px] text-slate-300 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="qrApplyScope"
                  checked={applyScope === 'ALL'}
                  onChange={() => setApplyScope('ALL')}
                  className="text-blue-500 focus:ring-blue-500 bg-slate-900 border-slate-700"
                />
                <span>Todas ({guidesList.length})</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="qrApplyScope"
                  checked={applyScope === 'SCANNED_ONLY'}
                  onChange={() => setApplyScope('SCANNED_ONLY')}
                  className="text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                />
                <span>Solo marcadas ({scannedCount})</span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleApplyMovement}
              disabled={
                submittingMovement ||
                guidesList.length === 0 ||
                (applyScope === 'SCANNED_ONLY' && scannedCount === 0)
              }
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed ${
                movementType === 'PROVEEDOR'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/25'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/25'
              }`}
            >
              {submittingMovement ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Aplicando movimiento...</span>
                </>
              ) : movementType === 'PROVEEDOR' ? (
                <>
                  <Truck className="w-4 h-4" />
                  <span>
                    Marcar {applyScope === 'SCANNED_ONLY' ? scannedCount : guidesList.length} como Devuelto a Proveedor
                  </span>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4" />
                  <span>
                    Reingresar {applyScope === 'SCANNED_ONLY' ? scannedCount : guidesList.length} a Bodega
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Panel Derecho: Visualizador de Códigos QR (Carrusel 1 a 1 o Cuadrícula) */}
        <div className="lg:col-span-8">
          {guidesList.length === 0 ? (
            <div className="p-10 sm:p-14 rounded-3xl border border-dashed border-white/10 bg-slate-950/40 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                <QrCode className="w-7 h-7" />
              </div>
              <h4 className="text-sm sm:text-base font-bold text-white">
                Ninguna guía cargada en el generador QR
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Pega tu listado de guías en el cuadro de la izquierda o usa el botón{' '}
                <strong className="text-slate-200">&ldquo;Traer de Tabla&rdquo;</strong> para generar instantáneamente los códigos QR y escanearlos con el celular.
              </p>
            </div>
          ) : viewMode === 'carousel' ? (
            /* MODO 1 A 1 (CARRUSEL ANTI-ERROR DE ESCANEO) */
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-950/70 border border-white/10 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 font-mono text-xs font-extrabold">
                    QR {currentIndex + 1} de {guidesList.length}
                  </span>
                  {scannedMap[currentGuia] ? (
                    <Badge variant="emerald" className="flex items-center gap-1 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      ESCANEADO
                    </Badge>
                  ) : (
                    <Badge variant="amber" className="text-xs">
                      PENDIENTE ESCANEAR
                    </Badge>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setKeyboardNavEnabled((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-medium flex items-center gap-1.5 border transition-colors ${
                    keyboardNavEnabled
                      ? 'bg-slate-800/80 border-white/10 text-slate-300'
                      : 'bg-slate-900 border-white/5 text-slate-500'
                  }`}
                  title="Usa las flechas del teclado o Barra Espaciadora para avanzar sin usar el mouse"
                >
                  <Keyboard className="w-3.5 h-3.5 text-blue-400" />
                  <span>Teclado: ← / → / Espacio</span>
                </button>
              </div>

              {/* Tarjeta Central del QR Actual */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-6 py-2">
                <div className="relative group">
                  <QrCodeImage value={currentGuia} size={240} />
                  {scannedMap[currentGuia] && (
                    <div className="absolute -top-2 -right-2 bg-emerald-500 text-slate-950 rounded-full p-1.5 shadow-lg">
                      <Check className="w-5 h-5 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-4 text-center md:text-left max-w-md">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Número de Guía Activa
                    </span>
                    <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
                      <span className="text-xl sm:text-2xl font-mono font-black text-white tracking-tight break-all">
                        {currentGuia}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyGuia(currentGuia)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition-colors shrink-0"
                        title="Copiar número de guía"
                      >
                        {copiedGuia === currentGuia ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Información enriquecida si la guía existe en GeoFull */}
                  {currentOrderInfo ? (
                    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-1.5 text-xs text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Estado en GeoFull:</span>
                        <Badge
                          variant={
                            currentOrderInfo.estado === 'ENTREGADO'
                              ? 'emerald'
                              : currentOrderInfo.estado === 'ASIGNADO'
                              ? 'amber'
                              : currentOrderInfo.estado === 'DEVUELTO_PROVEEDOR'
                              ? 'red'
                              : 'titanium'
                          }
                        >
                          {currentOrderInfo.estado}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Conductor:</span>
                        <span className="font-semibold text-slate-200 truncate">
                          {currentOrderInfo.domiciliario_nombre || 'SIN ASIGNAR'}
                        </span>
                      </div>
                      {currentOrderInfo.cliente && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400">Cliente:</span>
                          <span className="text-slate-300 truncate">{currentOrderInfo.cliente}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-slate-900/50 border border-white/5 text-xs text-slate-400">
                      Guía externa / manual lista para escanear con la app del celular.
                    </div>
                  )}

                  {/* Botones de Navegación del Carrusel */}
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handlePrev}
                      disabled={currentIndex === 0}
                      className="touch-target px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Anterior</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleMarkAndNext}
                      className="touch-target flex-1 sm:flex-initial px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {currentIndex < guidesList.length - 1
                          ? 'Escaneado y Siguiente'
                          : 'Marcar Escaneado'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={currentIndex >= guidesList.length - 1}
                      className="touch-target px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span>Siguiente</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tira rápida de navegación de guías del lote */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  Salto rápido entre guías ({guidesList.length}):
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar">
                  {guidesList.map((g, idx) => {
                    const isCurrent = idx === currentIndex;
                    const isDone = !!scannedMap[g];
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className={`px-2.5 py-1.5 rounded-xl font-mono text-xs flex items-center gap-1.5 shrink-0 border transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-blue-600 text-white border-blue-400 font-bold shadow-md'
                            : isDone
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white'
                        }`}
                      >
                        <span>#{idx + 1}</span>
                        <span className="truncate max-w-[120px]">{g}</span>
                        {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* MODO CUADRÍCULA COMPLETA (TODOS LOS QR A LA VEZ) */
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/70 border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    Mostrando {visibleGridGuides.length} de {guidesList.length} códigos QR
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Selector de tamaño de QR */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 px-2.5 py-1 rounded-xl border border-white/5">
                    <span>Tamaño:</span>
                    {[
                      { label: 'Compacto', val: 130 },
                      { label: 'Medio', val: 165 },
                      { label: 'Grande', val: 210 }
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setQrSizeGrid(opt.val)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors ${
                          qrSizeGrid === opt.val
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Ocultar/Mostrar ya escaneados */}
                  <button
                    type="button"
                    onClick={() => setHideScannedInGrid((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                      hideScannedInGrid
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {hideScannedInGrid ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Mostrar Escaneados ({scannedCount})</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ocultar Escaneados</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {visibleGridGuides.length === 0 ? (
                <div className="p-10 text-center text-xs text-emerald-400 font-semibold">
                  ¡Todos los códigos QR de la lista ya fueron marcados como escaneados!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[620px] overflow-y-auto pr-1 custom-scrollbar">
                  {visibleGridGuides.map(({ guia, idx }) => {
                    const isDone = !!scannedMap[guia];
                    const info = ordersByGuia.get(guia.toUpperCase());

                    return (
                      <div
                        key={guia}
                        className={`p-4 rounded-2xl border transition-all flex flex-col items-center text-center gap-3 ${
                          isDone
                            ? 'bg-emerald-950/20 border-emerald-500/40 opacity-75'
                            : 'bg-slate-900/80 border-white/10 hover:border-blue-500/40'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between text-xs">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-white/10 font-mono font-bold text-slate-300">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentIndex(idx);
                                setViewMode('carousel');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px]"
                              title="Abrir en grande (Modo 1 a 1)"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyGuia(guia)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px]"
                              title="Copiar guía"
                            >
                              {copiedGuia === guia ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div
                          onClick={() => {
                            toggleScanned(guia);
                            if (!isDone) playScannerSound?.('success');
                          }}
                          className="cursor-pointer transition-transform hover:scale-[1.02]"
                          title="Haz clic para marcar/desmarcar como escaneado"
                        >
                          <QrCodeImage value={guia} size={qrSizeGrid} />
                        </div>

                        <div className="w-full space-y-1">
                          <p className="font-mono font-extrabold text-sm text-white break-all select-all">
                            {guia}
                          </p>
                          {info && (
                            <p className="text-[11px] text-slate-400 truncate">
                              {info.domiciliario_nombre || 'Sin conductor'} •{' '}
                              <span className="text-blue-400 font-semibold">{info.estado}</span>
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            toggleScanned(guia);
                            if (!isDone) playScannerSound?.('success');
                          }}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                            isDone
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-800 hover:bg-slate-700 border-white/10 text-slate-200'
                          }`}
                        >
                          {isDone ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Escaneado</span>
                            </>
                          ) : (
                            <>
                              <Circle className="w-4 h-4 text-slate-400" />
                              <span>Marcar Escaneado</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

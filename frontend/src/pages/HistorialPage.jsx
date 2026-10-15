import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  Search,
  FileText,
  RotateCcw,
  CheckCircle2,
  Clock,
  Truck,
  Building2,
  AlertCircle,
  Copy,
  ChevronRight,
  User,
  MapPin,
  ExternalLink,
  Layers,
  Sparkles,
  ClipboardList,
  Filter,
  Phone,
  Mail,
  Navigation,
  Calendar,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  Info,
  Check,
  Compass,
  Database,
  Eye,
  CornerDownRight,
  Hash,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function HistorialPage() {
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState('single'); // 'single' o 'batch'
  const [orderList, setOrderList] = useState([]);
  const [selectedGuia, setSelectedGuia] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [extraDataSearch, setExtraDataSearch] = useState('');
  const [toast, setToast] = useState(null);

  // Estado de secciones colapsables (Línea de tiempo abierta de primera por defecto)
  const [openSections, setOpenSections] = useState({
    trazabilidad: true,
    destinatario: false,
    georreferenciacion: false,
    operacion: false,
    datos_extra: false,
  });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const areAllOpen = Object.values(openSections).every(Boolean);
  const toggleAllSections = () => {
    const nextState = !areAllOpen;
    setOpenSections({
      destinatario: nextState,
      georreferenciacion: nextState,
      operacion: nextState,
      datos_extra: nextState,
      trazabilidad: nextState,
    });
  };

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const lastQueriedRef = useRef('');

  const token = localStorage.getItem('v4_token') || localStorage.getItem('token');
  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';

  const authHeaders = useMemo(() => {
    return {
      Authorization: token ? `Bearer ${token}` : '',
      'x-tenant-id': tenantId
    };
  }, [token, tenantId]);

  // Función núcleo de consulta de una o varias guías
  const consultarGuias = async (textToQuery) => {
    const raw = (textToQuery !== undefined ? textToQuery : inputText) || '';
    if (!raw.trim()) {
      setToast({ type: 'warning', message: 'Ingresa al menos un número de guía para consultar.' });
      return;
    }

    // Extraer guías separadas por salto de línea, espacios, tabulación o coma
    const parsedGuias = raw
      .split(/[\r\n,;\t ]+/)
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    if (parsedGuias.length === 0) {
      setToast({ type: 'warning', message: 'No se encontraron números de guía válidos.' });
      return;
    }

    setLoadingBatch(true);
    try {
      const resp = await axios.post(
        `${API_BASE}/tracking/batch-summary`,
        { guias: parsedGuias },
        { headers: authHeaders }
      );

      const items = resp.data || [];
      setOrderList(items);

      if (items.length > 0) {
        // Seleccionar automáticamente la primera guía
        const primeraGuia = items[0].guia;
        setSelectedGuia(primeraGuia);
        cargarDetalleGuia(primeraGuia);
        setToast({ 
          type: 'success', 
          message: items.length === 1 
            ? `Guía ${primeraGuia} consultada exitosamente.` 
            : `${items.length} guías procesadas para rastreo.` 
        });
      } else {
        setToast({ type: 'warning', message: 'No se encontraron registros.' });
      }
    } catch (err) {
      console.error('Error al consultar guías:', err);
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Error al consultar las guías en el servidor.'
      });
    } finally {
      setLoadingBatch(false);
    }
  };

  // Cargar lote o guía individual desde formulario manual
  const handleConsultarGuias = (e) => {
    if (e) e.preventDefault();
    consultarGuias(inputText);
  };

  // Escuchar parámetros de URL o navegación provenientes del buscador global superior
  useEffect(() => {
    const qParam = searchParams.get('q') || searchParams.get('guia') || searchParams.get('guias');
    const stateText = location.state?.inputText;
    const targetText = stateText || qParam;

    if (targetText && typeof targetText === 'string' && targetText.trim()) {
      const cleanVal = targetText.trim();
      const queryKey = `${cleanVal}_${location.state?.timestamp || ''}`;
      if (lastQueriedRef.current === queryKey) return;
      lastQueriedRef.current = queryKey;

      setInputText(cleanVal);

      // Si vienen múltiples guías, cambiar a pestaña de lote
      const tokens = cleanVal.split(/[\r\n,;\t ]+/).filter(Boolean);
      if (tokens.length > 1) {
        setInputMode('batch');
      } else {
        setInputMode('single');
      }

      consultarGuias(cleanVal);
    }
  }, [searchParams, location.state]);

  // Cargar ficha y trazabilidad de una guía individual
  const cargarDetalleGuia = async (guia) => {
    if (!guia) return;
    setLoadingDetail(true);
    try {
      const resp = await axios.get(`${API_BASE}/tracking/${encodeURIComponent(guia)}`, {
        headers: authHeaders
      });
      setOrderDetail(resp.data);
    } catch (err) {
      console.error(`Error al cargar detalle de ${guia}:`, err);
      setOrderDetail(null);
      setToast({
        type: 'error',
        message: err.response?.data?.detail || `No se pudo obtener la información de ${guia}`
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Seleccionar guía del listado lateral
  const handleSelectGuia = (guia) => {
    if (guia === selectedGuia) return;
    setSelectedGuia(guia);
    cargarDetalleGuia(guia);
  };

  // Limpiar panel
  const handleLimpiarTodo = () => {
    setInputText('');
    setOrderList([]);
    setSelectedGuia(null);
    setOrderDetail(null);
    setFilterText('');
    setExtraDataSearch('');
  };

  // Copiar texto al portapapeles
  const handleCopiar = (txt, label = 'Texto') => {
    if (!txt) return;
    navigator.clipboard.writeText(String(txt));
    setToast({ type: 'success', message: `${label} copiado al portapapeles.` });
  };

  // Filtrar lista lateral
  const guiasFiltradas = useMemo(() => {
    if (!filterText.trim()) return orderList;
    const q = filterText.toLowerCase();
    return orderList.filter(
      (o) =>
        o.guia.toLowerCase().includes(q) ||
        (o.cliente && o.cliente.toLowerCase().includes(q)) ||
        (o.zona_nombre && o.zona_nombre.toLowerCase().includes(q))
    );
  }, [orderList, filterText]);

  // Filtrar datos_extra
  const datosExtraFiltrados = useMemo(() => {
    if (!orderDetail?.pedido?.datos_extra) return [];
    const entries = Object.entries(orderDetail.pedido.datos_extra);
    if (!extraDataSearch.trim()) return entries;
    const q = extraDataSearch.toLowerCase();
    return entries.filter(([k, v]) => 
      k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
    );
  }, [orderDetail, extraDataSearch]);

  // Formateador de fechas
  const formatDateTime = (isoStr) => {
    if (!isoStr) return '---';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return String(isoStr);
    }
  };

  // Badge según estado
  const renderEstadoBadge = (estado) => {
    switch (estado) {
      case 'ENTREGADO':
        return <Badge variant="emerald">Entregado</Badge>;
      case 'EN_RUTA':
      case 'ASIGNADO':
        return <Badge variant="titanium">En Ruta</Badge>;
      case 'EN_BODEGA':
      case 'EN_INVENTARIO':
        return <Badge variant="amber">En Bodega</Badge>;
      case 'SECTORIZADO':
        return <Badge variant="titanium">Sectorizado</Badge>;
      case 'REQUIERE_REVISIÓN':
        return <Badge variant="amber">Requiere Revisión</Badge>;
      case 'FUERA_DE_ZONA':
        return <Badge variant="red">Fuera de Zona</Badge>;
      case 'NO_REGISTRADO':
        return <Badge variant="slate">No Registrada</Badge>;
      default:
        return <Badge variant="red">{estado || 'Pendiente'}</Badge>;
    }
  };

  // Renderizar descripción con tags de corchetes estilo JMS destacados
  const renderDescripcionJMS = (texto) => {
    if (!texto) return '---';
    const parts = texto.split(/(【[^】]+】)/g);
    return (
      <span>
        {parts.map((p, idx) => {
          if (p.startsWith('【') && p.endsWith('】')) {
            const inner = p.slice(1, -1);
            return (
              <span
                key={idx}
                className="inline-block px-1.5 py-0.5 mx-1 rounded bg-blue-500/15 text-blue-300 font-semibold border border-blue-500/20 text-xs"
              >
                {inner}
              </span>
            );
          }
          return <span key={idx}>{p}</span>;
        })}
      </span>
    );
  };

  const pedido = orderDetail?.pedido;

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-400" />
            Historial, Rastreo & Datos de la Guía
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Consulta individual o pegado masivo de guías con ficha técnica detallada, atributos asociados y línea de tiempo JMS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {orderList.length > 0 && (
            <button
              onClick={handleLimpiarTodo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-white/5 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpiar Consulta
            </button>
          )}
          <Badge variant="titanium" className="py-1 px-3">
            {orderList.length} {orderList.length === 1 ? 'Guía Consultada' : 'Guías Consultadas'}
          </Badge>
        </div>
      </div>

      {/* Layout Principal: 2 Columnas (Panel Izquierdo Multiguía + Panel Derecho Detalle & Datos) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* PANEL IZQUIERDO: Consulta & Lista de Guías */}
        <div className="lg:col-span-4 space-y-4">
          {/* Tarjeta de Entrada */}
          <GlassCard className="p-4 space-y-3">
            {/* Selector de Modo: Guía Única vs Lote */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-blue-400" />
                Consultar Guías
              </span>

              <div className="flex items-center bg-slate-950/80 p-0.5 rounded-xl border border-white/10 text-[11px]">
                <button
                  type="button"
                  onClick={() => setInputMode('single')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    inputMode === 'single'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('batch')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    inputMode === 'batch'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Lote Masivo
                </button>
              </div>
            </div>

            {inputMode === 'single' ? (
              <form onSubmit={handleConsultarGuias} className="space-y-3">
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ingresa el número de guía (Ej: 6080126004088)..."
                    className="w-full bg-slate-950/70 border border-white/10 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 font-mono transition-all shadow-inner"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingBatch || !inputText.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg shadow-blue-500/20"
                >
                  {loadingBatch ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      Consultando...
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      Consultar Guía
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Pega múltiples códigos</span>
                  <span className="text-[10px] text-slate-500">Salto de línea, coma o espacio</span>
                </div>
                <textarea
                  rows={4}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Pega aquí múltiples guías...&#10;6080126004088&#10;6080926719711&#10;JTC000184620980"
                  className="w-full bg-slate-950/70 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 font-mono transition-all resize-none shadow-inner"
                />
                <button
                  type="button"
                  onClick={handleConsultarGuias}
                  disabled={loadingBatch || !inputText.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg shadow-blue-500/20"
                >
                  {loadingBatch ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      Consultando Lote...
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      Consultar Guías
                    </>
                  )}
                </button>
              </div>
            )}
          </GlassCard>

          {/* Tarjeta: Lista de Órdenes Consultadas */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Guías Consultadas ({guiasFiltradas.length})
              </span>
            </div>

            {/* Buscador en vivo de guías consultadas */}
            {orderList.length > 0 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filtrar por guía, cliente o zona..."
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            )}

            {/* Listado de Guías */}
            <div className="max-h-[460px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {loadingBatch ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Cargando guías en el servidor...
                </div>
              ) : orderList.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-500">
                    Ingresa o pega números de guía en el cuadro superior para visualizarlas aquí.
                  </p>
                </div>
              ) : guiasFiltradas.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Ninguna guía coincide con el filtro.
                </div>
              ) : (
                guiasFiltradas.map((item) => {
                  const isSelected = item.guia === selectedGuia;
                  return (
                    <button
                      key={item.guia}
                      onClick={() => handleSelectGuia(item.guia)}
                      className={`w-full text-left p-2.5 rounded-2xl transition-all border flex items-center justify-between group ${
                        isSelected
                          ? 'bg-blue-600/20 border-blue-500/50 shadow-md shadow-blue-500/10'
                          : 'bg-slate-900/40 hover:bg-slate-800/60 border-white/5'
                      }`}
                    >
                      <div className="space-y-1 overflow-hidden pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono text-xs font-bold tracking-tight truncate ${
                              isSelected ? 'text-blue-300' : 'text-slate-200 group-hover:text-white'
                            }`}
                          >
                            {item.guia}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate">
                          {item.zona_nombre ? (
                            <span className="text-blue-400/90 font-medium">{item.zona_nombre}</span>
                          ) : (
                            <span className="text-slate-500">Sin Zona</span>
                          )}
                          {item.cliente && <span className="truncate">• {item.cliente}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {renderEstadoBadge(item.estado)}
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform ${
                            isSelected ? 'text-blue-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                          }`}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </GlassCard>
        </div>

        {/* PANEL DERECHO: Detalle Ficha, Datos Asociados & Trazabilidad JMS */}
        <div className="lg:col-span-8 space-y-4">
          {loadingDetail ? (
            <GlassCard className="p-12 text-center space-y-4">
              <RotateCcw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">
                Cargando datos asociados y trazabilidad de {selectedGuia}...
              </p>
            </GlassCard>
          ) : !orderDetail || !pedido ? (
            <GlassCard className="p-16 text-center space-y-4">
              <Clock className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">Ninguna guía seleccionada</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Ingresa una guía en el panel izquierdo para consultar sus datos asociados, georreferenciación, atributos importados y la línea de tiempo completa.
              </p>
            </GlassCard>
          ) : (
            <>
              {/* Tarjeta Cabecera Hero (Apple GlassCard) */}
              <GlassCard className="p-5 space-y-4 border-l-4 border-l-blue-500">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-mono font-black text-white tracking-wide">
                          {pedido.guia}
                        </span>
                        <button
                          onClick={() => handleCopiar(pedido.guia, 'Número de Guía')}
                          title="Copiar guía"
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {renderEstadoBadge(pedido.estado)}
                        {pedido.proveedor_entrega && (
                          <Badge variant="titanium" className="text-[10px]">
                            {pedido.proveedor_entrega}
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 mt-1 font-medium">
                        {pedido.cliente || 'Destinatario no registrado'}
                        {pedido.telefono_cliente && (
                          <span className="text-slate-400"> • Tel: {pedido.telefono_cliente}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Acciones Rápidas */}
                  <div className="flex flex-wrap items-center gap-2 sm:self-center">
                    {pedido.latitud && pedido.longitud && (
                      <a
                        href={`https://www.google.com/maps?q=${pedido.latitud},${pedido.longitud}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition-all hover:scale-105"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        Ver en Mapa
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    )}
                    <button
                      onClick={() => handleCopiar(pedido.direccion_limpia || pedido.direccion_original, 'Dirección')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 transition-all"
                    >
                      <Copy className="w-3 h-3" />
                      Copiar Dir
                    </button>
                  </div>
                </div>

                {/* Métricas / Badges Clave */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-950/40 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Zona Asignada
                    </span>
                    <span className="text-white font-semibold flex items-center gap-1 mt-1 truncate">
                      <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      {pedido.zona_nombre || 'Sin Sectorizar'}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Conductor
                    </span>
                    <span className="text-white font-semibold flex items-center gap-1 mt-1 truncate">
                      <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {pedido.domiciliario_nombre || 'Sin Asignar'}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Precisión Geo
                    </span>
                    <span className="text-white font-semibold flex items-center gap-1 mt-1 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      {pedido.confianza_score ? `${pedido.confianza_score}%` : '---'}
                      {pedido.precision_metros && ` (${pedido.precision_metros}m)`}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Eventos Registrados
                    </span>
                    <span className="text-white font-semibold flex items-center gap-1 mt-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      {orderDetail.historial.length} eventos
                    </span>
                  </div>
                </div>
              </GlassCard>

              {/* Barra de Control de Acordeones / Menús Plegables */}
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Vista Completa • Toca cada menú para desplegar
                </span>
                <button
                  type="button"
                  onClick={toggleAllSections}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/5 transition-all cursor-pointer active:scale-95 shadow-sm"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5 text-blue-400" />
                  {areAllOpen ? 'Colapsar Todo' : 'Desplegar Todo'}
                </button>
              </div>

              {/* Lista Unificada de Menús Colapsables */}
              <div className="space-y-3">
                {/* 1. Línea de Tiempo del Historial de Seguimiento (Estilo JMS) - Siempre arriba y desplegado por defecto */}
                <GlassCard className="p-0 overflow-hidden border border-white/10 transition-all">
                  <button
                    type="button"
                    onClick={() => toggleSection('trazabilidad')}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 group-hover:text-white transition-colors block">
                          Línea de Tiempo del Historial de Seguimiento (JMS)
                        </span>
                        {!openSections.trazabilidad && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {orderDetail.historial.length} eventos registrados cronológicamente
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="titanium" className="text-[10px]">
                        {orderDetail.historial.length} Eventos
                      </Badge>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-300 ${
                          openSections.trazabilidad ? 'rotate-180 text-blue-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {openSections.trazabilidad && (
                    <div className="border-t border-white/5 bg-slate-950/20">
                      <div className="overflow-x-auto rt-wrap">
                        <table className="w-full text-left text-xs border-collapse rt">
                          <thead>
                            <tr className="border-b border-white/10 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4 w-12 text-center">N.°</th>
                              <th className="py-3 px-4 w-44">Fecha y Hora</th>
                              <th className="py-3 px-4 w-36">Tipo de Escaneo</th>
                              <th className="py-3 px-4 w-44">Operador / Usuario</th>
                              <th className="py-3 px-4 min-w-[320px]">Descripción del Historial de Seguimiento</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {orderDetail.historial.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-500">
                                  No hay eventos registrados para esta guía.
                                </td>
                              </tr>
                            ) : (
                              orderDetail.historial.map((ev, index) => {
                                const num = index + 1;
                                const isLast = index === orderDetail.historial.length - 1;
                                return (
                                  <tr
                                    key={ev.id || index}
                                    className={`transition-colors hover:bg-slate-800/40 ${
                                      isLast ? 'bg-blue-500/5' : ''
                                    }`}
                                  >
                                    {/* N.° */}
                                    <td data-label="N.°" className="py-3 px-4 text-center font-mono font-bold text-slate-400 text-xs">
                                      {num}
                                    </td>

                                    {/* Hora de Escaneo */}
                                    <td data-label="Fecha y Hora" className="py-3 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                                      {formatDateTime(ev.fecha)}
                                    </td>

                                    {/* Tipo de Escaneo */}
                                    <td data-label="Tipo" className="py-3 px-4 whitespace-nowrap">
                                      <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                                        {ev.tipo_evento === 'ENTREGADO' && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        )}
                                        {ev.tipo_evento === 'EN_RUTA' && (
                                          <Truck className="w-3.5 h-3.5 text-blue-400" />
                                        )}
                                        {ev.tipo_evento === 'INGRESO_BODEGA' && (
                                          <Building2 className="w-3.5 h-3.5 text-amber-400" />
                                        )}
                                        {ev.tipo_evento === 'REUBICACION_BODEGA' && (
                                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                                        )}
                                        {ev.tipo_evento === 'SECTORIZACION_ESCANEO' && (
                                          <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                        )}
                                        {ev.tipo_evento === 'REASIGNACION_ZONA' && (
                                          <Layers className="w-3.5 h-3.5 text-purple-400" />
                                        )}
                                        {ev.tipo_evento === 'IMPORTACION' && (
                                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                                        )}
                                        <span className="text-[11px]">
                                          {ev.tipo_evento === 'SECTORIZACION_ESCANEO' ? 'SECTORIZADO (ESCÁNER)' : ev.tipo_evento}
                                        </span>
                                      </span>
                                    </td>

                                    {/* Operador de Escáner / Usuario */}
                                    <td data-label="Operador" className="py-3 px-4 text-[11px] text-slate-300 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-white/5 font-medium text-slate-200">
                                        {ev.usuario_nombre || 'Sistema'}
                                      </span>
                                    </td>

                                    {/* Descripción Enriquecida Estilo JMS */}
                                    <td data-label="Descripción" className="py-3 px-4 text-[12px] text-slate-300 leading-relaxed">
                                      {renderDescripcionJMS(ev.descripcion)}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </GlassCard>

                {/* 2. Destinatario & Contacto */}
                <GlassCard className="p-0 overflow-hidden border border-white/10 transition-all">
                  <button
                    type="button"
                    onClick={() => toggleSection('destinatario')}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 group-hover:text-white transition-colors block">
                          Destinatario & Contacto
                        </span>
                        {!openSections.destinatario && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {pedido.cliente || 'Destinatario no especificado'}
                            {pedido.telefono_cliente && ` • Tel: ${pedido.telefono_cliente}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-300 ${
                          openSections.destinatario ? 'rotate-180 text-blue-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {openSections.destinatario && (
                    <div className="border-t border-white/5 p-4 bg-slate-950/20 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Nombre del Destinatario
                          </span>
                          <p className="text-slate-100 font-semibold text-sm">
                            {pedido.cliente || 'No especificado'}
                          </p>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Teléfono de Contacto
                          </span>
                          <div className="flex items-center justify-between">
                            <p className="text-slate-100 font-mono font-semibold">
                              {pedido.telefono_cliente || 'No registrado'}
                            </p>
                            {pedido.telefono_cliente && (
                              <button
                                onClick={() => handleCopiar(pedido.telefono_cliente, 'Teléfono')}
                                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Copiar teléfono"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="md:col-span-2 bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Observaciones / Complemento de Entrega
                          </span>
                          <p className="text-slate-200">
                            {pedido.observaciones_entrega || pedido.complemento || 'Sin observaciones registradas'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </GlassCard>

                {/* 3. Georreferenciación & Normalización Catastral */}
                <GlassCard className="p-0 overflow-hidden border border-white/10 transition-all">
                  <button
                    type="button"
                    onClick={() => toggleSection('georreferenciacion')}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                        <Compass className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 group-hover:text-white transition-colors block">
                          Georreferenciación & Normalización de Dirección
                        </span>
                        {!openSections.georreferenciacion && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {pedido.zona_nombre || 'Sin Zona'} • {pedido.direccion_limpia || pedido.direccion_original}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-300 ${
                          openSections.georreferenciacion ? 'rotate-180 text-emerald-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {openSections.georreferenciacion && (
                    <div className="border-t border-white/5 p-4 bg-slate-950/20 space-y-3">
                      {pedido.alerta_rango_logico && (
                        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-300 block">Alerta de Rango Lógico Detectada</span>
                            <p className="text-amber-200/80 mt-0.5">
                              {pedido.detalle_alerta_rango || 'La numeración de placa excede los rangos catastrales normales de la vía.'}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Dirección Original (Declarada)
                          </span>
                          <p className="text-slate-300 font-mono break-words">
                            {pedido.direccion_original}
                          </p>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Dirección Limpia (Normalizada GeoFull)
                          </span>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-emerald-300 font-mono font-bold break-words">
                              {pedido.direccion_limpia || '---'}
                            </p>
                            {pedido.direccion_limpia && (
                              <button
                                onClick={() => handleCopiar(pedido.direccion_limpia, 'Dirección Limpia')}
                                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
                                title="Copiar dirección limpia"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Coordenadas Geográficas
                          </span>
                          <div className="flex items-center justify-between">
                            <p className="text-slate-200 font-mono text-[11px]">
                              {pedido.latitud && pedido.longitud
                                ? `${pedido.latitud}, ${pedido.longitud}`
                                : 'No georreferenciado'}
                            </p>
                            {pedido.latitud && pedido.longitud && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleCopiar(`${pedido.latitud}, ${pedido.longitud}`, 'Coordenadas')}
                                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                                  title="Copiar coordenadas"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Calidad de Geocodificación
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant="titanium" className="text-[10px]">
                              {pedido.nivel_precision || 'Desconocido'}
                            </Badge>
                            {pedido.precision_metros && (
                              <span className="text-slate-300 font-mono text-[11px]">
                                Margen: {pedido.precision_metros}m
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Clave Catastral / Normalización
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-200 font-bold">
                              {pedido.clave_direccion || '---'}
                            </span>
                            {pedido.estado_normalizacion && (
                              <Badge 
                                variant={pedido.estado_normalizacion === 'OK' ? 'emerald' : 'amber'} 
                                className="text-[10px]"
                              >
                                Estado: {pedido.estado_normalizacion}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Zona de Reparto Asignada
                          </span>
                          <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{pedido.zona_nombre || 'Sin Zona (Fuera de cobertura)'}</span>
                          </div>
                        </div>

                        {pedido.advertencias_normalizacion?.length > 0 && (
                          <div className="md:col-span-2 bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              Ajustes del Motor de Normalización
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {pedido.advertencias_normalizacion.map((adv, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]"
                                >
                                  {adv}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </GlassCard>

                {/* 4. Operación Logística & Liquidación */}
                <GlassCard className="p-0 overflow-hidden border border-white/10 transition-all">
                  <button
                    type="button"
                    onClick={() => toggleSection('operacion')}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 group-hover:text-white transition-colors block">
                          Operación Logística & Liquidación
                        </span>
                        {!openSections.operacion && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {pedido.proveedor_entrega || 'Courier'} • {pedido.domiciliario_nombre || 'Sin Conductor'} • {pedido.pagado_conductor ? 'Liquidado' : 'Pendiente liquidar'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-300 ${
                          openSections.operacion ? 'rotate-180 text-amber-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {openSections.operacion && (
                    <div className="border-t border-white/5 p-4 bg-slate-950/20 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Proveedor Logístico
                          </span>
                          <p className="text-slate-100 font-semibold">
                            {pedido.proveedor_entrega || 'iMile'}
                          </p>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Liquidación Conductor
                          </span>
                          <div>
                            {pedido.pagado_conductor ? (
                              <Badge variant="emerald" className="text-[10px]">Liquidado / Pagado</Badge>
                            ) : (
                              <Badge variant="amber" className="text-[10px]">Pendiente de Liquidar</Badge>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Fecha de Importación
                          </span>
                          <p className="text-slate-300 font-mono text-[11px]">
                            {formatDateTime(pedido.fecha_importacion)}
                          </p>
                        </div>

                        <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Fecha de Entrega
                          </span>
                          <p className="text-slate-300 font-mono text-[11px]">
                            {formatDateTime(pedido.fecha_entrega)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </GlassCard>

                {/* 5. Datos Adicionales del Archivo de Importación (datos_extra) */}
                <GlassCard className="p-0 overflow-hidden border border-white/10 transition-all">
                  <button
                    type="button"
                    onClick={() => toggleSection('datos_extra')}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                        <Database className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 group-hover:text-white transition-colors block">
                          Datos Adicionales del Archivo Fuente
                        </span>
                        {!openSections.datos_extra && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {Object.keys(pedido.datos_extra || {}).length} atributos importados
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="slate" className="text-[10px]">
                        {Object.keys(pedido.datos_extra || {}).length} Atributos
                      </Badge>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-300 ${
                          openSections.datos_extra ? 'rotate-180 text-purple-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {openSections.datos_extra && (
                    <div className="border-t border-white/5 p-4 bg-slate-950/20 space-y-3">
                      {Object.keys(pedido.datos_extra || {}).length > 6 && (
                        <div className="relative">
                          <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={extraDataSearch}
                            onChange={(e) => setExtraDataSearch(e.target.value)}
                            placeholder="Buscar en datos..."
                            className="bg-slate-950/60 border border-white/10 rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 w-full sm:w-60"
                          />
                        </div>
                      )}

                      {!pedido.datos_extra || Object.keys(pedido.datos_extra).length === 0 ? (
                        <p className="text-xs text-slate-500 py-4 text-center">
                          No se registraron atributos adicionales en el archivo Excel/CSV original de esta guía.
                        </p>
                      ) : datosExtraFiltrados.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3 text-center">
                          No hay campos que coincidan con la búsqueda "{extraDataSearch}".
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                          {datosExtraFiltrados.map(([clave, valor]) => {
                            const valStr = valor !== null && valor !== undefined ? String(valor) : '---';
                            return (
                              <div
                                key={clave}
                                className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 space-y-1 hover:border-blue-500/30 transition-colors group relative"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate pr-1">
                                    {clave}
                                  </span>
                                  <button
                                    onClick={() => handleCopiar(valStr, clave)}
                                    className="text-slate-500 group-hover:text-slate-300 transition-colors p-0.5 rounded cursor-pointer"
                                    title={`Copiar ${clave}`}
                                  >
                                    <Copy className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                                <p
                                  className="text-xs text-slate-200 font-mono font-medium truncate"
                                  title={valStr}
                                >
                                  {valStr}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              </div>
            </>
          )}
        </div>
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

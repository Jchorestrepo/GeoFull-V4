import React, { useState, useEffect, useMemo } from 'react';
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
  Filter
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function HistorialPage() {
  const [inputText, setInputText] = useState('');
  const [orderList, setOrderList] = useState([]);
  const [selectedGuia, setSelectedGuia] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [toast, setToast] = useState(null);

  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';

  const authHeaders = useMemo(() => {
    return {
      Authorization: token ? `Bearer ${token}` : '',
      'x-tenant-id': tenantId
    };
  }, [token, tenantId]);

  // Cargar lote de guías pegadas
  const handleConsultarGuias = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) {
      setToast({ type: 'warning', message: 'Pega al menos un número de guía para consultar.' });
      return;
    }

    // Extraer guías separadas por salto de línea, espacios, tabulación o coma
    const parsedGuias = inputText
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
        setToast({ type: 'success', message: `${items.length} guías procesadas para rastreo.` });
      } else {
        setToast({ type: 'warning', message: 'No se encontraron registros.' });
      }
    } catch (err) {
      console.error('Error al consultar lote de guías:', err);
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Error al consultar las guías en el servidor.'
      });
    } finally {
      setLoadingBatch(false);
    }
  };

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
  };

  // Copiar guía al portapapeles
  const handleCopiar = (txt) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    setToast({ type: 'success', message: `Guía ${txt} copiada al portapapeles.` });
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
      return isoStr;
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
      case 'NO_REGISTRADO':
        return <Badge variant="slate">No Registrada</Badge>;
      default:
        return <Badge variant="red">{estado || 'Pendiente'}</Badge>;
    }
  };

  // Renderizar descripción con tags de corchetes estilo JMS destacados
  const renderDescripcionJMS = (texto) => {
    if (!texto) return '---';
    // Dividir por corchetes 【...】 para aplicar color titanio y negrilla
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

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-400" />
            Historial & Rastreo Unificado
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Consulta individual o pegado masivo de guías con línea de tiempo y trazabilidad completa de eventos (Estilo JMS).
          </p>
        </div>

        <div className="flex items-center gap-3">
          {orderList.length > 0 && (
            <button
              onClick={handleLimpiarTodo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-white/5"
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

      {/* Layout Principal: 2 Columnas (Panel Izquierdo Multiguía + Panel Derecho Detalle JMS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* PANEL IZQUIERDO: Pegado múltiple + Lista de Órdenes */}
        <div className="lg:col-span-4 space-y-4">
          {/* Tarjeta de Entrada de Guías */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                Pegar Guías (Multiconsulta)
              </span>
              <span className="text-[10px] text-slate-500">Salto de línea, coma o espacio</span>
            </div>

            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pega aquí múltiples guías...&#10;JTC000173183155&#10;JTC000181825320&#10;JTC000184620980"
              className="w-full bg-slate-950/70 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 font-mono transition-all resize-none shadow-inner"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleConsultarGuias}
                disabled={loadingBatch || !inputText.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg shadow-blue-500/20"
              >
                {loadingBatch ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    Consultar Guías
                  </>
                )}
              </button>
            </div>
          </GlassCard>

          {/* Tarjeta: Lista de Órdenes (Estilo Menú Lateral JMS) */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Lista de Órdenes ({guiasFiltradas.length})
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
                  placeholder="Filtrar por guía o zona..."
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            )}

            {/* Listado de Guías */}
            <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {loadingBatch ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Cargando guías en el servidor...
                </div>
              ) : orderList.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-500">Pega las guías en el cuadro superior para visualizarlas aquí.</p>
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
                          {item.cliente && <span>• {item.cliente}</span>}
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

        {/* PANEL DERECHO: Detalle Ficha + Tabla Cronológica JMS */}
        <div className="lg:col-span-8 space-y-4">
          {loadingDetail ? (
            <GlassCard className="p-12 text-center space-y-4">
              <RotateCcw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Consultando historial y trazabilidad de {selectedGuia}...</p>
            </GlassCard>
          ) : !orderDetail ? (
            <GlassCard className="p-16 text-center space-y-4">
              <Clock className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">Ninguna guía seleccionada</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Ingresa una o varias guías en el panel izquierdo y selecciona una orden para desplegar su línea de tiempo cronológica completa.
              </p>
            </GlassCard>
          ) : (
            <>
              {/* Tarjeta Ficha Técnica Resumen */}
              <GlassCard className="p-5 space-y-4 border-l-4 border-l-blue-500">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-mono font-black text-white tracking-wide">
                          {orderDetail.pedido.guia}
                        </span>
                        <button
                          onClick={() => handleCopiar(orderDetail.pedido.guia)}
                          title="Copiar guía"
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {renderEstadoBadge(orderDetail.pedido.estado)}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {orderDetail.pedido.cliente || 'Destinatario no especificado'} 
                        {orderDetail.pedido.telefono_cliente && ` • Tel: ${orderDetail.pedido.telefono_cliente}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right sm:self-center">
                    <span className="text-[11px] text-slate-500 block">Total Eventos Registrados</span>
                    <span className="text-lg font-extrabold text-blue-400">
                      {orderDetail.historial.length}
                    </span>
                  </div>
                </div>

                {/* Subdatos clave en Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Zona Asignada
                    </span>
                    <span className="text-white font-semibold flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      {orderDetail.pedido.zona_nombre || 'Sin Sectorizar'}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Mensajero / Conductor
                    </span>
                    <span className="text-white font-semibold flex items-center gap-1.5 mt-1">
                      <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {orderDetail.pedido.domiciliario_nombre || 'Sin Conductor Asignado'}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Dirección Registrada
                    </span>
                    <span className="text-slate-300 font-medium truncate block mt-1" title={orderDetail.pedido.direccion_original}>
                      {orderDetail.pedido.direccion_original}
                    </span>
                  </div>
                </div>
              </GlassCard>

              {/* TABLA CRONOLÓGICA JMS (Idéntica a la referencia de J&T) */}
              <GlassCard className="p-0 overflow-hidden border border-white/10">
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    Línea de Tiempo del Historial de Seguimiento
                  </h3>
                  <Badge variant="titanium" className="text-[10px]">
                    Orden Cronológico
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
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
                              <td className="py-3 px-4 text-center font-mono font-bold text-slate-400 text-xs">
                                {num}
                              </td>

                              {/* Hora de Escaneo */}
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                                {formatDateTime(ev.fecha)}
                              </td>

                              {/* Tipo de Escaneo */}
                              <td className="py-3 px-4 whitespace-nowrap">
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
                              <td className="py-3 px-4 text-[11px] text-slate-300 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-white/5 font-medium text-slate-200">
                                  {ev.usuario_nombre || 'Sistema'}
                                </span>
                              </td>

                              {/* Descripción Enriquecida Estilo JMS */}
                              <td className="py-3 px-4 text-[12px] text-slate-300 leading-relaxed">
                                {renderDescripcionJMS(ev.descripcion)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
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

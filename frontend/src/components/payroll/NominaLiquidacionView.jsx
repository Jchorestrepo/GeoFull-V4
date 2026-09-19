import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Toast } from '../ui/Toast';
import {
  DollarSign,
  Calendar,
  Upload,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileSpreadsheet,
  Clock,
  Filter,
  CreditCard,
  X,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import axios from 'axios';

export function NominaLiquidacionView() {
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getFirstOfMonthStr = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };

  const [fechaInicio, setFechaInicio] = useState(getFirstOfMonthStr());
  const [fechaFin, setFechaFin] = useState(getTodayStr());

  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal para Marcar Pagado
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTargetDriver, setPayTargetDriver] = useState(null); // null = masivo, driver_id = individual
  const [metodoPago, setMetodoPago] = useState('TRANSFERENCIA');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [paying, setPaying] = useState(false);

  // Modal Novedades (Vales/Bonos/Penalidades)
  const [showNovedadModal, setShowNovedadModal] = useState(false);
  const [driversList, setDriversList] = useState([]);
  const [novedadForm, setNovedadForm] = useState({
    domiciliario_id: '',
    tipo_novedad: 'VALE',
    monto: '',
    motivo: '',
    fecha_novedad: getTodayStr()
  });
  const [creatingNov, setCreatingNov] = useState(false);

  // Modal Archivo 2 (Conciliación Dual)
  const [showFile2Modal, setShowFile2Modal] = useState(false);
  const [file2Data, setFile2Data] = useState('');
  const [file2Results, setFile2Results] = useState(null);
  const [reconcilingFile2, setReconcilingFile2] = useState(false);

  const [toast, setToast] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/reconciliation/payroll/summary', {
        params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin }
      });
      setSummaryData(res.data);
      setSelectedIds([]);
    } catch (err) {
      console.error("Error al cargar resumen de nómina", err);
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  const fetchDriversList = async () => {
    try {
      const res = await axios.get('/api/v1/reconciliation/drivers');
      setDriversList(res.data);
      if (res.data.length > 0 && !novedadForm.domiciliario_id) {
        setNovedadForm(prev => ({ ...prev, domiciliario_id: res.data[0].id }));
      }
    } catch (err) {
      console.error("Error al obtener domiciliarios", err);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Manejador Selección Múltiple
  const handleSelectAll = (e) => {
    if (e.target.checked && summaryData?.items) {
      setSelectedIds(summaryData.items.map(item => item.domiciliario_id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Crear Novedad
  const handleCreateNovedad = async (e) => {
    e.preventDefault();
    if (!novedadForm.domiciliario_id || !novedadForm.monto || parseFloat(novedadForm.monto) <= 0) {
      alert("Selecciona un trabajador y un monto válido mayor a 0");
      return;
    }

    setCreatingNov(true);
    try {
      await axios.post('/api/v1/reconciliation/payroll/novedades', {
        domiciliario_id: novedadForm.domiciliario_id,
        tipo_novedad: novedadForm.tipo_novedad,
        monto: parseFloat(novedadForm.monto),
        motivo: novedadForm.motivo,
        fecha_novedad: novedadForm.fecha_novedad
      });

      setToast({
        type: 'success',
        title: 'Novedad Registrada',
        message: `Se guardó el registro de ${novedadForm.tipo_novedad} por $${Number(novedadForm.monto).toLocaleString('es-CO')}`
      });

      setShowNovedadModal(false);
      setNovedadForm({
        domiciliario_id: driversList[0]?.id || '',
        tipo_novedad: 'VALE',
        monto: '',
        motivo: '',
        fecha_novedad: getTodayStr()
      });
      fetchSummary();
    } catch (err) {
      console.error("Error al crear novedad", err);
      setToast({
        type: 'error',
        title: 'Error de Registro',
        message: err.response?.data?.detail || 'No se pudo guardar la novedad'
      });
    } finally {
      setCreatingNov(false);
    }
  };

  // Procesar Archivo 2 (Cruzar con cliente)
  const handleProcessFile2 = async () => {
    if (!file2Data.trim()) {
      alert("Pega el contenido o columnas del Archivo 2");
      return;
    }

    setReconcilingFile2(true);
    try {
      // Parse simple CSV/TSV lines: Cédula/Nombre, Paquetes
      const lines = file2Data.trim().split('\n');
      const items = [];

      lines.forEach(l => {
        const parts = l.split(/[\t,;]/);
        if (parts.length >= 1) {
          const ident = parts[0].trim();
          const pkgs = parts[1] ? parseFloat(parts[1].trim()) || 1.0 : 1.0;
          if (ident && ident.toLowerCase() !== 'cedula' && ident.toLowerCase() !== 'nombre') {
            items.push({
              domiciliario_identificador: ident,
              paquetes_o_monto: pkgs
            });
          }
        }
      });

      if (items.length === 0) {
        alert("No se detectaron filas válidas en el texto pegado.");
        setReconcilingFile2(false);
        return;
      }

      const res = await axios.post('/api/v1/reconciliation/payroll/reconcile-file-2', {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        items: items
      });

      setFile2Results(res.data);
      setToast({
        type: 'success',
        title: 'Conciliación Archivo 2 Completada',
        message: `Se auditaron ${res.data.total_trabajadores} trabajadores. Discrepancias: ${res.data.discrepancias_encontradas}`
      });
    } catch (err) {
      console.error("Error procesando Archivo 2", err);
      setToast({
        type: 'error',
        title: 'Error de Auditoría',
        message: err.response?.data?.detail || 'No se pudo procesar el Archivo 2'
      });
    } finally {
      setReconcilingFile2(false);
    }
  };

  // Marcar Pagado (Individual o Masivo)
  const handleExecutePayment = async () => {
    const targetIds = payTargetDriver ? [payTargetDriver] : selectedIds;
    if (targetIds.length === 0) {
      alert("Selecciona al menos un trabajador para marcar como pagado");
      return;
    }

    setPaying(true);
    try {
      const res = await axios.post('/api/v1/reconciliation/payroll/pay', {
        domiciliario_ids: targetIds,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        metodo_pago: metodoPago,
        referencia_pago: referenciaPago
      });

      setToast({
        type: 'success',
        title: 'Nómina Pagada',
        message: res.data.message
      });

      setShowPayModal(false);
      setPayTargetDriver(null);
      setMetodoPago('TRANSFERENCIA');
      setReferenciaPago('');
      fetchSummary();
    } catch (err) {
      console.error("Error al marcar pago", err);
      setToast({
        type: 'error',
        title: 'Error al Registrar Pago',
        message: err.response?.data?.detail || 'No se pudo completar la operación'
      });
    } finally {
      setPaying(false);
    }
  };

  const items = summaryData?.items || [];
  const file2Map = {};
  if (file2Results?.resultado_conciliacion) {
    file2Results.resultado_conciliacion.forEach(r => {
      file2Map[r.domiciliario_id] = r;
    });
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header & Date Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Control de Nómina, Vales & Liquidaciones
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cálculo dinámico por Entregas (Archivo 1), Salario Fijo, Bonos (+), Penalidades (-), Vales (-) y Auditoría de Archivo 2 (Opcional).
          </p>
        </div>

        {/* Date Selector bar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-2 rounded-2xl border border-white/10 backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold px-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Período:</span>
          </div>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono outline-none focus:border-blue-500"
          />
          <span className="text-slate-500 text-xs font-bold">a</span>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono outline-none focus:border-blue-500"
          />
          <button
            onClick={fetchSummary}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Trabajadores</p>
          <div className="text-2xl font-black text-white mt-1">
            {summaryData?.total_trabajadores || 0}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Activos en el período</p>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-purple-500">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Nómina Bruta / Neto</p>
          <div className="text-2xl font-black text-purple-400 font-mono mt-1">
            ${Number(summaryData?.total_neto_nomina || 0).toLocaleString('es-CO')}
          </div>
          <p className="text-[10px] text-purple-300/70 mt-1">Valor consolidado</p>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Pagado</p>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
            ${Number(summaryData?.total_pagado || 0).toLocaleString('es-CO')}
          </div>
          <p className="text-[10px] text-emerald-300/70 mt-1">Nóminas cerradas</p>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-amber-500">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pendiente por Pagar</p>
          <div className="text-2xl font-black text-amber-400 font-mono mt-1">
            ${Number(summaryData?.total_pendiente || 0).toLocaleString('es-CO')}
          </div>
          <p className="text-[10px] text-amber-300/70 mt-1">Nóminas abiertas</p>
        </GlassCard>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchDriversList();
              setShowNovedadModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Registrar Novedad (Vale, Bono, Penalidad)</span>
          </button>

          <button
            onClick={() => setShowFile2Modal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-900/50 hover:bg-purple-800/60 text-purple-200 text-xs font-semibold border border-purple-500/30 transition-all"
          >
            <Upload className="w-4 h-4 text-purple-400" />
            <span>Subir Archivo 2 (Segunda Validación Opcional)</span>
          </button>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 bg-blue-950/80 px-4 py-2 rounded-xl border border-blue-500/40 animate-fadeIn">
            <span className="text-xs text-blue-300 font-bold">
              {selectedIds.length} seleccionados
            </span>
            <button
              onClick={() => {
                setPayTargetDriver(null);
                setShowPayModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Marcar Seleccionados como PAGADOS</span>
            </button>
          </div>
        )}
      </div>

      {/* Payroll Table */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/60">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={items.length > 0 && selectedIds.length === items.length}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-3">Trabajador & Cédula</th>
                <th className="p-3">Esquema & Periodicidad</th>
                <th className="p-3 text-center">Entregas (Archivo 1)</th>
                {file2Results && <th className="p-3 text-center">Archivo 2 (Cliente)</th>}
                <th className="p-3 text-right">Subtotal Paq / Fijo</th>
                <th className="p-3 text-right text-emerald-400">(+) Bonos</th>
                <th className="p-3 text-right text-crimson-400">(-) Penalidades</th>
                <th className="p-3 text-right text-amber-400">(-) Vales</th>
                <th className="p-3 text-right font-black">Neto a Pagar</th>
                <th className="p-3 text-center">Estado Pago</th>
                <th className="p-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-medium">
              {loading ? (
                <tr>
                  <td colSpan={file2Results ? 12 : 11} className="p-8 text-center text-slate-500">
                    Cargando resumen de nómina...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={file2Results ? 12 : 11} className="p-8 text-center text-slate-500">
                    No hay datos de entregas o trabajadores para el período seleccionado ({fechaInicio} a {fechaFin}).
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const isSelected = selectedIds.includes(row.domiciliario_id);
                  const audit = file2Map[row.domiciliario_id];

                  return (
                    <tr
                      key={row.domiciliario_id}
                      className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-blue-950/30' : ''}`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(row.domiciliario_id)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{row.nombre_completo}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          CC: {row.cedula} {row.banco ? `| ${row.banco} (${row.cuenta || 'Sin cuenta'})` : ''}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Badge variant={row.tipo_remuneracion === 'SALARIO_FIJO' ? 'purple' : row.tipo_remuneracion === 'MIXTO' ? 'blue' : 'amber'}>
                            {row.tipo_remuneracion}
                          </Badge>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {row.periodicidad_pago}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 text-center font-mono font-bold text-emerald-400">
                        {row.total_entregados} paq.
                      </td>

                      {file2Results && (
                        <td className="p-3 text-center font-mono">
                          {audit ? (
                            audit.estado_cruce === 'COINCIDE' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                                {audit.entregas_archivo_2} paq. (OK)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold text-[10px]" title={`Diferencia: ${audit.diferencia}`}>
                                {audit.entregas_archivo_2} paq. (Diff)
                              </span>
                            )
                          ) : (
                            <span className="text-slate-500 text-[10px]">No reportado</span>
                          )}
                        </td>
                      )}

                      <td className="p-3 text-right font-mono text-slate-300">
                        ${Number(row.monto_paquetes + row.salario_fijo_aplicado).toLocaleString('es-CO')}
                      </td>

                      <td className="p-3 text-right font-mono text-emerald-400">
                        {row.bonos > 0 ? `+$${Number(row.bonos).toLocaleString('es-CO')}` : '-'}
                      </td>

                      <td className="p-3 text-right font-mono text-red-400">
                        {row.penalidades > 0 ? `-$${Number(row.penalidades).toLocaleString('es-CO')}` : '-'}
                      </td>

                      <td className="p-3 text-right font-mono text-amber-400">
                        {row.vales_descontados > 0 ? `-$${Number(row.vales_descontados).toLocaleString('es-CO')}` : '-'}
                      </td>

                      <td className="p-3 text-right font-mono font-black text-purple-300 text-sm">
                        ${Number(row.monto_neto).toLocaleString('es-CO')}
                      </td>

                      <td className="p-3 text-center">
                        {row.estado_pago === 'PAGADO' ? (
                          <div className="flex flex-col items-center">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              PAGADO
                            </span>
                            {row.metodo_pago && (
                              <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                {row.metodo_pago} {row.referencia_pago ? `#${row.referencia_pago}` : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold text-[10px] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            PENDIENTE
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        {row.estado_pago !== 'PAGADO' && (
                          <button
                            onClick={() => {
                              setPayTargetDriver(row.domiciliario_id);
                              setShowPayModal(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-[11px] transition-all shadow"
                          >
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* MODAL REGISTRAR NOVEDAD */}
      {showNovedadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Registrar Novedad de Nómina
              </h3>
              <button onClick={() => setShowNovedadModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNovedad} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Trabajador (*):</label>
                <select
                  value={novedadForm.domiciliario_id}
                  onChange={(e) => setNovedadForm({ ...novedadForm, domiciliario_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                >
                  {driversList.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nombre_completo} ({d.cedula})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tipo Novedad (*):</label>
                  <select
                    value={novedadForm.tipo_novedad}
                    onChange={(e) => setNovedadForm({ ...novedadForm, tipo_novedad: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                  >
                    <option value="VALE">VALE / ADELANTO (-)</option>
                    <option value="BONO">BONO / BONIFICACIÓN (+)</option>
                    <option value="PENALIDAD">PENALIDAD / DESCUENTO (-)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Monto ($) (*):</label>
                  <input
                    type="number"
                    required
                    value={novedadForm.monto}
                    onChange={(e) => setNovedadForm({ ...novedadForm, monto: e.target.value })}
                    placeholder="Ej: 50000"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Fecha de la Novedad:</label>
                <input
                  type="date"
                  value={novedadForm.fecha_novedad}
                  onChange={(e) => setNovedadForm({ ...novedadForm, fecha_novedad: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Motivo / Concepto:</label>
                <input
                  type="text"
                  value={novedadForm.motivo}
                  onChange={(e) => setNovedadForm({ ...novedadForm, motivo: e.target.value })}
                  placeholder="Ej: Adelanto para gasolina / Bono puntualidad"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={creatingNov}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{creatingNov ? 'Guardando...' : 'Guardar Novedad'}</span>
              </button>
            </form>
          </GlassCard>
        </div>
      )}

      {/* MODAL AUDITORÍA ARCHIVO 2 */}
      {showFile2Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-lg p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                Auditoría con Archivo 2 (Cliente / Transportadora)
              </h3>
              <button onClick={() => setShowFile2Modal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Pega las líneas del reporte final (CSV / Excel copiado) con las columnas: <span className="font-mono text-purple-300">Cédula_o_Nombre, Entregados</span> para cruzar contra el control diario del Archivo 1.
            </p>

            <div>
              <textarea
                rows={6}
                value={file2Data}
                onChange={(e) => setFile2Data(e.target.value)}
                placeholder="1020304050, 45&#10;1030405060, 38&#10;Carlos Restrepo, 50"
                className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-white font-mono text-xs outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={handleProcessFile2}
              disabled={reconcilingFile2}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{reconcilingFile2 ? 'Auditando...' : 'Ejecutar Cruce de Archivo 2'}</span>
            </button>
          </GlassCard>
        </div>
      )}

      {/* MODAL MARCAR COMO PAGADO */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Registrar Pago de Nómina
              </h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Se marcará como <span className="text-emerald-400 font-bold">PAGADO</span> el período del {fechaInicio} al {fechaFin} para{' '}
              <span className="font-bold text-white">{payTargetDriver ? '1 trabajador' : `${selectedIds.length} trabajadores seleccionados`}</span>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Método de Pago:</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                >
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="NEQUI">Nequi</option>
                  <option value="BANCOLOMBIA">Bancolombia</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="DAVIPLATA">Daviplata</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Número de Comprobante / Referencia (Opcional):</label>
                <input
                  type="text"
                  value={referenciaPago}
                  onChange={(e) => setReferenciaPago(e.target.value)}
                  placeholder="Ej: REF-987654"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={handleExecutePayment}
                disabled={paying}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                <span>{paying ? 'Procesando...' : 'Confirmar y Marcar como PAGADO'}</span>
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

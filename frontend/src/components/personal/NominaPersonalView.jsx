import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Toast } from '../ui/Toast';
import {
  DollarSign,
  Calendar,
  PackageCheck,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  CreditCard,
  X,
  FileText,
  ShieldCheck,
  BookmarkPlus,
  Lock,
  Share2,
  MessageSquare,
  Copy,
  Printer
} from 'lucide-react';
import axios from 'axios';

export function NominaPersonalView() {
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getFirstOfMonthStr = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };

  // Helper para generar formato legible: "1 al 15 de Agosto 2026"
  const formatPeriodName = (startStr, endStr) => {
    if (!startStr || !endStr) return '';
    const monthsEs = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const partsStart = startStr.split('-');
    const partsEnd = endStr.split('-');
    if (partsStart.length !== 3 || partsEnd.length !== 3) return '';

    const sYear = parseInt(partsStart[0], 10);
    const sMonth = parseInt(partsStart[1], 10);
    const sDay = parseInt(partsStart[2], 10);

    const eYear = parseInt(partsEnd[0], 10);
    const eMonth = parseInt(partsEnd[1], 10);
    const eDay = parseInt(partsEnd[2], 10);

    const sMonthName = monthsEs[sMonth - 1] || '';
    const eMonthName = monthsEs[eMonth - 1] || '';

    if (sMonth === eMonth && sYear === eYear) {
      return `${sDay} al ${eDay} de ${sMonthName} ${sYear}`;
    } else {
      return `${sDay} de ${sMonthName} al ${eDay} de ${eMonthName} ${eYear}`;
    }
  };

  const [fechaInicio, setFechaInicio] = useState(getFirstOfMonthStr());
  const [fechaFin, setFechaFin] = useState(getTodayStr());
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Período Persistente / Corte de Nómina
  const [activePeriod, setActivePeriod] = useState(null);
  const [savedPeriods, setSavedPeriods] = useState([]);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    nombre_periodo: '',
    fecha_inicio: getFirstOfMonthStr(),
    fecha_fin: getTodayStr()
  });
  const [savingPeriod, setSavingPeriod] = useState(false);

  // Modal para registrar Novedad (Vale/Bono/Penalidad)
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

  // Modal para Marcar Pagado (Individual o Masivo)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTargetDriver, setPayTargetDriver] = useState(null); // null = masivo
  const [metodoPago, setMetodoPago] = useState('TRANSFERENCIA');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [paying, setPaying] = useState(false);

  // Modal de Recibo / Comprobante de Nómina & WhatsApp
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptItem, setReceiptItem] = useState(null);

  const [toast, setToast] = useState(null);

  // Cargar lista de períodos guardados
  const fetchPeriods = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/reconciliation/payroll/periods');
      setSavedPeriods(res.data.periodos || []);
      if (res.data.periodo_activo) {
        setActivePeriod(res.data.periodo_activo);
        setFechaInicio(res.data.periodo_activo.fecha_inicio);
        setFechaFin(res.data.periodo_activo.fecha_fin);
      }
    } catch (err) {
      console.error("Error cargando períodos de nómina", err);
    }
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/reconciliation/payroll/summary', {
        params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin }
      });
      setSummaryData(res.data);
      setSelectedIds([]);
    } catch (err) {
      console.error("Error al cargar nómina de domiciliarios", err);
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
      console.error("Error obteniendo conductores", err);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  // Actualizar nombre dinámicamente al cambiar fechas en el modal
  const handlePeriodDateChange = (field, val) => {
    const updatedForm = { ...periodForm, [field]: val };
    const autoName = formatPeriodName(updatedForm.fecha_inicio, updatedForm.fecha_fin);
    setPeriodForm({
      ...updatedForm,
      nombre_periodo: autoName || updatedForm.nombre_periodo
    });
  };

  // Fijar / Crear un nuevo Período de Nómina (Corte)
  const handleCreatePeriod = async (e) => {
    e.preventDefault();
    if (!periodForm.nombre_periodo.trim() || !periodForm.fecha_inicio || !periodForm.fecha_fin) {
      alert("Completa el nombre y las fechas del corte");
      return;
    }

    setSavingPeriod(true);
    try {
      const res = await axios.post('/api/v1/reconciliation/payroll/periods', {
        nombre_periodo: periodForm.nombre_periodo.trim(),
        fecha_inicio: periodForm.fecha_inicio,
        fecha_fin: periodForm.fecha_fin
      });

      const newP = res.data.periodo;
      setActivePeriod(newP);
      setFechaInicio(newP.fecha_inicio);
      setFechaFin(newP.fecha_fin);
      setShowPeriodModal(false);

      setToast({
        type: 'success',
        title: 'Corte Fijado Persistente',
        message: `El período "${newP.nombre_periodo}" ha sido fijado como activo.`
      });

      fetchPeriods();
      fetchPayroll();
    } catch (err) {
      console.error("Error al crear período", err);
      setToast({
        type: 'error',
        title: 'Error de Período',
        message: err.response?.data?.detail || 'No se pudo fijar el período'
      });
    } finally {
      setSavingPeriod(false);
    }
  };

  // Generador de Texto para WhatsApp / Copiar
  const generateWhatsAppMessage = (item) => {
    const periodName = activePeriod ? activePeriod.nombre_periodo : formatPeriodName(fechaInicio, fechaFin);
    
    let msg = `📄 *COMPROBANTE DE NÓMINA — GEOFULL V4*\n`;
    msg += `👤 *Trabajador:* ${item.nombre_completo}\n`;
    msg += `🪪 *Cédula:* ${item.cedula}\n`;
    msg += `📅 *Período:* ${periodName} (${fechaInicio} al ${fechaFin})\n\n`;

    if (item.tipo_remuneracion === 'DESTAJO' || item.tipo_remuneracion === 'MIXTO') {
      msg += `📦 *Guías Entregadas:* ${item.total_entregados} x $${Number(item.tarifa_paquete).toLocaleString('es-CO')} = $${Number(item.monto_paquetes).toLocaleString('es-CO')}\n`;
    }
    if (item.tipo_remuneracion === 'SALARIO_FIJO' || item.tipo_remuneracion === 'MIXTO') {
      msg += `💼 *Salario Fijo:* $${Number(item.salario_fijo_aplicado).toLocaleString('es-CO')}\n`;
    }
    if (item.bonos > 0) {
      msg += `➕ *Bonificaciones:* $${Number(item.bonos).toLocaleString('es-CO')}\n`;
    }
    if (item.vales_descontados > 0) {
      msg += `➖ *Vales / Adelantos:* $${Number(item.vales_descontados).toLocaleString('es-CO')}\n`;
    }
    if (item.penalidades > 0) {
      msg += `➖ *Penalidades:* $${Number(item.penalidades).toLocaleString('es-CO')}\n`;
    }

    msg += `----------------------------------------\n`;
    msg += `💰 *TOTAL NETO A PAGAR:* $${Number(item.monto_neto).toLocaleString('es-CO')}\n`;
    msg += `----------------------------------------\n`;

    if (item.banco) {
      msg += `🏦 *Cuenta:* ${item.banco} (${item.tipo_cuenta || 'Ahorros'}) - ${item.cuenta || 'Sin asignar'}\n`;
    }
    msg += `📌 *Estado:* ${item.estado_pago === 'PAGADO' ? '✅ PAGADO' : '⏳ PENDIENTE DE PAGO'}\n`;
    if (item.metodo_pago) {
      msg += `💳 *Método:* ${item.metodo_pago} ${item.referencia_pago ? `(Ref: ${item.referencia_pago})` : ''}\n`;
    }

    msg += `\n_GeoFull V4 — Gestión Inteligente de Logística_`;
    return msg;
  };

  const handleOpenWhatsApp = (item) => {
    const textMsg = generateWhatsAppMessage(item);
    const encoded = encodeURIComponent(textMsg);
    const phone = item.telefono ? item.telefono.replace(/\D/g, '') : '';
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleCopyReceiptText = (item) => {
    const textMsg = generateWhatsAppMessage(item);
    navigator.clipboard.writeText(textMsg);
    setToast({
      type: 'success',
      title: 'Copiado al Portapapeles',
      message: `El comprobante de ${item.nombre_completo} fue copiado para enviar por WhatsApp.`
    });
  };

  // Selección múltiple
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

  // Guardar Novedad
  const handleCreateNovedad = async (e) => {
    e.preventDefault();
    if (!novedadForm.domiciliario_id || !novedadForm.monto || parseFloat(novedadForm.monto) <= 0) {
      alert("Selecciona un trabajador y un monto válido");
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
        title: 'Novedad Guardada',
        message: `Se registró ${novedadForm.tipo_novedad} por $${Number(novedadForm.monto).toLocaleString('es-CO')}`
      });

      setShowNovedadModal(false);
      setNovedadForm({
        domiciliario_id: driversList[0]?.id || '',
        tipo_novedad: 'VALE',
        monto: '',
        motivo: '',
        fecha_novedad: getTodayStr()
      });
      fetchPayroll();
    } catch (err) {
      console.error("Error guardando novedad", err);
      setToast({
        type: 'error',
        title: 'Error de Novedad',
        message: err.response?.data?.detail || 'No se pudo guardar la novedad'
      });
    } finally {
      setCreatingNov(false);
    }
  };

  // Marcar como Pagado
  const handleExecutePayment = async () => {
    const targetIds = payTargetDriver ? [payTargetDriver] : selectedIds;
    if (targetIds.length === 0) {
      alert("Selecciona al menos un domiciliario para marcar su pago");
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
        title: 'Pago Registrado',
        message: res.data.message
      });

      setShowPayModal(false);
      setPayTargetDriver(null);
      setMetodoPago('TRANSFERENCIA');
      setReferenciaPago('');
      fetchPeriods();
      fetchPayroll();
    } catch (err) {
      console.error("Error registrando pago", err);
      setToast({
        type: 'error',
        title: 'Error de Pago',
        message: err.response?.data?.detail || 'No se pudo registrar el pago'
      });
    } finally {
      setPaying(false);
    }
  };

  const items = summaryData?.items || [];
  const totalGuiasEntregadas = items.reduce((acc, i) => acc + (i.total_entregados || 0), 0);
  const totalNominaNeto = summaryData?.total_neto_nomina || items.reduce((acc, i) => acc + (i.monto_neto || 0), 0);
  const totalPagado = summaryData?.total_pagado || items.filter(i => i.estado_pago === 'PAGADO').reduce((acc, i) => acc + i.monto_neto, 0);
  const totalPendiente = summaryData?.total_pendiente || items.filter(i => i.estado_pago !== 'PAGADO').reduce((acc, i) => acc + i.monto_neto, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Persistent Active Period & Corte Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Nómina & Control de Pagos por Período
            </h3>
            {activePeriod && (
              <Badge variant={activePeriod.estado === 'PAGADO' ? 'purple' : 'emerald'} className="animate-pulse">
                {activePeriod.estado === 'PAGADO' ? 'PERÍODO PAGADO' : 'CORTE ACTIVO PERSISTENTE'}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="font-semibold text-purple-300 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-purple-400" />
              {activePeriod ? activePeriod.nombre_periodo : 'Corte Predeterminado'}:
            </span>
            <span className="font-mono text-white font-bold bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
              {fechaInicio} ➔ {fechaFin}
            </span>
            <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              Guías Pagadas Excluidas (Anti-Doble Pago)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800">
          <button
            onClick={() => {
              const defaultName = formatPeriodName(fechaInicio, fechaFin);
              setPeriodForm({
                nombre_periodo: defaultName || `Corte ${fechaInicio} al ${fechaFin}`,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin
              });
              setShowPeriodModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md shadow-purple-500/20"
          >
            <BookmarkPlus className="w-4 h-4" />
            <span>Fijar Período / Nuevo Corte</span>
          </button>

          <div className="h-4 w-px bg-slate-800 my-auto" />

          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono outline-none focus:border-blue-500"
          />
          <span className="text-slate-500 text-xs font-bold">a</span>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono outline-none focus:border-blue-500"
          />
          <button
            onClick={fetchPayroll}
            className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md shadow-blue-500/20"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* KPI Cards (Metrics) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 border-l-4 border-l-emerald-500 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Conteo Guías Entregadas</p>
            <h3 className="text-2xl font-black text-white font-mono">{totalGuiasEntregadas.toLocaleString('es-CO')}</h3>
            <p className="text-[10px] text-emerald-400/80">En el período seleccionado</p>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-purple-500 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Nómina Generada</p>
            <h3 className="text-2xl font-black text-purple-300 font-mono">
              ${Number(totalNominaNeto).toLocaleString('es-CO')}
            </h3>
            <p className="text-[10px] text-purple-400/80">Destajo + Salario Fijo</p>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-blue-500 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pagos Realizados</p>
            <h3 className="text-2xl font-black text-emerald-400 font-mono">
              ${Number(totalPagado).toLocaleString('es-CO')}
            </h3>
            <p className="text-[10px] text-emerald-400/80">Nóminas marcadas como pagadas</p>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-amber-500 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pendiente por Pagar</p>
            <h3 className="text-2xl font-black text-amber-400 font-mono">
              ${Number(totalPendiente).toLocaleString('es-CO')}
            </h3>
            <p className="text-[10px] text-amber-400/80">Saldo por liquidar</p>
          </div>
        </GlassCard>
      </div>

      {/* Toolbar / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-white/10">
        <button
          onClick={() => {
            fetchDriversList();
            setShowNovedadModal(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Registrar Vale, Bono o Penalidad</span>
        </button>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 bg-blue-950/80 px-4 py-1.5 rounded-xl border border-blue-500/40 animate-fadeIn">
            <span className="text-xs text-blue-300 font-bold">
              {selectedIds.length} domiciliarios seleccionados
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
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={items.length > 0 && selectedIds.length === items.length}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-3.5">Domiciliario / Conductor</th>
                <th className="p-3.5">Esquema Pago</th>
                <th className="p-3.5 text-center">Guías Entregadas</th>
                <th className="p-4 text-right">Tarifa / Salario Fijo</th>
                <th className="p-4 text-right">Ajustes / Vales</th>
                <th className="p-4 text-right font-black">Total a Pagar</th>
                <th className="p-3.5 text-center">Estado Pago</th>
                <th className="p-3.5 text-right">Acción / Comprobante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Calculando resumen de nómina...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-500">
                    No se encontraron entregas ni registros de personal para el período seleccionado.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.domiciliario_id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.domiciliario_id)}
                        onChange={() => handleSelectOne(item.domiciliario_id)}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-white text-sm">
                        {item.nombre_completo}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        CC: {item.cedula} {item.banco ? `| ${item.banco} (${item.cuenta || 'Sin cuenta'})` : ''}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <Badge variant={item.tipo_remuneracion === 'SALARIO_FIJO' ? 'purple' : item.tipo_remuneracion === 'MIXTO' ? 'blue' : 'amber'}>
                        {item.tipo_remuneracion}
                      </Badge>
                    </td>

                    <td className="p-3.5 text-center font-mono font-bold text-emerald-400 text-sm">
                      {item.total_entregados} guías
                    </td>

                    <td className="p-4 text-right font-mono text-slate-300">
                      {item.tipo_remuneracion === 'SALARIO_FIJO' ? (
                        <span className="text-purple-300">${Number(item.salario_fijo_aplicado).toLocaleString('es-CO')} (Fijo)</span>
                      ) : item.tipo_remuneracion === 'MIXTO' ? (
                        <div>
                          <span className="text-emerald-400">${Number(item.tarifa_paquete).toLocaleString('es-CO')}/paq</span>
                          <div className="text-[10px] text-purple-300">+ ${Number(item.salario_fijo_aplicado).toLocaleString('es-CO')} Fijo</div>
                        </div>
                      ) : (
                        <span className="text-emerald-400">${Number(item.tarifa_paquete).toLocaleString('es-CO')}/paq</span>
                      )}
                    </td>

                    <td className="p-4 text-right font-mono">
                      {item.descuentos > 0 || item.bonos > 0 ? (
                        <div>
                          {item.bonos > 0 && <span className="text-emerald-400 block">+${Number(item.bonos).toLocaleString('es-CO')} (Bono)</span>}
                          {item.vales_descontados > 0 && <span className="text-amber-400 block">-${Number(item.vales_descontados).toLocaleString('es-CO')} (Vale)</span>}
                          {item.penalidades > 0 && <span className="text-red-400 block">-${Number(item.penalidades).toLocaleString('es-CO')} (Penalidad)</span>}
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    <td className="p-4 text-right font-mono font-black text-white text-base">
                      ${Number(item.monto_neto).toLocaleString('es-CO')}
                    </td>

                    <td className="p-3.5 text-center">
                      <Badge variant={item.estado_pago === 'PAGADO' ? 'emerald' : 'amber'}>
                        {item.estado_pago === 'PAGADO' ? 'PAGADO' : 'PENDIENTE'}
                      </Badge>
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setReceiptItem(item);
                            setShowReceiptModal(true);
                          }}
                          title="Ver Recibo / Enviar por WhatsApp"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-[11px] font-semibold transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Recibo</span>
                        </button>

                        <button
                          onClick={() => handleOpenWhatsApp(item)}
                          title="Enviar resumen directo por WhatsApp"
                          className="p-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 transition-all"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>

                        {item.estado_pago !== 'PAGADO' && (
                          <button
                            onClick={() => {
                              setPayTargetDriver(item.domiciliario_id);
                              setShowPayModal(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-md shadow-emerald-500/20"
                          >
                            Pagar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* MODAL RECIBO DE NÓMINA / COMPROBANTE & WHATSAPP */}
      {showReceiptModal && receiptItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-lg p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/95 text-white space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-6 h-6 text-emerald-400" />
                <div>
                  <h3 className="font-extrabold text-base text-white">Comprobante de Nómina</h3>
                  <p className="text-[11px] text-slate-400 font-mono">GeoFull V4 — Control Logístico</p>
                </div>
              </div>
              <button onClick={() => setShowReceiptModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recibo Impreso / Visual */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                <div>
                  <h4 className="font-bold text-white text-sm">{receiptItem.nombre_completo}</h4>
                  <p className="text-slate-400 text-[11px]">CC: {receiptItem.cedula}</p>
                </div>
                <Badge variant={receiptItem.estado_pago === 'PAGADO' ? 'emerald' : 'amber'}>
                  {receiptItem.estado_pago === 'PAGADO' ? 'PAGADO' : 'PENDIENTE'}
                </Badge>
              </div>

              <div className="text-[11px] text-purple-300">
                📌 Período: <span className="font-bold text-white">{activePeriod ? activePeriod.nombre_periodo : formatPeriodName(fechaInicio, fechaFin)}</span> ({fechaInicio} al {fechaFin})
              </div>

              <div className="space-y-1.5 py-2 border-y border-slate-800/80 text-slate-300">
                {(receiptItem.tipo_remuneracion === 'DESTAJO' || receiptItem.tipo_remuneracion === 'MIXTO') && (
                  <div className="flex justify-between">
                    <span>Entregas ({receiptItem.total_entregados} guías x ${Number(receiptItem.tarifa_paquete).toLocaleString('es-CO')}):</span>
                    <span className="font-bold text-white">${Number(receiptItem.monto_paquetes).toLocaleString('es-CO')}</span>
                  </div>
                )}
                {(receiptItem.tipo_remuneracion === 'SALARIO_FIJO' || receiptItem.tipo_remuneracion === 'MIXTO') && (
                  <div className="flex justify-between">
                    <span>Salario Fijo:</span>
                    <span className="font-bold text-purple-300">${Number(receiptItem.salario_fijo_aplicado).toLocaleString('es-CO')}</span>
                  </div>
                )}
                {receiptItem.bonos > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>+ Bonificaciones:</span>
                    <span>+${Number(receiptItem.bonos).toLocaleString('es-CO')}</span>
                  </div>
                )}
                {receiptItem.vales_descontados > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>- Vales / Adelantos:</span>
                    <span>-${Number(receiptItem.vales_descontados).toLocaleString('es-CO')}</span>
                  </div>
                )}
                {receiptItem.penalidades > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>- Penalidades:</span>
                    <span>-${Number(receiptItem.penalidades).toLocaleString('es-CO')}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center text-sm pt-1">
                <span className="font-bold text-white uppercase">Total Neto:</span>
                <span className="font-black text-emerald-400 text-lg">${Number(receiptItem.monto_neto).toLocaleString('es-CO')}</span>
              </div>

              {receiptItem.banco && (
                <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-900">
                  🏦 Pago a: {receiptItem.banco} ({receiptItem.tipo_cuenta || 'Ahorros'}) - N° {receiptItem.cuenta || 'Sin asignar'}
                </div>
              )}
            </div>

            {/* Acciones del Comprobante */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => handleOpenWhatsApp(receiptItem)}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar por WhatsApp</span>
              </button>

              <button
                onClick={() => handleCopyReceiptText(receiptItem)}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4 text-blue-400" />
                <span>Copiar Texto</span>
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* MODAL FIJAR PERÍODO DE NÓMINA / CORTE */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-purple-400" />
                Fijar Período de Nómina (Corte Persistente)
              </h3>
              <button onClick={() => setShowPeriodModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Define el corte de nómina activo. Este período se guardará y <span className="text-purple-300 font-bold">permanecerá fijo</span> al recargar o volver a ingresar a la aplicación.
            </p>

            <form onSubmit={handleCreatePeriod} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nombre del Período / Corte (*):</label>
                <input
                  type="text"
                  required
                  value={periodForm.nombre_periodo}
                  onChange={(e) => setPeriodForm({ ...periodForm, nombre_periodo: e.target.value })}
                  placeholder="Ej: 1 al 15 de Agosto 2026"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Fecha Inicio (*):</label>
                  <input
                    type="date"
                    required
                    value={periodForm.fecha_inicio}
                    onChange={(e) => handlePeriodDateChange('fecha_inicio', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Fecha Fin (*):</label>
                  <input
                    type="date"
                    required
                    value={periodForm.fecha_fin}
                    onChange={(e) => handlePeriodDateChange('fecha_fin', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPeriod}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-purple-500/20"
              >
                <span>{savingPeriod ? 'Guardando Corte...' : 'Fijar Corte como Activo'}</span>
              </button>
            </form>
          </GlassCard>
        </div>
      )}

      {/* MODAL REGISTRAR NOVEDAD */}
      {showNovedadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Registrar Vale, Bono o Penalidad
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
                      {d.nombre_completo} (CC: {d.cedula})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tipo de Novedad (*):</label>
                  <select
                    value={novedadForm.tipo_novedad}
                    onChange={(e) => setNovedadForm({ ...novedadForm, tipo_novedad: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                  >
                    <option value="VALE">VALE / ADELANTO (-)</option>
                    <option value="BONO">BONIFICACIÓN (+)</option>
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
                <label className="block text-slate-400 font-semibold mb-1">Fecha de Novedad:</label>
                <input
                  type="date"
                  value={novedadForm.fecha_novedad}
                  onChange={(e) => setNovedadForm({ ...novedadForm, fecha_novedad: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Motivo / Descripción:</label>
                <input
                  type="text"
                  value={novedadForm.motivo}
                  onChange={(e) => setNovedadForm({ ...novedadForm, motivo: e.target.value })}
                  placeholder="Ej: Adelanto de gasolina"
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

      {/* MODAL REGISTRAR PAGO */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Confirmar Registro de Pago
              </h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Se registrará como <span className="text-emerald-400 font-bold">PAGADO</span> el período del {fechaInicio} al {fechaFin} para{' '}
              <span className="font-bold text-white">{payTargetDriver ? '1 domiciliario' : `${selectedIds.length} domiciliarios seleccionados`}</span>.
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
                <label className="block text-slate-400 font-semibold mb-1">Comprobante / Referencia (Opcional):</label>
                <input
                  type="text"
                  value={referenciaPago}
                  onChange={(e) => setReferenciaPago(e.target.value)}
                  placeholder="Ej: REF-12345"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={handleExecutePayment}
                disabled={paying}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                <span>{paying ? 'Guardando...' : 'Confirmar Pago Efectuado'}</span>
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

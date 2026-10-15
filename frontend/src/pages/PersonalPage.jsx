import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { DriverDetailModal } from '../components/personal/DriverDetailModal';
import { NominaPersonalView } from '../components/personal/NominaPersonalView';
import { DuplicatesAssistantModal } from '../components/personal/DuplicatesAssistantModal';
import * as XLSX from 'xlsx';
import {
  Users,
  Search,
  UserPlus,
  Phone,
  CreditCard,
  CheckCircle2,
  Clock,
  DollarSign,
  Merge,
  X,
  Plus,
  Edit3,
  Sparkles,
  Download,
  Filter,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Building2
} from 'lucide-react';
import axios from 'axios';

export function parseDriverName(rawName) {
  if (!rawName) return { cleanName: 'Sin Nombre', tag: null };
  let clean = rawName.split('|')[0];
  let tag = null;
  if (rawName.includes('|')) {
    tag = rawName.split('|').slice(1).join('|');
  }
  if (clean.toLowerCase().endsWith('.pcp')) {
    clean = clean.slice(0, -4);
    tag = tag ? `${tag} (pcp)` : 'pcp';
  }
  clean = clean.replace(/\.(csv|xlsx|tmp)/gi, '').trim();
  return { cleanName: clean || rawName, tag };
}

export function PersonalPage() {
  const [activeMainTab, setActiveMainTab] = useState('directorio');
  const [drivers, setDrivers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | temp | verified | with_orders | no_bank
  const [selectedDriverNominaSearch, setSelectedDriverNominaSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUnifyModal, setShowUnifyModal] = useState(false);
  const [showDuplicatesAssistant, setShowDuplicatesAssistant] = useState(false);
  const [duplicatesMeta, setDuplicatesMeta] = useState({ total_groups: 0, total_duplicates: 0 });
  const [selectedDriverForEdit, setSelectedDriverForEdit] = useState(null);
  const [toast, setToast] = useState(null);

  // Estado para creación de domiciliario
  const [newDriver, setNewDriver] = useState({
    nombre_completo: '',
    cedula: '',
    telefono: '',
    tipo_contrato: 'PAQUETEO',
    tipo_remuneracion: 'DESTAJO',
    salario_fijo: 0,
    periodicidad_pago: 'GLOBAL',
    tarifa_paquete: 2000
  });
  const [creating, setCreating] = useState(false);

  // Estado para unificación de domiciliarios
  const [selectedDriversToUnify, setSelectedDriversToUnify] = useState([]);
  const [realCedula, setRealCedula] = useState('');
  const [unifying, setUnifying] = useState(false);

  const { activeTenantId } = useAuth();

  const fetchDuplicatesMeta = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/reconciliation/drivers/duplicates-suggestions');
      setDuplicatesMeta({
        total_groups: res.data.total_groups || 0,
        total_duplicates: res.data.total_duplicates || 0
      });
    } catch (err) {
      console.error("Error al obtener duplicados sugeridos", err);
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/reconciliation/drivers', {
        params: { search: searchTerm }
      });
      setDrivers(res.data);
    } catch (err) {
      console.error("Error al cargar la lista de domiciliarios", err);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchDrivers();
    fetchDuplicatesMeta();
  }, [activeTenantId, fetchDrivers, fetchDuplicatesMeta]);

  const handleCreateDriver = async (e) => {
    e.preventDefault();
    if (!newDriver.nombre_completo.trim() || !newDriver.cedula.trim()) {
      alert("Ingresa al menos el Nombre Completo y la Cédula del domiciliario");
      return;
    }

    setCreating(true);
    try {
      await axios.post('/api/v1/reconciliation/drivers', newDriver);

      setToast({
        type: 'success',
        title: 'Domiciliario Creado',
        message: `Se registró a ${newDriver.nombre_completo} correctamente.`
      });

      setShowCreateModal(false);
      setNewDriver({
        nombre_completo: '',
        cedula: '',
        telefono: '',
        tipo_contrato: 'PAQUETEO',
        tipo_remuneracion: 'DESTAJO',
        salario_fijo: 0,
        periodicidad_pago: 'GLOBAL',
        tarifa_paquete: 2000
      });
      fetchDrivers();
    } catch (err) {
      console.error("Error creando domiciliario", err);
      setToast({
        type: 'error',
        title: 'Error de Registro',
        message: err.response?.data?.detail || 'No se pudo crear el domiciliario'
      });
    } finally {
      setCreating(false);
    }
  };

  const handleUnifyDrivers = async () => {
    if (selectedDriversToUnify.length < 2) {
      alert("Selecciona al menos 2 domiciliarios para unificar");
      return;
    }
    if (!realCedula.trim()) {
      alert("Ingresa la Cédula Real del conductor");
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
      fetchDrivers();
    } catch (err) {
      console.error("Error unificando domiciliarios", err);
      setToast({
        type: 'error',
        title: 'Error de Unificación',
        message: err.response?.data?.detail || 'No se pudieron unificar los registros'
      });
    } finally {
      setUnifying(false);
    }
  };

  const handleExportExcel = () => {
    if (drivers.length === 0) return;
    const data = drivers.map((d, idx) => {
      const { cleanName, tag } = parseDriverName(d.nombre_completo);
      return {
        '#': idx + 1,
        'Nombre Limpio': cleanName,
        'Nombre Completo en Plataforma': d.nombre_completo,
        'Alias / Tag': tag || '',
        'Cédula': d.cedula,
        'Tipo Cédula': d.cedula.startsWith('AUTO-DA') ? 'Temporal (AUTO-DA)' : 'Real Verificada',
        'Teléfono': d.telefono || 'N/A',
        'Tipo Contrato': d.tipo_contrato || 'PAQUETEO',
        'Tipo Remuneración': d.tipo_remuneracion || 'DESTAJO',
        'Tarifa Paquete': d.tarifa_paquete || 2000,
        'Salario Fijo': d.salario_fijo || 0,
        'Banco': d.banco || 'Sin registrar',
        'Tipo Cuenta': d.tipo_cuenta || '',
        'Número Cuenta': d.cuenta || '',
        'Entregados': d.total_entregados || 0,
        'En Ruta': d.total_en_ruta || 0,
        'Pendiente Nómina (paquetes)': d.pendientes_liquidacion || 0
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Directorio_Personal");
    XLSX.writeFile(wb, `Directorio_Personal_GeoFull_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const tempDriversCount = drivers.filter(d => d.cedula.startsWith('AUTO-DA')).length;
  const realDriversCount = drivers.length - tempDriversCount;
  const withOrdersCount = drivers.filter(d => (d.total_entregados || 0) > 0 || (d.total_en_ruta || 0) > 0).length;
  const noBankCount = drivers.filter(d => !d.banco).length;

  const filteredDrivers = drivers.filter(d => {
    if (filterStatus === 'temp' && !d.cedula.startsWith('AUTO-DA')) return false;
    if (filterStatus === 'verified' && d.cedula.startsWith('AUTO-DA')) return false;
    if (filterStatus === 'with_orders' && (d.total_entregados || 0) === 0 && (d.total_en_ruta || 0) === 0) return false;
    if (filterStatus === 'no_bank' && d.banco) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Personal & Domiciliarios
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Directorio completo de conductores, búsqueda en tiempo real, limpieza de nombres de plataformas y nómina.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {duplicatesMeta.total_groups > 0 && (
            <button
              onClick={() => setShowDuplicatesAssistant(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-2xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-bold transition-all border border-purple-500/40 shadow-lg shadow-purple-500/10 touch-target animate-pulse"
            >
              <Sparkles className="w-4 h-4 text-purple-300" />
              <span>Duplicados ({duplicatesMeta.total_groups})</span>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 touch-target"
            title="Descargar base de datos completa de conductores en Excel"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Excel</span>
          </button>

          <button
            onClick={() => setShowUnifyModal(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 touch-target"
          >
            <Merge className="w-4 h-4 text-purple-400" />
            <span>Unificar Manual</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-500/20 touch-target"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Domiciliario</span>
          </button>
        </div>
      </div>

      {/* Module Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 scroll-x-chips">
        <button
          onClick={() => setActiveMainTab('directorio')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 touch-target ${
            activeMainTab === 'directorio'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Directorio de Personal</span>
        </button>

        <button
          onClick={() => setActiveMainTab('nomina')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 touch-target ${
            activeMainTab === 'nomina'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>Liquidar Nómina & Pagos</span>
        </button>
      </div>

      {activeMainTab === 'nomina' ? (
        <NominaPersonalView initialSearchTerm={selectedDriverNominaSearch} />
      ) : (
        <>
      {/* Duplicates Smart Banner */}
      {duplicatesMeta.total_groups > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-3xl bg-gradient-to-r from-purple-950/70 via-slate-900/80 to-blue-950/70 border border-purple-500/40 backdrop-blur-xl shadow-xl shadow-purple-950/30 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm text-white">
                  Sugerencia Inteligente: {duplicatesMeta.total_duplicates} conductores duplicados detectados
                </h4>
                <Badge variant="purple">{duplicatesMeta.total_groups} Grupos</Badge>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Existen perfiles repetidos debido a sufijos de plataformas (.pcp, códigos de ruta). Puedes unificarlos y limpiar sus nombres con un solo clic.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowDuplicatesAssistant(true)}
            className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/25 flex items-center gap-2 whitespace-nowrap shrink-0 touch-target"
          >
            <span>Abrir Asistente de Unificación</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <GlassCard
          onClick={() => setFilterStatus('all')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${
            filterStatus === 'all' ? 'border-blue-500 ring-2 ring-blue-500/20 bg-slate-900/90' : 'border-white/10 hover:border-white/20'
          }`}
        >
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Total Domiciliarios</p>
            <h3 className="text-2xl font-extrabold text-white">{drivers.length}</h3>
            <p className="text-[11px] text-blue-400 mt-0.5">Directorio completo</p>
          </div>
        </GlassCard>

        <GlassCard
          onClick={() => setFilterStatus('verified')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${
            filterStatus === 'verified' ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-slate-900/90' : 'border-white/10 hover:border-white/20'
          }`}
        >
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Cédula Verificada</p>
            <h3 className="text-2xl font-extrabold text-white">{realDriversCount}</h3>
            <p className="text-[11px] text-emerald-400 mt-0.5">Conductores reales</p>
          </div>
        </GlassCard>

        <GlassCard
          onClick={() => setFilterStatus('temp')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${
            filterStatus === 'temp' ? 'border-amber-500 ring-2 ring-amber-500/20 bg-slate-900/90' : 'border-white/10 hover:border-white/20'
          }`}
        >
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Cédula Temporal</p>
            <h3 className="text-2xl font-extrabold text-white">{tempDriversCount}</h3>
            <p className="text-[11px] text-amber-400 mt-0.5">AUTO-DA pendientes</p>
          </div>
        </GlassCard>

        <GlassCard
          onClick={() => setFilterStatus('with_orders')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${
            filterStatus === 'with_orders' ? 'border-purple-500 ring-2 ring-purple-500/20 bg-slate-900/90' : 'border-white/10 hover:border-white/20'
          }`}
        >
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Con Movimiento</p>
            <h3 className="text-2xl font-extrabold text-white">{withOrdersCount}</h3>
            <p className="text-[11px] text-purple-400 mt-0.5">Con entregas o en ruta</p>
          </div>
        </GlassCard>
      </div>

      {/* Main Table Card with Search & Quick Filter Chips */}
      <GlassCard className="p-6 rounded-3xl border border-white/10 space-y-4">
        {/* Search Bar & Counter */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Nombre Completo, Alias o Cédula..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-700 text-white font-medium text-xs placeholder:text-slate-500 outline-none focus:border-blue-500 transition-all shadow-inner"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap scroll-x-chips">
            {[
              { id: 'all', label: `Todos (${drivers.length})` },
              { id: 'temp', label: `⚠️ Temporales (${tempDriversCount})` },
              { id: 'verified', label: `✅ Verificados (${realDriversCount})` },
              { id: 'with_orders', label: `📦 Con Entregas (${withOrdersCount})` },
              { id: 'no_bank', label: `🏦 Sin Banco (${noBankCount})` }
            ].map(chip => (
              <button
                key={chip.id}
                onClick={() => setFilterStatus(chip.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  filterStatus === chip.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400">
            Mostrando <strong className="text-white">{filteredDrivers.length}</strong> domiciliarios
          </div>
        </div>

        {/* Drivers Table */}
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar rt-wrap">
          <table className="w-full text-left border-collapse rt">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/60 sticky top-0 z-10 backdrop-blur-md">
                <th className="p-3">Nombre & Plataforma</th>
                <th className="p-3">Cédula</th>
                <th className="p-3">Teléfono</th>
                <th className="p-3">Banco / Cuenta</th>
                <th className="p-3">Tarifa Paquete</th>
                <th className="p-3 text-center">Entregados</th>
                <th className="p-3 text-center">En Ruta</th>
                <th className="p-3 text-center">Pendiente Nómina</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                    No se encontraron domiciliarios que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((d) => {
                  const { cleanName, tag } = parseDriverName(d.nombre_completo);
                  const isTemp = d.cedula.startsWith('AUTO-DA');

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDriverForEdit(d)}
                      className="hover:bg-slate-800/40 transition-all cursor-pointer group"
                    >
                      <td data-label="Nombre" className="p-3">
                        <div className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                          <span>{cleanName}</span>
                          <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
                        </div>
                        {tag && (
                          <div className="text-[10px] text-purple-400 font-mono mt-0.5">
                            Tag: {tag}
                          </div>
                        )}
                        {d.nombre_completo !== cleanName && (
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[220px]">
                            Raw: {d.nombre_completo}
                          </div>
                        )}
                      </td>

                      <td data-label="Cédula" className="p-3 font-mono font-semibold">
                        {isTemp ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] inline-flex items-center gap-1" title="Cédula Temporal Auto-Generada">
                            <Clock className="w-3 h-3 text-amber-400" />
                            {d.cedula}
                          </span>
                        ) : (
                          <span className="text-slate-200">{d.cedula}</span>
                        )}
                      </td>

                      <td data-label="Teléfono" className="p-3 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{d.telefono || 'N/A'}</span>
                        </div>
                      </td>

                      <td data-label="Banco" className="p-3">
                        {d.banco ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
                            🏦 {d.banco} {d.cuenta ? `(${d.cuenta})` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">Sin registrar</span>
                        )}
                      </td>

                      <td data-label="Tarifa" className="p-3 font-mono font-semibold text-emerald-400">
                        ${Number(d.tarifa_paquete || 2000).toLocaleString('es-CO')}
                        <span className="text-[10px] text-slate-500 block font-normal">{d.tipo_remuneracion || 'DESTAJO'}</span>
                      </td>

                      <td data-label="Entregados" className="p-3 text-center font-mono font-bold text-emerald-400">
                        {d.total_entregados || 0}
                      </td>

                      <td data-label="En Ruta" className="p-3 text-center font-mono font-bold text-amber-400">
                        {d.total_en_ruta || 0}
                      </td>

                      <td data-label="Pendiente" className="p-3 text-center font-mono">
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold text-[11px]">
                          {d.pendientes_liquidacion || 0} paq.
                        </span>
                      </td>

                      <td data-label="Acciones" className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDriverNominaSearch(cleanName);
                              setActiveMainTab('nomina');
                            }}
                            title="Ver pre-liquidación en nómina"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition-all touch-target"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Nómina</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDriverForEdit(d);
                            }}
                            title="Editar ficha completa"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all touch-target"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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

      {/* CREATE DRIVER MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <GlassCard className="modal-sheet w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Registrar Nuevo Domiciliario</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white p-2 touch-target">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDriver} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nombre Completo (*):</label>
                <input
                  type="text"
                  required
                  value={newDriver.nombre_completo}
                  onChange={(e) => setNewDriver({ ...newDriver, nombre_completo: e.target.value })}
                  placeholder="Ej: Carlos Mario Restrepo"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Cédula (*):</label>
                <input
                  type="text"
                  required
                  value={newDriver.cedula}
                  onChange={(e) => setNewDriver({ ...newDriver, cedula: e.target.value })}
                  placeholder="Ej: 1020304050"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Teléfono:</label>
                <input
                  type="text"
                  value={newDriver.telefono}
                  onChange={(e) => setNewDriver({ ...newDriver, telefono: e.target.value })}
                  placeholder="Ej: 3001234567"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tipo Remuneración:</label>
                  <select
                    value={newDriver.tipo_remuneracion}
                    onChange={(e) => setNewDriver({ ...newDriver, tipo_remuneracion: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                  >
                    <option value="DESTAJO">DESTAJO (Paquetes)</option>
                    <option value="SALARIO_FIJO">SALARIO FIJO</option>
                    <option value="MIXTO">MIXTO (Fijo + Destajo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Periodicidad Pago:</label>
                  <select
                    value={newDriver.periodicidad_pago}
                    onChange={(e) => setNewDriver({ ...newDriver, periodicidad_pago: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                  >
                    <option value="GLOBAL">Default Global</option>
                    <option value="DIARIO">DIARIO</option>
                    <option value="SEMANAL">SEMANAL</option>
                    <option value="QUINCENAL">QUINCENAL</option>
                    <option value="MENSUAL">MENSUAL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Salario Fijo ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={newDriver.salario_fijo}
                    onChange={(e) => setNewDriver({ ...newDriver, salario_fijo: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tarifa Paquete ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={newDriver.tarifa_paquete}
                    onChange={(e) => setNewDriver({ ...newDriver, tarifa_paquete: parseFloat(e.target.value) || 0 })}
                    placeholder="2000"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-500/20 touch-target"
              >
                <Plus className="w-4 h-4" />
                <span>{creating ? 'Guardando...' : 'Guardar Domiciliario'}</span>
              </button>
            </form>
          </GlassCard>
        </div>
      )}

      {/* UNIFY DRIVERS MODAL */}
      {showUnifyModal && (
        <div className="modal-overlay">
          <GlassCard className="modal-sheet w-full max-w-lg p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Merge className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">Unificar Registros por Cédula</h3>
              </div>
              <button onClick={() => setShowUnifyModal(false)} className="text-slate-400 hover:text-white p-2 touch-target">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Selecciona 2 o más domiciliarios de la lista que correspondan a la misma persona e ingresa su Cédula Real.
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
                <label className="block text-slate-400 font-semibold mb-1">Seleccionar Conductores a Unificar:</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  {drivers.map(d => (
                    <label key={d.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer touch-target">
                      <input
                        type="checkbox"
                        checked={selectedDriversToUnify.includes(d.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDriversToUnify([...selectedDriversToUnify, d.id]);
                          } else {
                            setSelectedDriversToUnify(selectedDriversToUnify.filter(id => id !== d.id));
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-200">{d.nombre_completo}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({d.cedula})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleUnifyDrivers}
              disabled={unifying || selectedDriversToUnify.length < 2 || !realCedula.trim()}
              className="w-full py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-500/20 touch-target"
            >
              {unifying ? 'Unificando...' : 'Confirmar Unificación de Conductores'}
            </button>
          </GlassCard>
        </div>
      )}

      {/* DUPLICATES INTELLIGENT ASSISTANT MODAL */}
      {showDuplicatesAssistant && (
        <DuplicatesAssistantModal
          onClose={() => setShowDuplicatesAssistant(false)}
          onUnificationDone={(msg) => {
            setToast({
              type: 'success',
              title: 'Unificación Completada',
              message: typeof msg === 'string' ? msg : 'Registros unificados con éxito'
            });
            fetchDrivers();
            fetchDuplicatesMeta();
          }}
        />
      )}

      {/* DRIVER EDIT DETAIL MODAL CARD */}
      {selectedDriverForEdit && (
        <DriverDetailModal
          driver={selectedDriverForEdit}
          onClose={() => setSelectedDriverForEdit(null)}
          onDriverUpdated={(updatedDriver) => {
            setToast({
              type: 'success',
              title: 'Conductor Actualizado',
              message: `Se guardaron los cambios para ${updatedDriver.nombre_completo}`
            });
            fetchDrivers();
          }}
        />
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

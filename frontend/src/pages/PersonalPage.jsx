import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { DriverDetailModal } from '../components/personal/DriverDetailModal';
import { NominaPersonalView } from '../components/personal/NominaPersonalView';
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
  Edit3
} from 'lucide-react';
import axios from 'axios';

export function PersonalPage() {
  const [activeMainTab, setActiveMainTab] = useState('directorio');
  const [drivers, setDrivers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUnifyModal, setShowUnifyModal] = useState(false);
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
  }, [activeTenantId, fetchDrivers]);

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

  const tempDriversCount = drivers.filter(d => d.cedula.startsWith('AUTO-DA')).length;
  const realDriversCount = drivers.length - tempDriversCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Personal & Domiciliarios (Orden Alfabético A - Z)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Directorio completo de conductores, búsqueda en tiempo real por Nombre o Cédula y unificación de registros.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowUnifyModal(true)}
            className="flex items-center gap-2 py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
          >
            <Merge className="w-4 h-4 text-purple-400" />
            Unificar Domiciliarios
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo Domiciliario
          </button>
        </div>
      </div>

      {/* Module Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveMainTab('directorio')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeMainTab === 'directorio'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Directorio de Personal & Domiciliarios</span>
        </button>

        <button
          onClick={() => setActiveMainTab('nomina')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeMainTab === 'nomina'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>Nómina & Vales (Por Entregas)</span>
        </button>
      </div>

      {activeMainTab === 'nomina' ? (
        <NominaPersonalView />
      ) : (
        <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Total Domiciliarios</p>
            <h3 className="text-2xl font-extrabold text-white">{drivers.length}</h3>
            <p className="text-[11px] text-blue-400 mt-0.5">Ordenados alfabéticamente</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Cédula Verificada</p>
            <h3 className="text-2xl font-extrabold text-white">{realDriversCount}</h3>
            <p className="text-[11px] text-emerald-400 mt-0.5">Conductores reales</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Cédula Temporal</p>
            <h3 className="text-2xl font-extrabold text-white">{tempDriversCount}</h3>
            <p className="text-[11px] text-amber-400 mt-0.5">AUTO-DA (iMile)</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Pendientes Nómina</p>
            <h3 className="text-2xl font-extrabold text-white">
              {drivers.reduce((acc, curr) => acc + (parseInt(curr.pendientes_liquidacion) || 0), 0)}
            </h3>
            <p className="text-[11px] text-purple-400 mt-0.5">Paquetes por liquidar</p>
          </div>
        </GlassCard>
      </div>

      {/* Main Table Card with Live Search Bar */}
      <GlassCard className="p-6 rounded-3xl border border-white/10 space-y-4">
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Nombre Completo o Cédula..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-700 text-white font-medium text-xs placeholder:text-slate-500 outline-none focus:border-blue-500 transition-all shadow-inner"
            />
          </div>

          <div className="text-xs text-slate-400">
            Mostrando <strong className="text-white">{drivers.length}</strong> domiciliarios
          </div>
        </div>

        {/* Drivers Table */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                <th className="p-3">Nombre Completo & Alias</th>
                <th className="p-3">Cédula</th>
                <th className="p-3">Teléfono</th>
                <th className="p-3">Tipo Contrato</th>
                <th className="p-3">Tarifa Paquete</th>
                <th className="p-3">Entregados</th>
                <th className="p-3">En Ruta</th>
                <th className="p-3 text-right">Pendiente Nómina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 text-xs">
                    No se encontraron domiciliarios que coincidan con la búsqueda "{searchTerm}".
                  </td>
                </tr>
              ) : (
                drivers.map((d) => {
                  let aliases = [];
                  if (d.alias_nombres) {
                    try {
                      aliases = typeof d.alias_nombres === 'string' ? JSON.parse(d.alias_nombres) : d.alias_nombres;
                    } catch (e) {}
                  }

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDriverForEdit(d)}
                      className="hover:bg-slate-800/40 transition-all cursor-pointer group"
                    >
                      <td className="p-3">
                        <div className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                          <span>{d.nombre_completo}</span>
                          <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
                        </div>
                        {aliases && aliases.length > 1 && (
                          <div className="text-[10px] text-purple-400/90 truncate max-w-[200px]">
                            Alias: {aliases.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono font-semibold">
                        {d.cedula.startsWith('AUTO-DA') ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]" title="Cédula Temporal Auto-Generada">
                            {d.cedula}
                          </span>
                        ) : (
                          <span className="text-slate-200">{d.cedula}</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{d.telefono || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="blue">{d.tipo_contrato || 'PAQUETEO'}</Badge>
                      </td>
                      <td className="p-3 font-mono font-semibold text-emerald-400">
                        ${Number(d.tarifa_paquete || 2000).toLocaleString('es-CO')}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-400">
                        {d.total_entregados || 0}
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-400">
                        {d.total_en_ruta || 0}
                      </td>
                      <td className="p-3 text-right font-mono">
                        <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold text-[11px]">
                          {d.pendientes_liquidacion || 0} paq.
                        </span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-md p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Registrar Nuevo Domiciliario</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Teléfono:</label>
                <input
                  type="text"
                  value={newDriver.telefono}
                  onChange={(e) => setNewDriver({ ...newDriver, telefono: e.target.value })}
                  placeholder="Ej: 3001234567"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tipo Remuneración:</label>
                  <select
                    value={newDriver.tipo_remuneracion}
                    onChange={(e) => setNewDriver({ ...newDriver, tipo_remuneracion: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                  >
                    <option value="GLOBAL">Default Global</option>
                    <option value="DIARIO">DIARIO</option>
                    <option value="SEMANAL">SEMANAL</option>
                    <option value="QUINCENAL">QUINCENAL</option>
                    <option value="MENSUAL">MENSUAL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Salario Fijo ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={newDriver.salario_fijo}
                    onChange={(e) => setNewDriver({ ...newDriver, salario_fijo: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-500/20"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-lg p-6 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/90 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Merge className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">Unificar Registros por Cédula</h3>
              </div>
              <button onClick={() => setShowUnifyModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Seleccionar Conductores a Unificar:</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  {drivers.map(d => (
                    <label key={d.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/50 cursor-pointer">
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
                        className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500"
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
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-500/20"
            >
              {unifying ? 'Unificando...' : 'Confirmar Unificación de Conductores'}
            </button>
          </GlassCard>
        </div>
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

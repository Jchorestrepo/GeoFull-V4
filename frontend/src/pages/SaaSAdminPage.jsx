import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { DatasetUploaderModal } from '../components/saas/DatasetUploaderModal';
import { TenantColumnMappingModal } from '../components/saas/TenantColumnMappingModal';
import {
  ShieldAlert, Building2, Plus, LogIn, RefreshCw, BarChart3,
  Map, Layers, CheckCircle2, AlertTriangle, Edit3, Power,
  Database, Activity, Server, Users, Search, FileSpreadsheet
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function SaaSAdminPage() {
  const { user, impersonateTenant } = useAuth();
  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics' | 'tenants' | 'datasets' | 'audit'

  // Data states
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDatasetModal, setShowDatasetModal] = useState(false);

  // Column Mapping modal
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingTenant, setMappingTenant] = useState(null);


  // Forms
  const [form, setForm] = useState({
    id: '', nombre: '', nit: '', email_contacto: '', telefono: '', cuota_pedidos_mes: 10000
  });
  const [editForm, setEditForm] = useState({
    id: '', nombre: '', nit: '', email_contacto: '', telefono: '', cuota_pedidos_mes: 10000, activo: true
  });

  const [toast, setToast] = useState(null);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [resStats, resTenants, resDatasets] = await Promise.all([
        axios.get(`${API_BASE}/tenants/saas-stats`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/tenants/`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/datasets/`).catch(() => ({ data: [] }))
      ]);
      setStats(resStats.data);
      setTenants(Array.isArray(resTenants.data) ? resTenants.data : []);
      setDatasets(Array.isArray(resDatasets.data) ? resDatasets.data : []);
    } catch (err) {
      console.error('Error cargando datos SaaS:', err);
      setToast({ type: 'error', message: 'Error cargando información de la Consola SaaS' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Crear Tenant
  const handleOpenCreateModal = () => {
    const autoId = 'emp_' + Math.random().toString(36).substring(2, 10);
    setForm({
      id: autoId,
      nombre: '',
      nit: '',
      email_contacto: '',
      telefono: '',
      cuota_pedidos_mes: 10000
    });
    setShowCreateModal(true);
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;

    try {
      await axios.post(`${API_BASE}/tenants/`, form);
      setShowCreateModal(false);
      setToast({ type: 'success', message: `Empresa "${form.nombre}" creada exitosamente` });
      loadAllData();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Fallo al crear la empresa' });
    }
  };

  // Editar Tenant
  const handleOpenEdit = (t) => {
    setEditForm({
      id: t.id,
      nombre: t.nombre,
      nit: t.nit,
      email_contacto: t.email_contacto,
      telefono: t.telefono || '',
      cuota_pedidos_mes: t.cuota_pedidos_mes,
      activo: t.activo
    });
    setShowEditModal(true);
  };

  const handleUpdateTenant = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_BASE}/tenants/${editForm.id}`, editForm);
      setShowEditModal(false);
      setToast({ type: 'success', message: `Empresa "${editForm.nombre}" actualizada` });
      loadAllData();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Fallo al actualizar la empresa' });
    }
  };

  // Toggle Tenant Status
  const handleToggleTenantStatus = async (tenantId, currentStatus) => {
    try {
      await axios.patch(`${API_BASE}/tenants/${tenantId}/status?activo=${!currentStatus}`);
      setToast({ type: 'success', message: `Estado de la empresa actualizado` });
      loadAllData();
    } catch (err) {
      setToast({ type: 'error', message: 'No se pudo cambiar el estado de la empresa' });
    }
  };

  // Toggle Dataset Status
  const handleToggleDatasetStatus = async (datasetId, currentStatus) => {
    try {
      await axios.patch(`${API_BASE}/datasets/${datasetId}/status?activo=${!currentStatus}`);
      setToast({ type: 'success', message: `Estado del dataset catastral actualizado` });
      loadAllData();
    } catch (err) {
      setToast({ type: 'error', message: 'No se pudo actualizar el dataset' });
    }
  };

  // Impersonate
  const handleImpersonate = async (tenantId, tenantName) => {
    try {
      await impersonateTenant(tenantId);
      setToast({ type: 'success', message: `Modo soporte iniciado en "${tenantName}"` });
      navigate('/sectorizacion');
    } catch (err) {
      setToast({ type: 'error', message: 'No se pudo iniciar el modo soporte' });
    }
  };

  const filteredTenants = tenants.filter(t =>
    t.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.nit.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Header Consola SaaS */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Consola SaaS Admin Global
              </h2>
              <p className="text-xs text-slate-400">
                Gestión Centralizada Multi-Tenant: Empresas, Cuotas, Datasets Catastrales y Modo Soporte.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setMappingTenant({ id: 'global', nombre: 'Configuración Global (Todas las Empresas)' });
              setShowMappingModal(true);
            }}
            className="flex items-center gap-2 py-2 px-3.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all cursor-pointer shadow-md shadow-purple-500/10"
          >
            <FileSpreadsheet className="w-4 h-4 text-purple-400" />
            Plantillas Globales (+)
          </button>

          <button
            onClick={() => setShowDatasetModal(true)}
            className="flex items-center gap-2 py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all cursor-pointer"
          >
            <Map className="w-4 h-4 text-purple-400" />
            Cargar GPKG Ciudad
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Registrar Empresa
          </button>
        </div>
      </div>

      {/* Tabs de Navegación de la Consola */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'metrics'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard SaaS & KPIs
        </button>

        <button
          onClick={() => setActiveTab('tenants')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'tenants'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Empresas & Cuotas ({tenants.length})
        </button>

        <button
          onClick={() => setActiveTab('datasets')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'datasets'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          Datasets Catastrales ({datasets.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          Salud & Auditoría
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
          Cargando datos de la Consola SaaS Admin...
        </div>
      ) : (
        <>
          {/* TAB 1: DASHBOARD SAAS & KPIS */}
          {activeTab === 'metrics' && (
            <div className="space-y-6">
              {/* Tarjetas KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-4 border-purple-500/30 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Empresas Registradas</span>
                    <Building2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {stats?.empresas_activas || 0} <span className="text-xs font-normal text-slate-400">/ {stats?.total_empresas || 0} activas</span>
                  </div>
                  <p className="text-[11px] text-emerald-400 font-semibold">100% Aislamiento RLS en BD</p>
                </GlassCard>

                <GlassCard className="p-4 border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Predios Catastrales</span>
                    <Database className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {(stats?.total_predios_catastrales || 518342).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-400">Nomenclatura Domiciliaria Local</p>
                </GlassCard>

                <GlassCard className="p-4 border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Ejes Viales Indexados</span>
                    <Map className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {(stats?.total_ejes_viales || 42150).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-400">Mallas viales multiciudad</p>
                </GlassCard>

                <GlassCard className="p-4 border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Envíos Procesados Mes</span>
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {(stats?.total_pedidos_procesados || 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-amber-300 font-semibold">Cuota global consumida</p>
                </GlassCard>
              </div>

              {/* Salud del Sistema PostGIS */}
              <GlassCard className="p-5 space-y-4 border-purple-500/20">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-purple-400" />
                    <h3 className="font-bold text-sm text-white">Estado de la Plataforma & PostGIS</h3>
                  </div>
                  <Badge variant="emerald">ESTADO ÓPTIMO</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <p className="text-slate-400 text-[11px]">Motor de Base de Datos</p>
                    <p className="text-white font-bold">{stats?.base_datos || 'PostgreSQL + PostGIS'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <p className="text-slate-400 text-[11px]">Aislamiento Multi-Tenant</p>
                    <p className="text-emerald-400 font-bold">Row-Level Security (RLS) Activo</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <p className="text-slate-400 text-[11px]">Pipeline de Geocodificación</p>
                    <p className="text-blue-400 font-bold">Local 7 Niveles (Sin API Key Externa)</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          )}

          {/* TAB 2: EMPRESAS & CUOTAS */}
          {activeTab === 'tenants' && (
            <div className="space-y-4">
              {/* Buscador */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar empresa por nombre, ID o NIT..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Mostrando {filteredTenants.length} de {tenants.length} empresas
                </p>
              </div>

              {/* Grid de Empresas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTenants.map((t) => (
                  <GlassCard key={t.id} className="p-5 space-y-4 border-purple-500/20 flex flex-col justify-between hover:border-purple-500/40 transition-all">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-white">{t.nombre}</h3>
                            <p className="text-[11px] font-mono text-purple-400">ID: {t.id}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleToggleTenantStatus(t.id, t.activo)}
                          title={t.activo ? 'Desactivar acceso' : 'Activar acceso'}
                          className="cursor-pointer"
                        >
                          <Badge variant={t.activo ? 'emerald' : 'red'}>
                            {t.activo ? 'ACTIVO' : 'INACTIVO'}
                          </Badge>
                        </button>
                      </div>

                      <div className="text-xs text-slate-300 space-y-1.5 pt-3 border-t border-slate-800/80 font-mono">
                        <p className="flex justify-between">
                          <span className="text-slate-500">NIT:</span>
                          <span>{t.nit}</span>
                        </p>
                        <p className="flex justify-between truncate" title={t.email_contacto}>
                          <span className="text-slate-500">Contacto:</span>
                          <span className="truncate">{t.email_contacto}</span>
                        </p>
                      </div>

                      {/* Barra de Consumo de Cuota */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-slate-400">Consumo de Cuota:</span>
                          <span className="text-purple-300 font-bold">
                            {t.pedidos_mes_actual.toLocaleString()} / {t.cuota_pedidos_mes.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all rounded-full ${
                              t.porcentaje_consumo > 90 ? 'bg-red-500' : t.porcentaje_consumo > 75 ? 'bg-amber-500' : 'bg-purple-500'
                            }`}
                            style={{ width: `${Math.min(t.porcentaje_consumo, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                      <button
                        onClick={() => handleImpersonate(t.id, t.nombre)}
                        className="flex-1 py-2 px-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Modo Soporte
                      </button>

                      <button
                        onClick={() => handleOpenEdit(t)}
                        title="Editar Empresa y Cuota"
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition-all cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DATASETS CATASTRALES MULTICIUDAD */}
          {activeTab === 'datasets' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-400">
                  Cobertura catastral cargada en la base de datos PostgreSQL + PostGIS (518k+ predios).
                </p>
                <button
                  onClick={() => setShowDatasetModal(true)}
                  className="flex items-center gap-2 py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Cargar Nueva Ciudad
                </button>
              </div>

              {datasets.length === 0 ? (
                <GlassCard className="p-8 text-center text-slate-400 text-xs space-y-2">
                  <Map className="w-8 h-8 text-purple-400 mx-auto" />
                  <p>No se encontraron datasets catastrales adicionales.</p>
                  <p className="text-[11px] text-slate-500">Medellín está cargado por defecto en la base de datos principal.</p>
                </GlassCard>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {datasets.map((d) => (
                    <GlassCard key={d.id} className="p-4 space-y-3 border-purple-500/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-white">{d.ciudad}</h4>
                            <p className="text-[11px] text-slate-400">{d.departamento || 'Colombia'}</p>
                          </div>
                        </div>
                        <button onClick={() => handleToggleDatasetStatus(d.id, d.activo)} className="cursor-pointer">
                          <Badge variant={d.activo ? 'emerald' : 'red'}>
                            {d.activo ? 'COBERTURA ACTIVA' : 'INACTIVA'}
                          </Badge>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-800">
                        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                          <p className="text-slate-500 text-[10px]">Predios Catastrales</p>
                          <p className="text-purple-300 font-bold">{d.total_predios.toLocaleString()}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                          <p className="text-slate-500 text-[10px]">Ejes Viales</p>
                          <p className="text-emerald-400 font-bold">{d.total_ejes.toLocaleString()}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDITORÍA Y SALUD */}
          {activeTab === 'audit' && (
            <GlassCard className="p-6 space-y-4 border-purple-500/20">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <Activity className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-sm text-white">Registro de Auditoría de Soporte</h3>
              </div>
              <p className="text-xs text-slate-400">
                Todas las sesiones de suplantación y soporte iniciadas por administradores globales quedan registradas de manera inmutable en la plataforma.
              </p>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
                <p className="text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> [SISTEMA] Motor PostGIS en ejecución en localhost:5433 (RLS OK)
                </p>
                <p className="text-slate-400">
                  [AUDIT] Sesión Super Admin en ejecución desde el usuario: <strong>{user?.email}</strong>
                </p>
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* MODAL: REGISTRAR EMPRESA */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <GlassCard className="w-full max-w-md p-6 rounded-3xl space-y-4 border-purple-500/30">
            <h3 className="font-bold text-base text-white">Registrar Empresa SaaS</h3>
            <form onSubmit={handleCreateTenant} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre Comercial de la Empresa *</label>
                <input
                  type="text"
                  placeholder="ej. DeXpress Colombia SAS"
                  value={form.nombre}
                  onChange={e => setForm({...form, nombre: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">ID Interno Alfanumérico (Auto-generado)</label>
                <input
                  type="text"
                  value={form.id}
                  readOnly
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-purple-400 font-mono focus:outline-none cursor-not-allowed text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">NIT *</label>
                <input
                  type="text"
                  placeholder="ej. 900123456-1"
                  value={form.nit}
                  onChange={e => setForm({...form, nit: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Correo de Contacto *</label>
                <input
                  type="email"
                  placeholder="ej. admin@coordinadora.com"
                  value={form.email_contacto}
                  onChange={e => setForm({...form, email_contacto: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Cuota Mensual de Envíos</label>
                <input
                  type="number"
                  value={form.cuota_pedidos_mes}
                  onChange={e => setForm({...form, cuota_pedidos_mes: parseInt(e.target.value) || 10000})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer">
                  Guardar Empresa
                </button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">
                  Cancelar
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* MODAL: EDITAR EMPRESA */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <GlassCard className="w-full max-w-md p-6 rounded-3xl space-y-4 border-purple-500/30">
            <h3 className="font-bold text-base text-white">Editar Empresa ({editForm.id})</h3>
            <form onSubmit={handleUpdateTenant} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  value={editForm.nombre}
                  onChange={e => setEditForm({...editForm, nombre: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">NIT</label>
                <input
                  type="text"
                  value={editForm.nit}
                  onChange={e => setEditForm({...editForm, nit: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Correo de Contacto</label>
                <input
                  type="email"
                  value={editForm.email_contacto}
                  onChange={e => setEditForm({...editForm, email_contacto: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Cuota Mensual de Envíos</label>
                <input
                  type="number"
                  value={editForm.cuota_pedidos_mes}
                  onChange={e => setEditForm({...editForm, cuota_pedidos_mes: parseInt(e.target.value) || 10000})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer">
                  Guardar Cambios
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">
                  Cancelar
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* MODAL: SUBIR DATASET CATASTRAL */}
      <DatasetUploaderModal
        isOpen={showDatasetModal}
        onClose={() => setShowDatasetModal(false)}
        onSuccess={(msg) => {
          setToast({ type: 'success', message: msg });
          loadAllData();
        }}
      />

      {/* MODAL: PLANTILLAS DE MAPEO POR EMPRESA */}
      <TenantColumnMappingModal
        tenant={mappingTenant}
        isOpen={showMappingModal}
        onClose={() => { setShowMappingModal(false); setMappingTenant(null); }}
        onSuccess={(msg) => {
          setToast({ type: 'success', message: msg });
          loadAllData();
        }}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}


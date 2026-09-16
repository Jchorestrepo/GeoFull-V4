import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { ShieldAlert, Building2, Plus, Check, LogIn, ExternalLink, RefreshCw } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

export function SaaSAdminPage() {
  const { user, impersonateTenant } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    id: '', nombre: '', nit: '', email_contacto: '', telefono: '', cuota_pedidos_mes: 10000
  });
  const [toast, setToast] = useState(null);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/tenants/`);
      setTenants(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error cargando empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!form.id.trim() || !form.nombre.trim()) return;

    try {
      await axios.post(`${API_BASE}/tenants/`, form);
      setShowModal(false);
      setForm({ id: '', nombre: '', nit: '', email_contacto: '', telefono: '', cuota_pedidos_mes: 10000 });
      setToast({ type: 'success', message: `Empresa "${form.nombre}" registrada en la consola SaaS` });
      fetchTenants();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Fallo al crear la empresa' });
    }
  };

  const handleImpersonate = async (tenantId, tenantName) => {
    try {
      await impersonateTenant(tenantId);
      setToast({ type: 'success', message: `Modo soporte iniciado en "${tenantName}"` });
    } catch (err) {
      console.error('Error en suplantación:', err);
      setToast({ type: 'error', message: 'No se pudo iniciar el modo soporte' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-purple-400" />
            Consola SaaS Admin (Super Admin Global)
          </h2>
          <p className="text-xs text-slate-400 mt-1">Gestión global de Empresas, Planes de Cobro, Cuotas y Modo Soporte.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Registrar Nueva Empresa
        </button>
      </div>

      {/* Grid de Empresas */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
          Cargando empresas registradas...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((t) => (
            <GlassCard key={t.id} className="p-5 space-y-4 border-purple-500/20 flex flex-col justify-between">
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
                  <Badge variant={t.activo ? 'emerald' : 'red'}>{t.activo ? 'ACTIVO' : 'INACTIVO'}</Badge>
                </div>

                <div className="text-xs text-slate-300 space-y-1.5 pt-3 border-t border-slate-800 font-mono">
                  <p className="flex justify-between">
                    <span className="text-slate-500">NIT:</span>
                    <span>{t.nit}</span>
                  </p>
                  <p className="flex justify-between truncate" title={t.email_contacto}>
                    <span className="text-slate-500">Contacto:</span>
                    <span className="truncate">{t.email_contacto}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-500">Cuota Mes:</span>
                    <span className="text-purple-300 font-bold">{t.cuota_pedidos_mes.toLocaleString()} envíos</span>
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleImpersonate(t.id, t.nombre)}
                  className="w-full py-2 px-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Ingresar en Modo Soporte
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Modal Crear Empresa */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <GlassCard className="w-full max-w-md p-6 rounded-3xl space-y-4 border-purple-500/30">
            <h3 className="font-bold text-base text-white">Registrar Empresa SaaS</h3>
            <form onSubmit={handleCreateTenant} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">ID Slug de la Empresa</label>
                <input
                  type="text"
                  placeholder="ej. coordinadora"
                  value={form.id}
                  onChange={e => setForm({...form, id: e.target.value.toLowerCase().trim()})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  placeholder="ej. Coordinadora Express S.A.S."
                  value={form.nombre}
                  onChange={e => setForm({...form, nombre: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">NIT</label>
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
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Correo de Contacto / Admin</label>
                <input
                  type="email"
                  placeholder="ej. admin@coordinadora.com"
                  value={form.email_contacto}
                  onChange={e => setForm({...form, email_contacto: e.target.value})}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer">
                  Guardar Empresa
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">
                  Cancelar
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, UserPlus, Edit2, Trash2, Shield, Phone, MessageSquare, Check, X, RefreshCw } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Toast } from '../ui/Toast';

const API_BASE = 'http://localhost:8000/api/v1';

export function TeamManager() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);

  const [formData, setFormData] = useState({
    nombre_completo: '',
    email: '',
    rol: 'supervisor',
    telefono: '',
    activo: true,
  });

  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/team/`, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      setTeam(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error cargando equipo:', err);
      showToast('Error al cargar integrantes del equipo', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, [tenantId]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      nombre_completo: '',
      email: '',
      rol: 'supervisor',
      telefono: '',
      activo: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (member) => {
    setEditingId(member.id);
    setFormData({
      nombre_completo: member.nombre_completo,
      email: member.email,
      rol: member.rol,
      telefono: member.telefono || '',
      activo: member.activo,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre_completo.trim() || !formData.email.trim()) {
      showToast('Nombre y correo son requeridos', 'error');
      return;
    }

    try {
      if (editingId) {
        await axios.put(`${API_BASE}/team/${editingId}`, formData, {
          headers: { 'X-Tenant-ID': tenantId }
        });
        showToast(`Integrante "${formData.nombre_completo}" actualizado`, 'success');
      } else {
        await axios.post(`${API_BASE}/team/`, formData, {
          headers: { 'X-Tenant-ID': tenantId }
        });
        showToast(`Integrante "${formData.nombre_completo}" registrado`, 'success');
      }
      setShowModal(false);
      fetchTeam();
    } catch (err) {
      console.error('Error guardando integrante:', err);
      const detail = err.response?.data?.detail || 'Error al guardar integrante del equipo';
      showToast(detail, 'error');
    }
  };

  const handleDelete = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de revocar el acceso a "${nombre}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/team/${id}`, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      showToast(`Acceso a "${nombre}" revocado exitosamente`, 'success');
      fetchTeam();
    } catch (err) {
      showToast('Error al revocar acceso', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header & botón añadir */}
      <GlassCard className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Gestión de Equipo & Supervisores</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Administra los supervisores, jefes de zona y administradores autorizados para operar la plataforma.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-lg shadow-purple-500/20 flex-shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Registrar Integrante
        </button>
      </GlassCard>

      {/* Tabla de usuarios */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Integrantes Registrados ({team.length})
          </h4>
          <button
            onClick={fetchTeam}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/60 border border-slate-700/60 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
            Cargando equipo de trabajo...
          </div>
        ) : team.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-700/60 rounded-xl bg-slate-900/30">
            No hay integrantes registrados en el equipo. Registra el primero arriba.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-900/40">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Correo Electrónico</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Contacto Directo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                {team.map((usr) => (
                  <tr key={usr.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">
                      {usr.nombre_completo}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {usr.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                        usr.rol === 'admin_empresa' || usr.rol === 'admin' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                        usr.rol === 'supervisor' || usr.rol === 'jefe_zona' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                        'bg-slate-500/10 text-slate-400 border-slate-500/30'
                      }`}>
                        {usr.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {usr.telefono ? (
                        <a
                          href={`https://wa.me/57${usr.telefono.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          {usr.telefono}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        usr.activo ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${usr.activo ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        {usr.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(usr)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors"
                          title="Editar Integrante"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(usr.id, usr.nombre_completo)}
                          className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                          title="Revocar Acceso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {editingId ? 'Editar Integrante del Equipo' : 'Registrar Nuevo Integrante'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  placeholder="Ej. Carlos Restrepo"
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Celular (para WhatsApp)</label>
                <input
                  type="text"
                  placeholder="Ej. 3001234567"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Rol en Empresa</label>
                  <select
                    value={formData.rol}
                    onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="supervisor">Supervisor / Jefe Zona</option>
                    <option value="admin_empresa">Administrador Empresa</option>
                    <option value="operario">Operario Bodega</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Estado</label>
                  <select
                    value={formData.activo ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, activo: e.target.value === 'true' })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white"
                >
                  {editingId ? 'Guardar Cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

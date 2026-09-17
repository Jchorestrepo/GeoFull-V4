import React, { useState } from 'react';
import axios from 'axios';
import { ShieldAlert, Trash2, AlertTriangle, RefreshCw, CheckCircle2, Package, Layers, Users } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Toast } from '../ui/Toast';
import { dataCache } from '../../lib/dataCache';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function SystemMaintenance() {
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSinglePurge = async (type, endpoint, label) => {
    if (!window.confirm(`¿Estás seguro de eliminar ${label}? Esta acción no se puede deshacer.`)) return;

    setActionLoading(type);
    try {
      const res = await axios.post(`${API_BASE}/maintenance/${endpoint}`, {}, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      dataCache.invalidateAll();
      showToast(res.data.mensaje || `${label} eliminados exitosamente`, 'success');
    } catch (err) {
      console.error('Error en purga parcial:', err);
      const detail = err.response?.data?.detail || 'Error al ejecutar la purga parcial';
      showToast(detail, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFullPurge = async (e) => {
    e.preventDefault();
    if (confirmText.trim().toUpperCase() !== 'ELIMINAR TODO') {
      showToast("Escribe exactamente 'ELIMINAR TODO' para confirmar", 'error');
      return;
    }

    setClearing(true);
    try {
      const res = await axios.post(`${API_BASE}/maintenance/purge-all`, {
        confirmation: confirmText.trim().toUpperCase()
      }, {
        headers: { 'X-Tenant-ID': tenantId }
      });

      dataCache.invalidateAll();
      showToast(res.data.mensaje || 'Ambiente completamante purgado y reiniciado', 'success');
      setConfirmText('');
    } catch (err) {
      console.error('Error en purga total:', err);
      const detail = err.response?.data?.detail || 'Error al purgar el ambiente de la empresa';
      showToast(detail, 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Mantenimiento del Sistema & Purga de Datos</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Herramientas administrativas para vaciar registros, resetear ambiente de trabajo o eliminar datos por módulo.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Tarjetas de Purga Parcial */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Purga Pedidos */}
        <GlassCard className="p-5 border-amber-500/20 bg-amber-500/5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-white">Vaciar Solo Pedidos</h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Elimina únicamente el paquete de pedidos, guía por guía, conservando zonas y lista de conductores.
            </p>
          </div>
          <button
            onClick={() => handleSinglePurge('pedidos', 'purge-orders', 'los pedidos')}
            disabled={actionLoading === 'pedidos'}
            className="w-full py-2 px-3 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'pedidos' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Vaciar Pedidos
          </button>
        </GlassCard>

        {/* Purga Zonas GeoJSON */}
        <GlassCard className="p-5 border-blue-500/20 bg-blue-500/5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold text-white">Vaciar Solo Zonas</h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Elimina todos los polígonos GeoJSON registrados en la empresa para volver a cargar la sectorización.
            </p>
          </div>
          <button
            onClick={() => handleSinglePurge('zonas', 'purge-zones', 'las zonas GeoJSON')}
            disabled={actionLoading === 'zonas'}
            className="w-full py-2 px-3 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'zonas' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Vaciar Zonas GeoJSON
          </button>
        </GlassCard>

        {/* Purga Conductores */}
        <GlassCard className="p-5 border-purple-500/20 bg-purple-500/5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-white">Vaciar Conductores</h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Elimina los registros de domiciliarios y sus tarifas asociadas en la empresa.
            </p>
          </div>
          <button
            onClick={() => handleSinglePurge('conductores', 'purge-drivers', 'la lista de conductores')}
            disabled={actionLoading === 'conductores'}
            className="w-full py-2 px-3 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'conductores' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Vaciar Conductores
          </button>
        </GlassCard>
      </div>

      {/* ZONA DE PELIGRO: LIMPIAR AMBIENTE COMPLETO */}
      <GlassCard className="p-6 border-red-500/30 bg-red-500/5 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Zona de Peligro: Limpiar Ambiente Completo</h3>
              <Badge variant="titanium" className="bg-red-500/10 text-red-400 border-red-500/30">
                Sede #{tenantId}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Esta acción eliminará de forma irreversible la totalidad de los datos en este ambiente de empresa:
            </p>
            <ul className="text-xs text-slate-400 list-disc list-inside space-y-1 font-mono pl-1">
              <li>📦 Todos los pedidos e historial de sectorización</li>
              <li>🗺️ Polígonos de zonas personalizadas GeoJSON</li>
              <li>🛵 Conductores, alias y nómina de entregas</li>
              <li>💰 Conciliaciones y adelantos de préstamos</li>
            </ul>
            <p className="text-[11px] text-red-400 font-semibold pt-1">
              ⚠️ Esta acción no se puede deshacer. Asegúrate de estar en la empresa correcta.
            </p>
          </div>
        </div>

        <form onSubmit={handleFullPurge} className="pt-4 border-t border-slate-800 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Para confirmar la eliminación total, escribe exactamente{' '}
              <span className="font-mono text-white font-bold bg-slate-800 px-2 py-0.5 rounded border border-slate-700 select-none">
                ELIMINAR TODO
              </span>{' '}
              abajo:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Escribe ELIMINAR TODO..."
              className="w-full max-w-md bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500"
              disabled={clearing}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={confirmText.trim().toUpperCase() !== 'ELIMINAR TODO' || clearing}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
              confirmText.trim().toUpperCase() === 'ELIMINAR TODO' && !clearing
                ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-red-500/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            {clearing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Vaciando Ambiente Completo...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Limpiar Ambiente Completo (Empresa: {tenantId})
              </>
            )}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

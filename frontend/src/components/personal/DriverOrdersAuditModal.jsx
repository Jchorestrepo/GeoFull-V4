import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  PackageCheck,
  X,
  Search,
  Download,
  Share2,
  Copy,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export function DriverOrdersAuditModal({
  driverId,
  driverName,
  fechaInicio,
  fechaFin,
  onClose
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedGuia, setCopiedGuia] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/v1/reconciliation/payroll/driver-orders', {
          params: {
            domiciliario_id: driverId,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
          }
        });
        setData(res.data);
      } catch (err) {
        console.error("Error al cargar guías de conductor", err);
      } finally {
        setLoading(false);
      }
    };

    if (driverId) {
      fetchOrders();
    }
  }, [driverId, fechaInicio, fechaFin]);

  const orders = data?.orders || [];
  const filteredOrders = orders.filter(o => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    return (
      (o.guia || '').toLowerCase().includes(s) ||
      (o.cliente || '').toLowerCase().includes(s) ||
      (o.direccion || '').toLowerCase().includes(s) ||
      (o.zona_nombre || '').toLowerCase().includes(s)
    );
  });

  const handleCopyGuia = (guia) => {
    navigator.clipboard.writeText(guia);
    setCopiedGuia(guia);
    setTimeout(() => setCopiedGuia(null), 1500);
  };

  const handleExportExcel = () => {
    if (orders.length === 0) return;
    const rows = orders.map((o, idx) => ({
      'No.': idx + 1,
      'Número de Guía': o.guia,
      'Fecha Entrega': o.fecha_entrega || 'N/A',
      'Cliente': o.cliente,
      'Dirección': o.direccion,
      'Zona / Sector': o.zona_nombre,
      'Tarifa Aplicada': data?.tarifa_paquete || 2000,
      'Estado': o.estado,
      'Observaciones': o.observaciones || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Guias_Entregadas");
    const safeName = (driverName || 'Conductor').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `Guias_${safeName}_${fechaInicio}_al_${fechaFin}.xlsx`);
  };

  const handleShareWhatsApp = () => {
    let msg = `📦 *DETALLE DE ENTREGAS — GEOFULL V4*\n`;
    msg += `👤 *Conductor:* ${data?.nombre_completo || driverName}\n`;
    msg += `🪪 *Cédula:* ${data?.cedula || 'N/A'}\n`;
    msg += `📅 *Período:* ${fechaInicio} al ${fechaFin}\n`;
    msg += `📊 *Total Guías Entregadas:* ${data?.total_guias || 0} paquetes\n`;
    msg += `💰 *Valor Liquidado:* $${Number(data?.monto_total_entregas || 0).toLocaleString('es-CO')} ($${Number(data?.tarifa_paquete || 2000).toLocaleString('es-CO')}/paq)\n\n`;
    msg += `_Verificado y auditado en sistema GeoFull V4_`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  return (
    <div className="modal-overlay">
      <GlassCard className="modal-sheet w-full max-w-4xl p-0 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/95 text-white flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-slate-950/70 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <PackageCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white">
                  Auditoría de Entregas: {data?.nombre_completo || driverName}
                </h3>
                <Badge variant="emerald">
                  {data?.total_guias || orders.length} guías
                </Badge>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>CC: {data?.cedula || 'N/A'}</span>
                <span>•</span>
                <span className="text-purple-300">Corte: {fechaInicio} al {fechaFin}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all touch-target"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Operational Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 mx-6 mt-4 rounded-2xl bg-slate-950/80 border border-white/5 flex-shrink-0">
          <div className="text-center p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Total Paquetes Entregados</p>
            <p className="text-xl font-extrabold text-white font-mono mt-0.5">{data?.total_guias || 0}</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Tarifa por Paquete</p>
            <p className="text-xl font-extrabold text-blue-300 font-mono mt-0.5">
              ${Number(data?.tarifa_paquete || 2000).toLocaleString('es-CO')}
            </p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Monto Total Liquidado</p>
            <p className="text-xl font-black text-purple-300 font-mono mt-0.5">
              ${Number(data?.monto_total_entregas || 0).toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* Toolbar with Search and Exports */}
        <div className="px-6 pt-4 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por guía, dirección, zona..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleExportExcel}
              disabled={orders.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all touch-target disabled:opacity-40"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Exportar Excel</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              disabled={orders.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all touch-target disabled:opacity-40"
            >
              <Share2 className="w-4 h-4" />
              <span>Resumen WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="p-6 pt-2 overflow-y-auto custom-scrollbar flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs">Cargando desglose de guías entregadas...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No se encontraron guías entregadas para los filtros aplicados.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-950/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/90">
                    <th className="p-3">#</th>
                    <th className="p-3">No. Guía</th>
                    <th className="p-3">Fecha y Hora Entrega</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Dirección de Destino</th>
                    <th className="p-3">Zona / Sector</th>
                    <th className="p-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredOrders.map((o, idx) => (
                    <tr key={o.id || idx} className="hover:bg-white/[0.04] transition-colors">
                      <td className="p-3 font-mono text-slate-500 text-[11px]">{idx + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-200">
                          <span>{o.guia}</span>
                          <button
                            onClick={() => handleCopyGuia(o.guia)}
                            title="Copiar Guía"
                            className="p-1 hover:text-blue-400 text-slate-500 transition-colors"
                          >
                            {copiedGuia === o.guia ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-400 text-[11px]">
                        {o.fecha_entrega || 'N/A'}
                      </td>
                      <td className="p-3 text-slate-300 font-medium">
                        {o.cliente}
                      </td>
                      <td className="p-3 text-slate-400 truncate max-w-[200px]" title={o.direccion}>
                        {o.direccion || 'Sin dirección'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-medium">
                          {o.zona_nombre || 'Sin Zona'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Badge variant="emerald">ENTREGADO</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>Mostrando {filteredOrders.length} de {orders.length} guías</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
          >
            Cerrar Detalle
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

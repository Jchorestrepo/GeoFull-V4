import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Search, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const PAGE_SIZE = 100;
const EXPORT_CHUNK = 500;
const DEFAULT_RANGE_DAYS = 15;

const toISODate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const defaultRange = () => {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - DEFAULT_RANGE_DAYS);
  return { desde: toISODate(desde), hasta: toISODate(hasta) };
};

const formatFecha = (iso) => (iso ? new Date(iso).toLocaleString('es-CO') : '');

export function UnscannedOrdersView() {
  // El rango se reinicia a los últimos 15 días en cada montaje (sin persistir)
  const [range] = useState(defaultRange);
  const [fechaDesde, setFechaDesde] = useState(range.desde);
  const [fechaHasta, setFechaHasta] = useState(range.hasta);
  const [guia, setGuia] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';
  const headers = { 'X-Tenant-ID': tenantId };
  const rangoInvalido = fechaDesde && fechaHasta && fechaDesde > fechaHasta;

  const buildParams = (extra) => ({
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
    ...(guia.trim() ? { guia: guia.trim() } : {}),
    ...extra,
  });

  useEffect(() => {
    if (rangoInvalido) {
      setError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${API_BASE}/zones/unscanned-orders`, {
          headers,
          params: buildParams({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
        });
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || 'Error al consultar pedidos sin escanear.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, guia, page, tenantId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const res = await axios.get(`${API_BASE}/zones/unscanned-orders`, {
          headers,
          params: buildParams({ limit: EXPORT_CHUNK, offset }),
        });
        rows.push(...res.data.items);
        total = res.data.total;
        offset += EXPORT_CHUNK;
        if (res.data.items.length === 0) break;
      }
      const hoja = rows.map((o) => ({
        'Guía': o.guia,
        'Fecha Importación': formatFecha(o.fecha_importacion),
        'Cliente': o.cliente,
        'Dirección': o.direccion,
        'Zona': o.zona_nombre,
        'Estado': o.estado,
      }));
      const ws = XLSX.utils.json_to_sheet(hoja);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sin_Escanear');
      XLSX.writeFile(wb, `Sin_escanear_${fechaDesde}_al_${fechaHasta}.xlsx`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al exportar pedidos.');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const inicio = data.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const fin = Math.min((page + 1) * PAGE_SIZE, data.total);

  const cambiarFiltro = (setter) => (e) => {
    setter(e.target.value);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 md:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              max={fechaHasta}
              onChange={cambiarFiltro(setFechaDesde)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono outline-none focus:border-blue-500 cursor-pointer"
            />
            <label className="text-xs text-slate-400 font-semibold">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde}
              onChange={cambiarFiltro(setFechaHasta)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono outline-none focus:border-blue-500 cursor-pointer"
            />
          </div>

          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={guia}
              onChange={cambiarFiltro(setGuia)}
              placeholder="Buscar por guía..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || loading || data.total === 0 || rangoInvalido}
            className="touch-target flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar Excel
          </button>
        </div>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">{error}</p>
        )}
      </GlassCard>

      <GlassCard className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <Badge variant="titanium">{data.total} pedidos sin escanear</Badge>
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 uppercase tracking-wider text-[10px]">
              <tr className="border-b border-white/10">
                <th className="px-4 py-2.5 font-semibold">Guía</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Dirección</th>
                <th className="px-4 py-2.5 font-semibold">Zona</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.items.map((o) => (
                <tr key={o.guia} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-mono font-bold text-blue-300 break-all">{o.guia}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-400 whitespace-nowrap">{formatFecha(o.fecha_importacion)}</td>
                  <td className="px-4 py-2.5 text-slate-200">{o.cliente}</td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-xs truncate">{o.direccion}</td>
                  <td className="px-4 py-2.5 text-slate-300">{o.zona_nombre || '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-amber-300">{o.estado}</td>
                </tr>
              ))}
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Sin pedidos pendientes de escanear en el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 text-xs text-slate-400">
            <span>Mostrando {inicio}–{fin} de {data.total}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="p-1.5 rounded-lg bg-slate-900/60 border border-white/10 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="p-1.5 rounded-lg bg-slate-900/60 border border-white/10 hover:text-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

export default UnscannedOrdersView;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Layers, Upload, Trash2, CheckCircle2, AlertCircle, RefreshCw, Power, FileJson } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Toast } from '../ui/Toast';
import { dataCache } from '../../lib/dataCache';

const API_BASE = 'http://localhost:8000/api/v1';

export function ZoneManager() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [nombreZona, setNombreZona] = useState('');
  const [codigoZona, setCodigoZona] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [toast, setToast] = useState(null);

  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';

  const fetchZones = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/zones/`, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      setZones(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error cargando zonas:', err);
      showToast('Error al cargar zonas de la empresa', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, [tenantId]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      if (!nombreZona) {
        // Sugerir nombre basado en el archivo
        const cleanName = file.name.replace(/\.(geojson|json)$/i, '').replace(/[-_]/g, ' ');
        setNombreZona(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    }
  };

  const handleUploadGeoJSON = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast('Por favor selecciona un archivo GeoJSON', 'error');
      return;
    }
    if (!nombreZona.trim()) {
      showToast('Ingresa un nombre descriptivo para la zona', 'error');
      return;
    }

    setUploading(true);
    try {
      const textContent = await selectedFile.text();
      let geojsonObj;
      try {
        geojsonObj = JSON.parse(textContent);
      } catch (pErr) {
        showToast('El archivo adjunto no es un JSON válido', 'error');
        setUploading(false);
        return;
      }

      const payload = {
        nombre_zona: nombreZona.trim(),
        codigo_zona: codigoZona.trim() || 'ZONA-CUSTOM',
        geojson_geometry: geojsonObj
      };

      const res = await axios.post(`${API_BASE}/zones/import-geojson`, payload, {
        headers: { 'X-Tenant-ID': tenantId }
      });

      const totalCount = res.data?.total_importados || 1;
      const msg = res.data?.mensaje || `¡${totalCount} sector(es) importado(s) exitosamente!`;
      showToast(msg, 'success');
      setNombreZona('');
      setCodigoZona('');
      setSelectedFile(null);
      const fileInput = document.getElementById('geojson-file-input');
      if (fileInput) fileInput.value = '';
      dataCache.invalidateZones();
      fetchZones();
    } catch (err) {
      console.error('Error importando GeoJSON:', err);
      const detail = err.response?.data?.detail || 'Error al procesar archivo GeoJSON';
      showToast(detail, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (zoneId) => {
    try {
      const res = await axios.put(`${API_BASE}/zones/${zoneId}/toggle`, {}, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      showToast(`Estado de zona actualizado a ${res.data.activa ? 'Activa' : 'Inactiva'}`, 'info');
      dataCache.invalidateZones();
      fetchZones();
    } catch (err) {
      showToast('Error al cambiar estado de zona', 'error');
    }
  };

  const handleDeleteZone = async (zoneId, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar la zona "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await axios.delete(`${API_BASE}/zones/${zoneId}`, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      showToast(`Zona "${name}" eliminada exitosamente`, 'success');
      dataCache.invalidateZones();
      fetchZones();
    } catch (err) {
      showToast('Error al eliminar zona', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Tarjeta de Importación */}
      <GlassCard className="p-6 border-blue-500/20 bg-blue-500/5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Upload className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Subir Zonas y Polígonos GeoJSON</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Carga archivos GeoJSON (<code className="text-blue-300">.geojson</code> / <code className="text-blue-300">.json</code>) con polígonos de sectores para delimitación geográfica.
            </p>
          </div>
        </div>

        <form onSubmit={handleUploadGeoJSON} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-700/50 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre Descriptivo</label>
            <input
              type="text"
              placeholder="Ej. Sector Envigado Sur"
              value={nombreZona}
              onChange={(e) => setNombreZona(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Código de Zona (Opcional)</label>
            <input
              type="text"
              placeholder="Ej. ZONA-05"
              value={codigoZona}
              onChange={(e) => setCodigoZona(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Archivo GeoJSON</label>
            <input
              id="geojson-file-input"
              type="file"
              accept=".geojson,.json"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:text-xs file:font-semibold file:bg-blue-600/30 file:text-blue-300 file:border file:border-blue-500/40 hover:file:bg-blue-600/50 file:cursor-pointer"
            />
          </div>

          <div className="md:col-span-3 flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-lg shadow-blue-500/20"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Procesando Polígonos GeoJSON...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Subir Zona a la Empresa
                </>
              )}
            </button>
          </div>
        </form>
      </GlassCard>

      {/* Listado de Zonas Cargadas */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Sectores Geográficos Registrados ({zones.length})</h3>
          </div>
          <button
            onClick={fetchZones}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/60 border border-slate-700/60 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            Cargando zonas de la empresa...
          </div>
        ) : zones.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-700/60 rounded-xl bg-slate-900/30">
            No hay polígonos GeoJSON registrados en esta empresa. Sube tu primer sector arriba.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map((z) => (
              <div
                key={z.id}
                className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                  z.activa
                    ? 'border-slate-700/80 bg-slate-900/50 hover:border-slate-600'
                    : 'border-slate-800/40 bg-slate-950/40 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: z.color || '#10b981' }}
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate" title={z.nombre}>
                      {z.nombre}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">
                      {z.codigo || 'S/N'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(z.id)}
                    title={z.activa ? 'Desactivar Zona' : 'Activar Zona'}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      z.activa
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteZone(z.id, z.nombre)}
                    title="Eliminar Zona"
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

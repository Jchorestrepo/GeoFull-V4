import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Upload, X, Map, Layers, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function DatasetUploaderModal({ isOpen, onClose, onSuccess }) {
  const [ciudad, setCiudad] = useState('');
  const [departamento, setDepartamento] = useState('Antioquia');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ciudad.trim() || !file) {
      setError('Por favor completa la ciudad y selecciona un archivo válido.');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('ciudad', ciudad);
    formData.append('departamento', departamento);
    formData.append('file', file);

    try {
      await axios.post(`${API_BASE}/datasets/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onSuccess(`Dataset catastral para "${ciudad.toUpperCase()}" indexado exitosamente.`);
      onClose();
    } catch (err) {
      console.error('Error al subir dataset:', err);
      setError(err.response?.data?.detail || 'Fallo al procesar e indexar el dataset catastral.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <GlassCard className="w-full max-w-lg p-6 rounded-3xl space-y-4 border-purple-500/30 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <Map className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Importar Dataset Catastral por Ciudad</h3>
            <p className="text-xs text-slate-400">Archivos GPKG / GeoJSON de Nomenclatura y Ejes Viales.</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Ciudad *</label>
              <input
                type="text"
                placeholder="ej. BOGOTA, CALI, MEDELLIN"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500 uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Departamento</label>
              <input
                type="text"
                placeholder="ej. Cundinamarca"
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Archivo GeoPackage (.gpkg) o GeoJSON (.geojson)</label>
            <div className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-950/40">
              <input
                type="file"
                accept=".gpkg,.geojson,.json,.zip"
                onChange={(e) => setFile(e.target.files[0] || null)}
                className="hidden"
                id="dataset-file-input"
              />
              <label htmlFor="dataset-file-input" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 text-purple-400 mx-auto" />
                <div className="text-xs text-slate-300">
                  {file ? (
                    <span className="font-bold text-purple-300 flex items-center justify-center gap-1">
                      <FileText className="w-4 h-4" /> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  ) : (
                    <span>Arrastra o selecciona el archivo <strong>.gpkg</strong> / <strong>.geojson</strong> catastral</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">Transformación automática a EPSG:4326 e indexación PostGIS</p>
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Procesando e Indexando...
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4" />
                  Indexar en PostGIS
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

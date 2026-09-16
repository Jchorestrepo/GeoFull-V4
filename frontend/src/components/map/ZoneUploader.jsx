import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Upload, Layers, Check, RefreshCw, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { dataCache } from '../../lib/dataCache';

export function ZoneUploader({ onZonesUploaded }) {
  const [zoneName, setZoneName] = useState('');
  const [zoneCode, setZoneCode] = useState('');
  const [fileContent, setFileContent] = useState(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        setFileContent(json);
        if (!zoneName) {
          setZoneName(file.name.replace(/\.[^/.]+$/, ""));
        }
      } catch (err) {
        alert("El archivo no contiene un JSON/GeoJSON válido.");
      }
    };
    reader.readAsText(file);
  };

  const handleUploadZone = async (e) => {
    e.preventDefault();
    if (!fileContent || !zoneName.trim()) {
      alert("Debes ingresar un nombre para la zona y seleccionar un GeoJSON válido.");
      return;
    }

    setUploading(true);

    try {
      await axios.post(
        '/api/v1/zones/import-geojson',
        {
          nombre_zona: zoneName,
          codigo_zona: zoneCode || 'ZONA-PROP',
          geojson_geometry: fileContent
        }
      );

      setZoneName('');
      setZoneCode('');
      setFileContent(null);
      setFileName('');
      dataCache.invalidateZones();
      onZonesUploaded?.();
    } catch (err) {
      console.error("Error al importar zona GeoJSON", err);
      alert(err.response?.data?.detail || "Error al guardar el polígono GeoJSON");
    } finally {
      setUploading(false);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3>Carga de Zonas GeoJSON de la Empresa</h3>
        </div>
        <Badge variant="titanium">PostGIS EPSG:4326</Badge>
      </div>

      <form onSubmit={handleUploadZone} className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Nombre de la Zona (*):</label>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Ej: Zona Poblado Sur"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Código Personalizado (Opcional):</label>
            <input
              type="text"
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
              placeholder="Ej: ZONA-01"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">Archivo GeoJSON (*.geojson, *.json):</label>
          <label className="p-4 border border-dashed border-slate-700 hover:border-blue-500/60 rounded-2xl flex items-center justify-center gap-3 cursor-pointer bg-slate-900/40">
            <Upload className="w-5 h-5 text-blue-400" />
            <span className="text-slate-300 text-xs font-medium">
              {fileName ? fileName : "Seleccionar archivo GeoJSON..."}
            </span>
            <input
              type="file"
              accept=".geojson,.json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={uploading || !fileContent || !zoneName.trim()}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
        >
          {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          <span>{uploading ? 'Guardando Zona...' : 'Importar Polígono GeoJSON'}</span>
        </button>
      </form>
    </GlassCard>
  );
}

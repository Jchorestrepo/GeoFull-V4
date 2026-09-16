import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Upload, FileSpreadsheet, Check, RefreshCw, X, PieChart, Truck, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';

export function RouteUploader({ onBatchComplete }) {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [showMapper, setShowMapper] = useState(false);
  const [mapping, setMapping] = useState({
    guia: '',
    domiciliario_nombre: '',
    delivered_time: ''
  });
  const [isSavedMapping, setIsSavedMapping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (jsonRows.length > 0) {
          const rawHeaders = jsonRows[0];
          const parsedHeaders = rawHeaders
            .map(h => String(h).trim())
            .filter(h => h !== '');

          const parsedRows = jsonRows.slice(1).map(rowArray => {
            const rowObj = {};
            parsedHeaders.forEach((h, idx) => {
              rowObj[h] = rowArray[idx] !== undefined ? String(rowArray[idx]).trim() : '';
            });
            return rowObj;
          }).filter(rowObj => Object.values(rowObj).some(val => val !== ''));

          setHeaders(parsedHeaders);
          setRows(parsedRows);

          // Auto-detectar columnas típicas de iMile / Rutas Asignadas
          const autoMap = { guia: '', domiciliario_nombre: '', delivered_time: '' };
          let loadedFromSaved = false;

          try {
            const tenantRes = await axios.get('/api/v1/tenants/empresa_demo/column-mapping');
            const saved = tenantRes.data;
            if (saved && saved.route_guia && parsedHeaders.includes(saved.route_guia) && saved.route_da && parsedHeaders.includes(saved.route_da)) {
              autoMap.guia = saved.route_guia;
              autoMap.domiciliario_nombre = saved.route_da;
              autoMap.delivered_time = saved.route_time && parsedHeaders.includes(saved.route_time) ? saved.route_time : '';
              loadedFromSaved = true;
            }
          } catch (err) {
            console.warn("No se pudo obtener plantilla previa de rutas:", err);
          }

          if (!loadedFromSaved) {
            parsedHeaders.forEach(h => {
              const lower = h.toLowerCase();
              if (lower.includes('waybill') || lower.includes('guia') || strMatch(lower, ['nro', 'codigo', 'tracking'])) {
                autoMap.guia = h;
              }
              if (lower.includes('da name') || lower.includes('da') || strMatch(lower, ['domiciliario', 'conductor', 'repartidor', 'courier', 'chofer'])) {
                autoMap.domiciliario_nombre = h;
              }
              if (lower.includes('delivered time') || lower.includes('delivered') || strMatch(lower, ['entrega', 'hora', 'fecha entrega'])) {
                autoMap.delivered_time = h;
              }
            });
          }

          setIsSavedMapping(loadedFromSaved);
          setMapping(autoMap);
          setShowMapper(true);
          setSummary(null);
        }
      } catch (err) {
        console.error("Error al leer archivo de rutas:", err);
        alert("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx, .xls) o CSV válido.");
      }
    };

    reader.readAsArrayBuffer(selected);
  };

  const strMatch = (str, keywords) => keywords.some(k => str.includes(k));

  const handleStartProcessing = async () => {
    if (!mapping.guia || !mapping.domiciliario_nombre) {
      alert("Debes seleccionar al menos la columna del 'Waybill / Guía' y del 'Domiciliario / Conductor'");
      return;
    }

    // Guardar preferencia de columnas de rutas
    try {
      await axios.post('/api/v1/tenants/empresa_demo/column-mapping', {
        guia: mapping.guia,
        direccion_original: mapping.guia,
        route_guia: mapping.guia,
        route_da: mapping.domiciliario_nombre,
        route_time: mapping.delivered_time
      });
    } catch (err) {
      console.warn("No se pudo guardar la plantilla de rutas:", err);
    }

    setUploading(true);
    setProgress(10);

    const routeItems = rows.map(r => ({
      guia: r[mapping.guia] || '',
      domiciliario_nombre: r[mapping.domiciliario_nombre] || 'SIN ASIGNAR',
      delivered_time: mapping.delivered_time ? r[mapping.delivered_time] : null,
      proveedor: 'iMile',
      datos_extra: r
    })).filter(i => i.guia !== '');

    try {
      setProgress(50);
      const res = await axios.post('/api/v1/reconciliation/process-routes', {
        items: routeItems
      });

      setProgress(100);
      setSummary(res.data);
      setShowMapper(false);
      setFile(null);
      onBatchComplete?.(res.data);
    } catch (err) {
      console.error("Error procesando lote de conciliación", err);
      alert(err.response?.data?.detail || "Ocurrió un error al procesar la planilla de rutas.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Truck className="w-4 h-4 text-blue-400" />
          <h3>Carga Masiva de Rutas iMile / Entregadas (.xlsx, .xls)</h3>
        </div>
        <Badge variant="blue">Conciliación Diaria</Badge>
      </div>

      {!showMapper && !summary ? (
        <label className="p-6 border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-900/40">
          <Upload className="w-8 h-8 mb-2 text-slate-400 animate-pulse" />
          <p className="text-xs font-semibold text-slate-200">Selecciona o arrastra tu archivo iMile / Rutas entregadas</p>
          <p className="text-[10px] text-slate-400 mt-1">Soporta 'Waybill No.', 'DA Name' y 'Delivered time'. Autocrea pedidos y conductores.</p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.ods,.tsv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      ) : summary ? (
        /* INFORMES POS-CONCILIACIÓN */
        <div className="space-y-4 p-4 bg-slate-950/80 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-emerald-400" />
              <h4 className="font-bold text-sm text-white">Informe Resumen de Conciliación</h4>
            </div>
            <Badge variant="emerald">{summary.total_procesados} Rutas Procesadas</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-[11px] text-emerald-400 font-semibold">Entregados</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.entregados_count}</p>
              <p className="text-[10px] text-emerald-300 font-mono">Con Fecha Entrega</p>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-[11px] text-amber-400 font-semibold">En Ruta (Asignados)</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.asignados_count}</p>
              <p className="text-[10px] text-amber-300 font-mono">Sin Fecha Entrega</p>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <p className="text-[11px] text-blue-400 font-semibold">Nuevos Creados</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.nuevos_creados}</p>
              <p className="text-[10px] text-blue-300 font-mono">Guías Conciliadas</p>
            </div>

            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
              <p className="text-[11px] text-purple-400 font-semibold">Conductores</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.conductores_involucrados}</p>
              <p className="text-[10px] text-purple-300 font-mono">DA Names Detectados</p>
            </div>
          </div>

          <button
            onClick={() => setSummary(null)}
            className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
          >
            Cargar Otra Planilla
          </button>
        </div>
      ) : (
        /* MAPEO DE COLUMNAS DE RUTAS */
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-200 font-semibold">{file?.name} ({rows.length} filas)</span>
              {isSavedMapping && (
                <Badge variant="emerald" className="flex items-center gap-1 text-[10px] ml-2">
                  <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400/20 animate-pulse" />
                  Mapeo iMile Reconocido
                </Badge>
              )}
            </div>
            <button onClick={() => setShowMapper(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Waybill / Guía (*):</label>
              <select
                value={mapping.guia}
                onChange={(e) => setMapping({ ...mapping, guia: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-medium"
              >
                <option value="">-- Seleccionar Columna --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Domiciliario (DA Name) (*):</label>
              <select
                value={mapping.domiciliario_nombre}
                onChange={(e) => setMapping({ ...mapping, domiciliario_nombre: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-medium"
              >
                <option value="">-- Seleccionar Columna --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Columna Delivered time (Opcional):</label>
              <select
                value={mapping.delivered_time}
                onChange={(e) => setMapping({ ...mapping, delivered_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300"
              >
                <option value="">-- Ninguna (Todo en Ruta / Asignado) --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* BARRA DE PROGRESO */}
          {uploading && (
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/80 border border-blue-500/30">
              <div className="flex justify-between text-xs text-blue-300 font-medium">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  Procesando entregas y vinculando domiciliarios...
                </span>
                <span className="font-mono font-bold text-white">{progress}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
                <div
                  className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleStartProcessing}
            disabled={uploading}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{uploading ? 'Conciliando Planilla iMile...' : 'Confirmar Mapeo & Conciliar Rutas'}</span>
          </button>
        </div>
      )}
    </GlassCard>
  );
}

import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Upload, FileSpreadsheet, Check, RefreshCw, X, PieChart, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export function ExcelUploader({ onBatchComplete }) {
  const { activeTenantId } = useAuth();
  const tenantId = activeTenantId || 'empresa_demo';
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [showMapper, setShowMapper] = useState(false);
  const [mapping, setMapping] = useState({
    guia: '',
    direccion_original: '',
    cliente: '',
    telefono_cliente: ''
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

          // Intentar obtener mapeo guardado de la empresa
          let finalMap = { guia: '', direccion_original: '', cliente: '', telefono_cliente: '' };
          let loadedFromSaved = false;

          try {
            const tenantRes = await axios.get(`/api/v1/tenants/${tenantId}/column-mapping`);
            const saved = tenantRes.data;

            if (saved && saved.guia && parsedHeaders.includes(saved.guia) && saved.direccion_original && parsedHeaders.includes(saved.direccion_original)) {
              finalMap = {
                guia: saved.guia,
                direccion_original: saved.direccion_original,
                cliente: saved.cliente && parsedHeaders.includes(saved.cliente) ? saved.cliente : '',
                telefono_cliente: saved.telefono_cliente && parsedHeaders.includes(saved.telefono_cliente) ? saved.telefono_cliente : ''
              };
              loadedFromSaved = true;
            }
          } catch (err) {
            console.warn("No se pudo obtener el mapeo previo del tenant:", err);
          }

          if (!loadedFromSaved) {
            // Auto-detectar por nombre de columna
            parsedHeaders.forEach(h => {
              const lower = h.toLowerCase();
              if (lower.includes('guia') || lower.includes('nro') || lower.includes('codigo') || lower.includes('tracking') || lower.includes('orden')) {
                finalMap.guia = h;
              }
              if (lower.includes('dir') || lower.includes('direccion') || lower.includes('domicilio') || lower.includes('destino')) {
                finalMap.direccion_original = h;
              }
              if (lower.includes('cli') || lower.includes('nombre') || lower.includes('destinatario') || lower.includes('comprador')) {
                finalMap.cliente = h;
              }
              if (lower.includes('tel') || lower.includes('cel') || lower.includes('phone') || lower.includes('contacto')) {
                finalMap.telefono_cliente = h;
              }
            });
          }

          setIsSavedMapping(loadedFromSaved);
          setMapping(finalMap);
          setShowMapper(true);
          setSummary(null);
        }
      } catch (err) {
        console.error("Error al decodificar Excel/CSV:", err);
        alert("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx, .xls) o CSV válido.");
      }
    };

    reader.readAsArrayBuffer(selected);
  };

  const handleStartProcessing = async () => {
    if (!mapping.guia || !mapping.direccion_original) {
      alert("Debes seleccionar al menos las columnas de 'Número de Guía' y 'Dirección'");
      return;
    }

    // Guardar el mapeo seleccionado para la empresa
    try {
      await axios.post(`/api/v1/tenants/${tenantId}/column-mapping`, mapping);
    } catch (err) {
      console.warn("No se pudo guardar la plantilla de mapeo de la empresa:", err);
    }

    setUploading(true);
    setProgress(0);

    const total = rows.length;
    let completed = 0;
    let exitososCount = 0;
    let fueraZonaCount = 0;
    let noLimpiadosCount = 0;

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const payload = {
        guia: row[mapping.guia] || `GUIA-${i + 1}`,
        direccion_original: row[mapping.direccion_original] || '',
        cliente: mapping.cliente ? row[mapping.cliente] : null,
        telefono_cliente: mapping.telefono_cliente ? row[mapping.telefono_cliente] : null,
        datos_extra: row
      };

      if (payload.direccion_original) {
        try {
          const res = await axios.post('/api/v1/orders/process-single', payload);

          const orderData = res.data;
          if (orderData.estado === 'FUERA_DE_ZONA') {
            fueraZonaCount++;
          } else if (!orderData.direccion_limpia || orderData.estado === 'REQUIERE_REVISIÓN') {
            noLimpiadosCount++;
          } else {
            exitososCount++;
          }
        } catch (err) {
          console.error("Error procesando fila", i, err);
          noLimpiadosCount++;
        }
      } else {
        noLimpiadosCount++;
      }

      completed++;
      setProgress(Math.round((completed / total) * 100));
    }

    const summaryData = {
      total,
      exitososCount,
      exitososPct: Math.round((exitososCount / total) * 100) || 0,
      fueraZonaCount,
      fueraZonaPct: Math.round((fueraZonaCount / total) * 100) || 0,
      noLimpiadosCount,
      noLimpiadosPct: Math.round((noLimpiadosCount / total) * 100) || 0
    };

    setSummary(summaryData);
    setUploading(false);
    setShowMapper(false);
    setFile(null);
    onBatchComplete?.(summaryData);
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <h3>Carga Masiva Excel / CSV (.xlsx, .xls)</h3>
        </div>
        <Badge variant="emerald">Soporte Nativo XLSX</Badge>
      </div>

      {!showMapper && !summary ? (
        <label className="p-6 border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-900/40">
          <Upload className="w-8 h-8 mb-2 text-slate-400 animate-pulse" />
          <p className="text-xs font-semibold text-slate-200">Selecciona o arrastra tu archivo Excel (.xlsx, .xls, .csv)</p>
          <p className="text-[10px] text-slate-400 mt-1">Guarda todas las columnas en BD y muestra Guía, Dirección, Cliente y Teléfono en pantalla</p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.ods,.tsv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      ) : summary ? (
        /* RESUMEN POS-IMPORTACIÓN */
        <div className="space-y-4 p-4 bg-slate-950/80 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-400" />
              <h4 className="font-bold text-sm text-white">Informe Resumen de Importación</h4>
            </div>
            <Badge variant="titanium">{summary.total} Pedidos</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-[11px] text-emerald-400 font-semibold">Geocodificados OK</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.exitososCount}</p>
              <p className="text-[10px] text-emerald-300 font-mono">{summary.exitososPct}% del lote</p>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-[11px] text-amber-400 font-semibold">Fuera de Zona</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.fueraZonaCount}</p>
              <p className="text-[10px] text-amber-300 font-mono">{summary.fueraZonaPct}% del lote</p>
            </div>

            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <p className="text-[11px] text-red-400 font-semibold">No Geocodificados</p>
              <p className="text-lg font-extrabold text-white mt-0.5">{summary.noLimpiadosCount}</p>
              <p className="text-[10px] text-red-300 font-mono">{summary.noLimpiadosPct}% del lote</p>
            </div>
          </div>

          <button
            onClick={() => setSummary(null)}
            className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
          >
            Cargar Otro Archivo
          </button>
        </div>
      ) : (
        /* MAPEO DE COLUMNAS & BARRA DE PROGRESO ANIMADA */
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-200 font-semibold">{file?.name} ({rows.length} filas)</span>
              {isSavedMapping && (
                <Badge variant="emerald" className="flex items-center gap-1 text-[10px] ml-2">
                  <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400/20 animate-pulse" />
                  Mapeo Guardado de Empresa Auto-Aplicado
                </Badge>
              )}
            </div>
            <button onClick={() => setShowMapper(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Número de Guía (*):</label>
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
              <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna de Dirección (*):</label>
              <select
                value={mapping.direccion_original}
                onChange={(e) => setMapping({ ...mapping, direccion_original: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-medium"
              >
                <option value="">-- Seleccionar Columna --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Columna Nombre de Cliente (Opcional):</label>
              <select
                value={mapping.cliente}
                onChange={(e) => setMapping({ ...mapping, cliente: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300"
              >
                <option value="">-- Ninguna --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Columna Teléfono (Opcional):</label>
              <select
                value={mapping.telefono_cliente}
                onChange={(e) => setMapping({ ...mapping, telefono_cliente: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300"
              >
                <option value="">-- Ninguna --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* BARRA DE PROGRESO ANIMADA */}
          {uploading && (
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/80 border border-blue-500/30">
              <div className="flex justify-between text-xs text-blue-300 font-medium">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  Procesando lote (Sanitizer + PostGIS + Sectorización)...
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
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{uploading ? 'Procesando Lote en PostGIS...' : 'Confirmar Mapeo & Procesar Lote'}</span>
          </button>
        </div>
      )}
    </GlassCard>
  );
}

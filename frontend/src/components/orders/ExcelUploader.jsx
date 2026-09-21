import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Upload, FileSpreadsheet, Check, RefreshCw, X, PieChart, ShieldAlert, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export function ExcelUploader({ onBatchComplete }) {
  const { activeTenantId } = useAuth();
  const tenantId = activeTenantId || 'empresa_demo';
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const [matchedVariantName, setMatchedVariantName] = useState('');

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setErrorModal(null);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (jsonRows.length === 0) {
          setErrorModal("El archivo subido está completamente vacío.");
          setFile(null);
          return;
        }

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

        // Consultar plantillas configuradas para la empresa o globales en SaaS
        let plantillas = [];
        try {
          const tenantRes = await axios.get(`/api/v1/tenants/${tenantId}/column-mapping`);
          plantillas = Array.isArray(tenantRes.data?.plantillas_sectorizacion)
            ? tenantRes.data.plantillas_sectorizacion
            : [];

          if (plantillas.length === 0 && tenantId !== 'global') {
            const globalRes = await axios.get('/api/v1/tenants/global/column-mapping');
            plantillas = Array.isArray(globalRes.data?.plantillas_sectorizacion)
              ? globalRes.data.plantillas_sectorizacion
              : [];
          }
        } catch (err) {
          console.warn("No se pudieron obtener las plantillas del tenant:", err);
        }

        // Buscar coincidencia 100% de encabezados requeridos (guia y direccion_original)
        let matchedVariant = null;
        for (const p of plantillas) {
          if (p.guia && parsedHeaders.includes(p.guia) && p.direccion_original && parsedHeaders.includes(p.direccion_original)) {
            matchedVariant = p;
            break;
          }
        }

        if (!matchedVariant) {
          // Ninguna plantilla coincide -> BLOQUEAR IMPORTACIÓN Y ALERTAR AL USUARIO
          setErrorModal(
            `El archivo subido ("${selected.name}") no coincide con ninguna de las plantillas de importación configuradas para la empresa activa. Por favor verifica que estés subiendo el archivo correcto o agrega la plantilla en la Consola SaaS.`
          );
          setFile(null);
          return;
        }

        // COINCIDENCIA ENCONTRADA -> PROCESAMIENTO AUTOMÁTICO DIRECTO (Opción B)
        setMatchedVariantName(matchedVariant.nombre || 'Plantilla Preconfigurada');
        await processBatchDirectly(parsedRows, matchedVariant);

      } catch (err) {
        console.error("Error al decodificar Excel/CSV:", err);
        setErrorModal("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx, .xls) o CSV válido.");
        setFile(null);
      }
    };

    reader.readAsArrayBuffer(selected);
  };

  const processBatchDirectly = async (parsedRows, mappingVariant) => {
    setUploading(true);
    setProgress(0);

    const total = parsedRows.length;
    let completed = 0;
    let exitososCount = 0;
    let fueraZonaCount = 0;
    let noLimpiadosCount = 0;

    for (let i = 0; i < total; i++) {
      const row = parsedRows[i];
      const payload = {
        guia: row[mappingVariant.guia] || `GUIA-${i + 1}`,
        direccion_original: row[mappingVariant.direccion_original] || '',
        cliente: mappingVariant.cliente ? row[mappingVariant.cliente] : null,
        telefono_cliente: mappingVariant.telefono_cliente ? row[mappingVariant.telefono_cliente] : null,
        datos_extra: row
      };

      if (payload.direccion_original) {
        try {
          const res = await axios.post('/api/v1/orders/process-single', payload, {
            headers: { 'X-Tenant-ID': tenantId }
          });

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
    onBatchComplete?.(summaryData);
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <h3>Carga Masiva Excel / CSV (.xlsx, .xls)</h3>
        </div>
        <Badge variant="emerald">Validación Estricta SaaS</Badge>
      </div>

      {!uploading && !summary ? (
        <label className="p-6 border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-900/40">
          <Upload className="w-8 h-8 mb-2 text-slate-400 animate-pulse" />
          <p className="text-xs font-semibold text-slate-200">Selecciona o arrastra tu archivo Excel (.xlsx, .xls, .csv)</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Procesamiento directo automático si coincide con la plantilla SaaS de la empresa
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.ods,.tsv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      ) : uploading ? (
        /* PROCESAMIENTO AUTOMÁTICO DIRECTO */
        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Procesando lote con plantilla: <strong className="text-white">{matchedVariantName}</strong>
            </span>
            <span className="font-mono text-xs font-bold text-white">{progress}%</span>
          </div>

          <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
            <div
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 text-center">
            Sanitizando direcciones &rarr; PostGIS 7 niveles &rarr; Sectorizador de Zonas...
          </p>
        </div>
      ) : (
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
            onClick={() => { setSummary(null); setFile(null); }}
            className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            Cargar Otro Archivo
          </button>
        </div>
      )}

      {/* MODAL DE ERROR ESTRICTO POR PLANTILLA INCOMPATIBLE */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <GlassCard className="w-full max-w-md p-6 rounded-3xl space-y-4 border-red-500/50">
            <div className="flex items-center gap-3 text-red-400 border-b border-slate-800 pb-3">
              <div className="p-2.5 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Importación Bloqueada</h3>
                <p className="text-[11px] text-red-400">Verifica que sea el archivo correcto</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              {errorModal}
            </p>

            <button
              onClick={() => setErrorModal(null)}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Entendido, Seleccionar Otro Archivo
            </button>
          </GlassCard>
        </div>
      )}
    </GlassCard>
  );
}


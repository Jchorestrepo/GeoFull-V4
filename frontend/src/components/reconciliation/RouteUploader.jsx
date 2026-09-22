import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Upload, FileSpreadsheet, Check, RefreshCw, X, PieChart, Truck, ShieldAlert } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export function RouteUploader({ onBatchComplete }) {
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

        // Consultar plantillas configuradas de conciliación para la empresa o globales en SaaS
        let plantillas = [];
        try {
          const tenantRes = await axios.get(`/api/v1/tenants/${tenantId}/column-mapping`);
          plantillas = Array.isArray(tenantRes.data?.plantillas_conciliacion)
            ? tenantRes.data.plantillas_conciliacion
            : [];

          if (plantillas.length === 0 && tenantId !== 'global') {
            const globalRes = await axios.get('/api/v1/tenants/global/column-mapping');
            plantillas = Array.isArray(globalRes.data?.plantillas_conciliacion)
              ? globalRes.data.plantillas_conciliacion
              : [];
          }
        } catch (err) {
          console.warn("No se pudieron obtener plantillas de rutas del tenant:", err);
        }

        // Buscar coincidencia 100% de encabezados requeridos (route_guia y route_da)
        let matchedVariant = null;
        for (const p of plantillas) {
          if (p.route_guia && parsedHeaders.includes(p.route_guia) && p.route_da && parsedHeaders.includes(p.route_da)) {
            matchedVariant = p;
            break;
          }
        }

        if (!matchedVariant) {
          // Ninguna plantilla coincide -> BLOQUEAR IMPORTACIÓN Y ALERTAR AL USUARIO
          setErrorModal(
            `El archivo subido ("${selected.name}") no coincide con ninguna de las plantillas globales de conciliación/rutas configuradas en la Consola SaaS. Por favor verifica que sea el archivo correcto o agrega la plantilla en la Consola SaaS.`
          );
          setFile(null);
          return;
        }

        // COINCIDENCIA ENCONTRADA -> PROCESAMIENTO AUTOMÁTICO DIRECTO (Opción B)
        setMatchedVariantName(matchedVariant.nombre || 'Plantilla Conciliación Preconfigurada');
        await processRoutesDirectly(parsedRows, matchedVariant);

      } catch (err) {
        console.error("Error al leer archivo de rutas:", err);
        setErrorModal("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx, .xls) o CSV válido.");
        setFile(null);
      }
    };

    reader.readAsArrayBuffer(selected);
  };

  const processRoutesDirectly = async (parsedRows, mappingVariant) => {
    setUploading(true);
    setProgress(20);

    const routeItems = parsedRows.map(r => ({
      guia: r[mappingVariant.route_guia] || '',
      domiciliario_nombre: r[mappingVariant.route_da] || 'SIN ASIGNAR',
      delivered_time: mappingVariant.route_time ? r[mappingVariant.route_time] : null,
      proveedor: 'iMile',
      datos_extra: r
    })).filter(i => i.guia !== '');

    try {
      setProgress(60);
      const res = await axios.post('/api/v1/reconciliation/process-routes', {
        items: routeItems
      }, {
        headers: { 'X-Tenant-ID': tenantId }
      });

      setProgress(100);
      setSummary(res.data);
      onBatchComplete?.(res.data);
    } catch (err) {
      console.error("Error procesando lote de conciliación", err);
      setErrorModal(err.response?.data?.detail || "Ocurrió un error al procesar la planilla de rutas.");
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
        <Badge variant="blue">Validación Estricta SaaS</Badge>
      </div>

      {!uploading && !summary ? (
        <label className="p-6 border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-900/40">
          <Upload className="w-8 h-8 mb-2 text-slate-400 animate-pulse" />
          <p className="text-xs font-semibold text-slate-200">Selecciona o arrastra tu archivo iMile / Rutas entregadas</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Conciliación automática directa si los encabezados coinciden con la plantilla SaaS de la empresa
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.ods,.tsv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      ) : uploading ? (
        /* BARRA DE PROGRESO DE PROCESAMIENTO DIRECTO */
        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/90 border border-blue-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Conciliando con plantilla: <strong className="text-white">{matchedVariantName}</strong>
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
            Procesando entregas y vinculando domiciliarios...
          </p>
        </div>
      ) : (
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
            onClick={() => { setSummary(null); setFile(null); }}
            className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            Cargar Otra Planilla
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
                <p className="text-[11px] text-red-400">Verifica que sea la planilla de rutas correcta</p>
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


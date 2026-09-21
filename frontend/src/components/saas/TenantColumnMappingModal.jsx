import React, { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Toast } from '../ui/Toast';
import {
  FileSpreadsheet, Upload, Plus, Trash2, Check, X, RefreshCw,
  Layers, Eye, AlertCircle, Building2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function TenantColumnMappingModal({ tenant, isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('sectorizacion'); // 'sectorizacion' | 'conciliacion'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Plantillas cargadas de la empresa
  const [templates, setTemplates] = useState({
    plantillas_sectorizacion: [],
    plantillas_conciliacion: []
  });

  // Estado para el creador de nueva variante con archivo de muestra
  const [showCreator, setShowCreator] = useState(false);
  const [sampleFile, setSampleFile] = useState(null);
  const [sampleHeaders, setSampleHeaders] = useState([]);
  const [sampleRows, setSampleRows] = useState([]); // Primeras 5 filas para preview

  const [newVariant, setNewVariant] = useState({
    nombre: '',
    guia: '',
    direccion_original: '',
    cliente: '',
    telefono_cliente: '',
    route_guia: '',
    route_da: '',
    route_time: ''
  });

  useEffect(() => {
    if (isOpen && tenant) {
      loadTenantMapping();
    }
  }, [isOpen, tenant]);

  const loadTenantMapping = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/tenants/${tenant.id}/column-mapping`);
      setTemplates({
        plantillas_sectorizacion: Array.isArray(res.data.plantillas_sectorizacion) ? res.data.plantillas_sectorizacion : [],
        plantillas_conciliacion: Array.isArray(res.data.plantillas_conciliacion) ? res.data.plantillas_conciliacion : []
      });
    } catch (err) {
      console.error("Error al obtener mapeos del tenant:", err);
      setToast({ type: 'error', message: 'No se pudieron cargar las plantillas de la empresa' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !tenant) return null;

  // Manejo de carga de archivo de muestra
  const handleSampleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSampleFile(file);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        if (jsonRows.length > 0) {
          const headers = jsonRows[0].map(h => String(h).trim()).filter(h => h !== '');
          const rowsPreview = jsonRows.slice(1, 6).map(row => {
            const obj = {};
            headers.forEach((h, idx) => {
              obj[h] = row[idx] !== undefined ? String(row[idx]).trim() : '';
            });
            return obj;
          });

          setSampleHeaders(headers);
          setSampleRows(rowsPreview);

          // Intentar auto-mapear sugerencias por nombre
          const mapState = { ...newVariant };
          headers.forEach(h => {
            const lower = h.toLowerCase();
            if (activeTab === 'sectorizacion') {
              if (!mapState.guia && (lower.includes('guia') || lower.includes('nro') || lower.includes('tracking') || lower.includes('waybill'))) {
                mapState.guia = h;
              }
              if (!mapState.direccion_original && (lower.includes('dir') || lower.includes('direccion') || lower.includes('address'))) {
                mapState.direccion_original = h;
              }
              if (!mapState.cliente && (lower.includes('cli') || lower.includes('nombre') || lower.includes('destinatario'))) {
                mapState.cliente = h;
              }
              if (!mapState.telefono_cliente && (lower.includes('tel') || lower.includes('cel') || lower.includes('phone'))) {
                mapState.telefono_cliente = h;
              }
            } else {
              if (!mapState.route_guia && (lower.includes('waybill') || lower.includes('guia') || lower.includes('tracking'))) {
                mapState.route_guia = h;
              }
              if (!mapState.route_da && (lower.includes('da name') || lower.includes('da') || lower.includes('conductor') || lower.includes('domiciliario'))) {
                mapState.route_da = h;
              }
              if (!mapState.route_time && (lower.includes('delivered time') || lower.includes('delivered') || lower.includes('entrega') || lower.includes('hora'))) {
                mapState.route_time = h;
              }
            }
          });

          if (!mapState.nombre) {
            mapState.nombre = `${activeTab === 'sectorizacion' ? 'Envíos' : 'Rutas'} (${file.name.replace(/\.[^/.]+$/, '')})`;
          }
          setNewVariant(mapState);
        }
      } catch (err) {
        console.error("Error leyendo archivo muestra:", err);
        setToast({ type: 'error', message: 'No se pudo leer el archivo de muestra.' });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Guardar nueva variante
  const handleSaveVariant = async () => {
    if (!newVariant.nombre.trim()) {
      setToast({ type: 'error', message: 'Ingresa un nombre para identificar esta variante de plantilla' });
      return;
    }

    if (activeTab === 'sectorizacion') {
      if (!newVariant.guia || !newVariant.direccion_original) {
        setToast({ type: 'error', message: 'Debes seleccionar las columnas obligatorias de Guía y Dirección' });
        return;
      }
    } else {
      if (!newVariant.route_guia || !newVariant.route_da) {
        setToast({ type: 'error', message: 'Debes seleccionar las columnas obligatorias de Waybill y Domiciliario (DA Name)' });
        return;
      }
    }

    const varId = `var_${Date.now()}`;
    const variantObj = {
      id: varId,
      nombre: newVariant.nombre.trim(),
      ...(activeTab === 'sectorizacion'
        ? {
            guia: newVariant.guia,
            direccion_original: newVariant.direccion_original,
            cliente: newVariant.cliente || '',
            telefono_cliente: newVariant.telefono_cliente || ''
          }
        : {
            route_guia: newVariant.route_guia,
            route_da: newVariant.route_da,
            route_time: newVariant.route_time || ''
          })
    };

    const updatedSect = activeTab === 'sectorizacion'
      ? [...templates.plantillas_sectorizacion, variantObj]
      : templates.plantillas_sectorizacion;

    const updatedConcil = activeTab === 'conciliacion'
      ? [...templates.plantillas_conciliacion, variantObj]
      : templates.plantillas_conciliacion;

    await saveTemplatesToBackend(updatedSect, updatedConcil);
    setShowCreator(false);
    resetCreatorForm();
  };

  const handleDeleteVariant = async (tabKey, variantId) => {
    if (!confirm("¿Deseas eliminar esta plantilla de la empresa?")) return;

    const updatedSect = tabKey === 'sectorizacion'
      ? templates.plantillas_sectorizacion.filter(t => t.id !== variantId)
      : templates.plantillas_sectorizacion;

    const updatedConcil = tabKey === 'conciliacion'
      ? templates.plantillas_conciliacion.filter(t => t.id !== variantId)
      : templates.plantillas_conciliacion;

    await saveTemplatesToBackend(updatedSect, updatedConcil);
  };

  const saveTemplatesToBackend = async (sectList, concilList) => {
    setSaving(true);
    try {
      const payload = {
        plantillas_sectorizacion: sectList,
        plantillas_conciliacion: concilList
      };
      await axios.post(`${API_BASE}/tenants/${tenant.id}/column-mapping`, payload);
      setTemplates({
        plantillas_sectorizacion: sectList,
        plantillas_conciliacion: concilList
      });
      setToast({ type: 'success', message: 'Plantillas de importación actualizadas exitosamente' });
      onSuccess?.('Plantillas de importación guardadas');
    } catch (err) {
      console.error("Error al guardar plantillas:", err);
      setToast({ type: 'error', message: err.response?.data?.detail || 'No se pudieron guardar las plantillas' });
    } finally {
      setSaving(false);
    }
  };

  const resetCreatorForm = () => {
    setSampleFile(null);
    setSampleHeaders([]);
    setSampleRows([]);
    setNewVariant({
      nombre: '', guia: '', direccion_original: '', cliente: '', telefono_cliente: '',
      route_guia: '', route_da: '', route_time: ''
    });
  };

  // Helper para obtener 5 filas de muestra de una columna elegida
  const renderColumnDataPreview = (colName) => {
    if (!colName || sampleRows.length === 0) return null;
    const previews = sampleRows.map(r => r[colName]).filter(v => v !== undefined && v !== '');

    return (
      <div className="mt-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono space-y-1">
        <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 font-sans">
          <Eye className="w-3 h-3 text-emerald-400" />
          Muestra de datos (primeras 5 filas):
        </p>
        <div className="space-y-0.5 max-h-20 overflow-y-auto">
          {previews.map((val, idx) => (
            <div key={idx} className="text-slate-200 truncate bg-slate-900/60 px-2 py-0.5 rounded border border-white/5">
              <span className="text-slate-500 mr-1.5">#{idx + 1}</span> {val}
            </div>
          ))}
          {previews.length === 0 && <p className="text-amber-400 text-[10px] font-sans">Columna vacía o sin datos en muestra</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <GlassCard className="w-full max-w-3xl p-6 rounded-3xl space-y-5 border-purple-500/30 max-h-[90vh] flex flex-col justify-between overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-white tracking-tight">Plantillas de Importación</h3>
                <Badge variant="purple">{tenant.nombre}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configuración multi-idioma/variante para Sectorización y Conciliación con validación estricta.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Modal */}
        <div className="flex items-center justify-between border-b border-slate-800">
          <div className="flex space-x-2">
            <button
              onClick={() => { setActiveTab('sectorizacion'); setShowCreator(false); }}
              className={`py-2 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'sectorizacion'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Mapeo Sectorización / Envíos ({templates.plantillas_sectorizacion.length})
            </button>

            <button
              onClick={() => { setActiveTab('conciliacion'); setShowCreator(false); }}
              className={`py-2 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'conciliacion'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              Mapeo Conciliación / Rutas ({templates.plantillas_conciliacion.length})
            </button>
          </div>

          {!showCreator && (
            <button
              onClick={() => { resetCreatorForm(); setShowCreator(true); }}
              className="py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Agregar Variante por Archivo
            </button>
          )}
        </div>

        {/* Contenido Principal */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
              Cargando plantillas de la empresa...
            </div>
          ) : showCreator ? (
            /* FORMULARIO CREADOR CON ARCHIVO DE MUESTRA */
            <div className="space-y-4 p-4 rounded-2xl bg-slate-900/90 border border-purple-500/30 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <h4>Crear Variante de Plantilla ({activeTab === 'sectorizacion' ? 'Sectorización' : 'Conciliación'})</h4>
                </div>
                <button
                  onClick={() => setShowCreator(false)}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>

              {/* Paso 1: Subir Archivo de Muestra */}
              {!sampleFile ? (
                <label className="p-6 border-2 border-dashed border-purple-500/40 hover:border-purple-500 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-purple-500/5">
                  <Upload className="w-8 h-8 mb-2 text-purple-400 animate-bounce" />
                  <p className="text-xs font-semibold text-slate-200">Subir Archivo Excel/CSV de Muestra</p>
                  <p className="text-[10px] text-slate-400 mt-1">Extrae encabezados y permite previsualizar 5 filas de datos en vivo</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleSampleFileSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                /* Paso 2: Configurar Campos con Vista Previa de 5 Filas */
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      Archivo Muestra: <strong className="text-white">{sampleFile.name}</strong> ({sampleHeaders.length} columnas)
                    </span>
                    <button
                      onClick={() => setSampleFile(null)}
                      className="text-[11px] text-purple-400 hover:underline"
                    >
                      Cambiar Archivo
                    </button>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold text-xs mb-1">Nombre de la Variante / Plantilla *</label>
                    <input
                      type="text"
                      placeholder="ej. iMile Formato Colombia 2026, iMile English, etc."
                      value={newVariant.nombre}
                      onChange={e => setNewVariant({ ...newVariant, nombre: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {activeTab === 'sectorizacion' ? (
                    /* CAMPOS SECTORIZACIÓN */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Guía / Waybill (*):</label>
                        <select
                          value={newVariant.guia}
                          onChange={e => setNewVariant({ ...newVariant, guia: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                        >
                          <option value="">-- Seleccionar Columna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.guia)}
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Dirección (*):</label>
                        <select
                          value={newVariant.direccion_original}
                          onChange={e => setNewVariant({ ...newVariant, direccion_original: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                        >
                          <option value="">-- Seleccionar Columna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.direccion_original)}
                      </div>

                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Columna Cliente (Opcional):</label>
                        <select
                          value={newVariant.cliente}
                          onChange={e => setNewVariant({ ...newVariant, cliente: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-300"
                        >
                          <option value="">-- Ninguna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.cliente)}
                      </div>

                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Columna Teléfono (Opcional):</label>
                        <select
                          value={newVariant.telefono_cliente}
                          onChange={e => setNewVariant({ ...newVariant, telefono_cliente: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-300"
                        >
                          <option value="">-- Ninguna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.telefono_cliente)}
                      </div>
                    </div>
                  ) : (
                    /* CAMPOS CONCILIACIÓN DE RUTAS */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Waybill / Guía (*):</label>
                        <select
                          value={newVariant.route_guia}
                          onChange={e => setNewVariant({ ...newVariant, route_guia: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                        >
                          <option value="">-- Seleccionar Columna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.route_guia)}
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold text-[11px] mb-1">Columna Domiciliario (DA Name) (*):</label>
                        <select
                          value={newVariant.route_da}
                          onChange={e => setNewVariant({ ...newVariant, route_da: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium"
                        >
                          <option value="">-- Seleccionar Columna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.route_da)}
                      </div>

                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Columna Delivered time (Opcional):</label>
                        <select
                          value={newVariant.route_time}
                          onChange={e => setNewVariant({ ...newVariant, route_time: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-300"
                        >
                          <option value="">-- Ninguna --</option>
                          {sampleHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {renderColumnDataPreview(newVariant.route_time)}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveVariant}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Guardar Variante de Plantilla</span>
                    </button>
                    <button
                      onClick={() => setShowCreator(false)}
                      className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* LISTADO DE VARIANTES EXISTENTES */
            <div className="space-y-3">
              {(activeTab === 'sectorizacion' ? templates.plantillas_sectorizacion : templates.plantillas_conciliacion).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="font-semibold text-slate-300">No hay variantes configuradas en esta categoría.</p>
                  <p className="text-[11px] text-slate-500">
                    Haz clic en "Agregar Variante por Archivo" para crear la primera plantilla de la empresa.
                  </p>
                </div>
              ) : (
                (activeTab === 'sectorizacion' ? templates.plantillas_sectorizacion : templates.plantillas_conciliacion).map((t, idx) => (
                  <div key={t.id || idx} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 hover:border-purple-500/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="purple" className="text-[10px] font-mono">Variante #{idx + 1}</Badge>
                        <h4 className="font-bold text-sm text-white">{t.nombre}</h4>
                      </div>
                      <button
                        onClick={() => handleDeleteVariant(activeTab, t.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar plantilla"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono pt-1">
                      {activeTab === 'sectorizacion' ? (
                        <>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Guía</span>
                            <span className="text-emerald-400 font-semibold">{t.guia || '-'}</span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Dirección</span>
                            <span className="text-blue-400 font-semibold">{t.direccion_original || '-'}</span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Cliente</span>
                            <span className="text-slate-300">{t.cliente || '(Omitido)'}</span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Teléfono</span>
                            <span className="text-slate-300">{t.telefono_cliente || '(Omitido)'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Waybill / Guía</span>
                            <span className="text-emerald-400 font-semibold">{t.route_guia || '-'}</span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Domiciliario (DA Name)</span>
                            <span className="text-purple-400 font-semibold">{t.route_da || '-'}</span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 col-span-2">
                            <span className="text-[10px] text-slate-500 block">Fecha/Hora Entrega</span>
                            <span className="text-slate-300">{t.route_time || '(Omitido)'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
          >
            Cerrar Ventana
          </button>
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </GlassCard>
    </div>
  );
}

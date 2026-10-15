import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  Sparkles,
  Merge,
  X,
  CheckCircle2,
  AlertTriangle,
  Users,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';

export function DuplicatesAssistantModal({ onClose, onUnificationDone }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ total_groups: 0, total_duplicates: 0, suggestions: [] });
  const [unifyingId, setUnifyingId] = useState(null);
  const [unifyingAll, setUnifyingAll] = useState(false);
  const [customCedulas, setCustomCedulas] = useState({});
  const [successCount, setSuccessCount] = useState(0);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/reconciliation/drivers/duplicates-suggestions');
      setData(res.data);
      // Pre-fill customCedulas with primary cédula if real, or empty
      const initialCedulas = {};
      (res.data.suggestions || []).forEach(s => {
        const prim = s.primary_driver;
        initialCedulas[s.base_name] = prim.is_temp_cedula ? '' : prim.cedula;
      });
      setCustomCedulas(initialCedulas);
    } catch (err) {
      console.error("Error al cargar sugerencias de duplicados", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleUnifyGroup = async (group) => {
    setUnifyingId(group.base_name);
    try {
      const cedulaToUse = (customCedulas[group.base_name] || '').trim();
      const payload = {
        driver_ids: group.driver_ids,
        nombre_limpio: group.base_name,
        cedula_real: cedulaToUse || group.primary_driver.cedula
      };

      await axios.post('/api/v1/reconciliation/drivers/unify', payload);
      setSuccessCount(prev => prev + 1);

      // Remove this group locally
      setData(prev => ({
        ...prev,
        total_groups: Math.max(0, prev.total_groups - 1),
        total_duplicates: Math.max(0, prev.total_duplicates - group.duplicates.length),
        suggestions: prev.suggestions.filter(s => s.base_name !== group.base_name)
      }));

      onUnificationDone && onUnificationDone(group.base_name);
    } catch (err) {
      console.error("Error unificando grupo", err);
      const errorMsg = err.response?.data?.detail || err.message || "No se pudo unificar el grupo de conductores";
      alert(`Error al unificar grupo '${group.base_name}':\n${errorMsg}`);
    } finally {
      setUnifyingId(null);
    }
  };

  const handleUnifyAll = async () => {
    if (!window.confirm(`¿Estás seguro de unificar automáticamente los ${data.suggestions.length} grupos detectados? Se fusionarán sus entregas y alias bajo sus nombres limpios.`)) {
      return;
    }

    setUnifyingAll(true);
    let completed = 0;
    const errors = [];

    for (const group of data.suggestions) {
      try {
        const cedulaToUse = (customCedulas[group.base_name] || '').trim();
        const payload = {
          driver_ids: group.driver_ids,
          nombre_limpio: group.base_name,
          cedula_real: cedulaToUse || group.primary_driver.cedula
        };
        await axios.post('/api/v1/reconciliation/drivers/unify', payload);
        completed++;
      } catch (err) {
        console.error(`Error unificando ${group.base_name}`, err);
        const detail = err.response?.data?.detail || err.message;
        errors.push(`• ${group.base_name}: ${detail}`);
      }
    }

    setUnifyingAll(false);
    if (errors.length > 0) {
      alert(`Se unificaron ${completed} grupos exitosamente.\n\nHubo ${errors.length} novedades:\n${errors.join('\n')}`);
    } else {
      onUnificationDone && onUnificationDone(`Se unificaron todos los ${completed} grupos exitosamente`);
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <GlassCard className="modal-sheet w-full max-w-4xl p-0 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/95 text-white flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-slate-950/70 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white">
                  Asistente Inteligente de Unificación de Duplicados
                </h3>
                <Badge variant="purple">
                  {data.total_groups} Grupos / {data.total_duplicates} Duplicados
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Detección automática de conductores repetidos generados por códigos de plataforma (.pcp, |200...).
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold">Analizando coincidencias y nombres base en el directorio...</p>
            </div>
          ) : data.suggestions.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white">¡No se detectaron conductores duplicados!</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tu directorio de conductores se encuentra limpio y no hay nombres con sufijos repetidos pendientes de unificar.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Cerrar Asistente
              </button>
            </div>
          ) : (
            <>
              {/* Top Banner Alert & Action */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-xs">
                <div className="space-y-0.5">
                  <p className="font-bold text-purple-200">
                    Se detectaron {data.total_groups} nombres con registros múltiples.
                  </p>
                  <p className="text-purple-300/80 text-[11px]">
                    Al unificar, todas las entregas históricas y pendientes se fusionarán en un único perfil con su nombre limpio.
                  </p>
                </div>
                <button
                  onClick={handleUnifyAll}
                  disabled={unifyingAll || data.suggestions.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-purple-500/25 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Merge className="w-4 h-4" />
                  <span>{unifyingAll ? 'Unificando Lote...' : `Unificar Todo en 1 Clic (${data.total_groups})`}</span>
                </button>
              </div>

              {/* Suggestions Cards List */}
              <div className="space-y-3">
                {data.suggestions.map((group) => {
                  const prim = group.primary_driver;
                  const isCurrentUnifying = unifyingId === group.base_name;

                  return (
                    <div
                      key={group.base_name}
                      className="p-4 rounded-2xl bg-slate-950/80 border border-white/10 hover:border-purple-500/40 transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white text-sm">{group.base_name}</span>
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                            {group.count} perfiles detectados
                          </span>
                          <span className="text-[11px] text-emerald-400 font-mono font-semibold">
                            ({group.total_entregados_combinados} entregas en total)
                          </span>
                        </div>

                        {/* Input Cédula Real */}
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                            Cédula Real:
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: 1020304050"
                            value={customCedulas[group.base_name] || ''}
                            onChange={(e) => setCustomCedulas({
                              ...customCedulas,
                              [group.base_name]: e.target.value
                            })}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono outline-none focus:border-purple-500 w-36"
                          />
                        </div>
                      </div>

                      {/* Comparison Columns */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Primary Record */}
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Perfil Principal de Destino
                            </span>
                            <Badge variant={prim.is_temp_cedula ? 'amber' : 'emerald'}>
                              {prim.is_temp_cedula ? 'Cédula Temporal' : 'Cédula Real'}
                            </Badge>
                          </div>
                          <p className="font-bold text-white text-xs">{prim.nombre_completo}</p>
                          <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                            <span>CC: {prim.cedula}</span>
                            <span className="text-emerald-400 font-bold">{prim.total_entregados} entregados</span>
                          </div>
                        </div>

                        {/* Duplicates to Merge */}
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                              Registros a Fusionar ({group.duplicates.length})
                            </span>
                            <span className="text-[10px] text-slate-500">Se convertirán en alias</span>
                          </div>
                          <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                            {group.duplicates.map(dup => (
                              <div key={dup.id} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-slate-950/60 border border-white/5">
                                <div className="truncate max-w-[200px]">
                                  <span className="text-slate-300 font-medium">{dup.nombre_completo}</span>
                                  <span className="text-slate-500 font-mono block text-[10px]">CC: {dup.cedula}</span>
                                </div>
                                <span className="font-mono text-emerald-400 font-bold text-[10px]">
                                  +{dup.total_entregados} ent.
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleUnifyGroup(group)}
                          disabled={isCurrentUnifying || unifyingAll}
                          className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-purple-500/20 disabled:opacity-50"
                        >
                          <Merge className="w-3.5 h-3.5" />
                          <span>{isCurrentUnifying ? 'Unificando...' : 'Unificar este Grupo'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>{data.suggestions.length} grupos pendientes</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
          >
            Listo / Volver al Directorio
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

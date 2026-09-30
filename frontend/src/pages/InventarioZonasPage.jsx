import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  ScanBarcode, 
  Layers, 
  PackageCheck, 
  RefreshCw, 
  AlertTriangle, 
  Volume2, 
  CheckCircle2, 
  MapPin, 
  ArrowRightLeft,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { dataCache } from '../lib/dataCache';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function InventarioZonasPage() {
  const [zones, setZones] = useState([]);
  const [activeZone, setActiveZone] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingScan, setProcessingScan] = useState(false);
  const [lastScannedPackage, setLastScannedPackage] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [toast, setToast] = useState(null);

  // Referencia para el timer de doble escaneo de zona (< 3s)
  const lastZoneScanRef = useRef({ zoneId: null, timestamp: 0 });
  const inputRef = useRef(null);

  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';

  // Audio Synth Engine (Web Audio API + SpeechSynthesis)
  const playSound = (type) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      let duration = 0.3;

      if (type === 'success') {
        // Beep Agudo Estándar (880 Hz)
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        duration = 0.15;
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'zone_changed') {
        // Beep Alerta Reubicación (Doble tono: 440 Hz -> 880 Hz)
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        duration = 0.3;
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'reset') {
        // Beep de Reinicio (Grave descendente 600 Hz -> 200 Hz)
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        duration = 0.3;
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'error') {
        // Tone Error (220 Hz)
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        duration = 0.35;
        osc.start(now);
        osc.stop(now + 0.3);
      }

      setTimeout(() => {
        try { audioCtx.close(); } catch (e) {}
      }, Math.ceil(duration * 1000) + 50);
    } catch (err) {
      console.warn('Audio Context error:', err);
    }
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel(); // Detener audios anteriores
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech error:', err);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/zones/inventory-summary`, {
        headers: { 'X-Tenant-ID': tenantId }
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setZones(data);

      // Actualizar la zona activa si ya había una seleccionada
      if (activeZone) {
        const updatedActive = data.find((z) => z.id === activeZone.id);
        if (updatedActive) {
          setActiveZone(updatedActive);
        }
      }
    } catch (err) {
      console.error('Error cargando inventario de zonas:', err);
      showToast('Error al cargar inventario de zonas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [tenantId]);

  // Enfoque inicial al montar
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Procesamiento principal de escaneo de código de barras
  const handleScanSubmit = async (e) => {
    if (e) e.preventDefault();
    const code = barcodeInput.trim();
    if (!code || processingScan) return;

    setBarcodeInput('');
    setProcessingScan(true);

    try {
      // 1. Verificar si el código escaneado corresponde al código de barras de alguna ZONA
      const matchedZone = zones.find(
        (z) =>
          z.codigo_barras?.toUpperCase() === code.toUpperCase() ||
          z.codigo?.toUpperCase() === code.toUpperCase() ||
          z.nombre.toUpperCase() === code.toUpperCase()
      );

      const now = Date.now();

      if (matchedZone) {
        // --- ES CANEO DE ZONA DETECTADO ---
        const isDoubleScan =
          lastZoneScanRef.current.zoneId === matchedZone.id &&
          now - lastZoneScanRef.current.timestamp < 3000;

        if (isDoubleScan) {
          // --- DOBLE ESCANEO DE ZONA (< 3s): REINICIO A CERO ---
          lastZoneScanRef.current = { zoneId: null, timestamp: 0 };
          await handleResetZone(matchedZone, false); // No solicitar confirmación emergente si fue por doble escaneo
        } else {
          // --- ESCANEO ÚNICO DE ZONA: ACTIVAR ZONA Y LEER EN VOZ ALTA ---
          lastZoneScanRef.current = { zoneId: matchedZone.id, timestamp: now };
          setActiveZone(matchedZone);
          playSound('success');

          const cantMsg = `${matchedZone.nombre}, ${matchedZone.total_bodega} paquetes`;
          speakText(cantMsg);
          showToast(`Zona "${matchedZone.nombre}" activada para conteo (${matchedZone.total_bodega} paquetes en bodega)`);
        }
      } else {
        // --- ESCANEO DE PAQUETE / GUÍA ---
        if (!activeZone) {
          playSound('error');
          speakText('Seleccione o escanee una zona primero');
          showToast('Debes escanear o seleccionar una zona antes de contar paquetes', 'error');
          setProcessingScan(false);
          return;
        }

        // Enviar paquete al backend para ubicar en zona activa en estado EN_BODEGA
        const res = await axios.post(
          `${API_BASE}/zones/inventory-scan-package`,
          { barcode: code, zone_id: activeZone.id },
          { headers: { 'X-Tenant-ID': tenantId } }
        );

        const packageData = res.data;
        setLastScannedPackage(packageData);

        // Agregar al registro reciente
        setRecentScans((prev) => [
          { ...packageData, timestamp: new Date().toLocaleTimeString() },
          ...prev.slice(0, 19)
        ]);

        // Feedback Auditivo según Reubicación
        if (packageData.zone_changed) {
          playSound('zone_changed'); // Beep Doble de Alerta
          showToast(
            `Guía ${packageData.guia} reubicada a "${activeZone.nombre}" (Antes: ${packageData.previous_zone})`,
            'info'
          );
        } else {
          playSound('success'); // Beep Normal
        }

        // Actualizar resumen local
        setZones((prev) =>
          prev.map((z) =>
            z.id === activeZone.id ? { ...z, total_bodega: z.total_bodega + 1 } : z
          )
        );
        setActiveZone((prev) => (prev ? { ...prev, total_bodega: prev.total_bodega + 1 } : null));
        dataCache.invalidateOrders();
      }
    } catch (err) {
      console.error('Error al procesar escaneo:', err);
      playSound('error');
      const detail = err.response?.data?.detail || 'Error procesando código de barras';
      showToast(detail, 'error');
    } finally {
      setProcessingScan(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const handleResetZone = async (zoneToReset, confirm = true) => {
    if (!zoneToReset) return;
    if (confirm && !window.confirm(`¿Reiniciar el contador de la zona "${zoneToReset.nombre}" a CERO?`)) {
      return;
    }

    try {
      await axios.post(
        `${API_BASE}/zones/reset-inventory/${zoneToReset.id}`,
        {},
        { headers: { 'X-Tenant-ID': tenantId } }
      );

      playSound('reset');
      speakText(`Conteo ${zoneToReset.nombre}`);
      showToast(`Zona "${zoneToReset.nombre}" reiniciada a 0 paquetes`, 'success');

      // Actualizar estado local
      setZones((prev) =>
        prev.map((z) => (z.id === zoneToReset.id ? { ...z, total_bodega: 0 } : z))
      );
      if (activeZone?.id === zoneToReset.id) {
        setActiveZone((prev) => (prev ? { ...prev, total_bodega: 0 } : null));
      }
      dataCache.invalidateOrders();
    } catch (err) {
      console.error('Error al reiniciar zona:', err);
      showToast('Error al reiniciar zona', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header Superior */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <ScanBarcode className="w-7 h-7 text-blue-400" />
            Inventario de Paquetes por Zonas
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Escanea el código de la zona para activarla o 2 veces en &lt;3s para reiniciar contador. Escanea paquetes para asignarlos a bodega.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="titanium" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            Escáner Físico Activo
          </Badge>
          <button
            onClick={fetchSummary}
            className="p-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title="Refrescar resumen"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barcode Scanner Main Input Box */}
      <GlassCard className="p-5 border-blue-500/30 bg-blue-500/5 space-y-3">
        <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <ScanBarcode className="w-5 h-5 text-blue-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Escanea aquí el Código de Barras de la Zona o Paquete..."
              className="w-full bg-slate-950/90 border-2 border-blue-500/40 focus:border-blue-400 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-xl transition-all"
              autoFocus
            />
            {processingScan && (
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400 absolute right-4 top-1/2 -translate-y-1/2" />
            )}
          </div>
          <button
            type="submit"
            disabled={processingScan || !barcodeInput.trim()}
            className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/25 cursor-pointer whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4" />
            Procesar Escaneo
          </button>
        </form>
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>💡 Tip: Puedes escanear directamente con la pistola lectora de código de barras.</span>
          <span className="font-mono text-blue-400">Escáner listo para recibir lectura</span>
        </div>
      </GlassCard>

      {/* Grid Principal: Zona Activa & Tarjeta de Último Paquete Escaneado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Banner de Zona Activa */}
        <GlassCard className="p-6 lg:col-span-2 border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Zona Activa de Escaneo
              </span>
            </div>
            {activeZone && (
              <button
                onClick={() => handleResetZone(activeZone)}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reiniciar Conteo a 0
              </button>
            )}
          </div>

          {activeZone ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
              <div>
                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full shadow-lg"
                    style={{ backgroundColor: activeZone.color || '#10b981' }}
                  />
                  {activeZone.nombre}
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  Código de Barras: <span className="text-emerald-300 font-bold">{activeZone.codigo_barras}</span>
                </p>
              </div>

              <div className="text-right sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start">
                <span className="text-xs text-slate-400 font-medium">Paquetes en Bodega</span>
                <span className="text-4xl font-black text-emerald-400 font-mono tracking-tight">
                  {activeZone.total_bodega}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-700/60 rounded-2xl bg-slate-950/30">
              Escanea el código de barras de una zona física o haz clic en alguna zona abajo para comenzar a contar paquetes.
            </div>
          )}
        </GlassCard>

        {/* Panel del Último Paquete Escaneado */}
        <GlassCard className="p-6 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-blue-400" />
              Último Paquete Registrado
            </h4>
            {lastScannedPackage?.zone_changed && (
              <Badge variant="red" className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px]">
                Reubicado de Zona
              </Badge>
            )}
          </div>

          {lastScannedPackage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Guía:</span>
                <span className="text-sm font-mono font-extrabold text-blue-300">
                  {lastScannedPackage.guia}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Estado:</span>
                <Badge variant="emerald">{lastScannedPackage.estado}</Badge>
              </div>
              <div className="text-xs text-slate-300 pt-1">
                <span className="text-slate-500 block text-[10px]">Dirección Registrada:</span>
                <p className="font-semibold text-slate-200 line-clamp-2 mt-0.5">
                  {lastScannedPackage.direccion}
                </p>
              </div>
              {lastScannedPackage.zone_changed && (
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-1.5 mt-2">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>Cambiado de <b>{lastScannedPackage.previous_zone}</b> a <b>{lastScannedPackage.zona_nombre}</b></span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-xs">
              Aún no has escaneado ningún paquete en esta sesión.
            </div>
          )}
        </GlassCard>
      </div>

      {/* Listado de Zonas Registradas (Selección Rápida) */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Resumen de Zonas & Paquetes en Bodega ({zones.length})</h3>
          </div>
          <span className="text-xs text-slate-400">Haz clic en una zona para activarla</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            Cargando zonas de la empresa...
          </div>
        ) : zones.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-700/60 rounded-2xl bg-slate-900/30">
            No se han registrado zonas GeoJSON. Dirígete a Configuración &rarr; Sectores para importar zonas y asignar códigos de barras.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {zones.map((z) => {
              const isSelected = activeZone?.id === z.id;

              return (
                <div
                  key={z.id}
                  onClick={() => {
                    setActiveZone(z);
                    playSound('success');
                    speakText(`${z.nombre}, ${z.total_bodega} paquetes`);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/30'
                      : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: z.color || '#10b981' }}
                      />
                      <h4 className="text-xs font-bold text-white truncate" title={z.nombre}>
                        {z.nombre}
                      </h4>
                    </div>
                    {isSelected && <Badge variant="emerald" className="text-[10px]">ACTIVA</Badge>}
                  </div>

                  <div className="flex items-end justify-between border-t border-slate-800/60 pt-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      CB: <b className="text-slate-300">{z.codigo_barras}</b>
                    </span>
                    <div className="text-right">
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        {z.total_bodega}
                      </span>
                      <span className="text-[10px] text-slate-400 block -mt-1">paquetes</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Tabla de Escaneos Recientes de la Sesión */}
      {recentScans.length > 0 && (
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-blue-400" />
              Historial de Escaneos de esta Sesión ({recentScans.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2">Hora</th>
                  <th className="pb-2">Guía</th>
                  <th className="pb-2">Zona Asignada</th>
                  <th className="pb-2">Dirección</th>
                  <th className="pb-2">Detalle Zona</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentScans.map((scan, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="py-2.5 font-mono text-slate-400">{scan.timestamp}</td>
                    <td className="py-2.5 font-mono font-bold text-blue-300">{scan.guia}</td>
                    <td className="py-2.5 font-bold text-emerald-400">{scan.zona_nombre}</td>
                    <td className="py-2.5 text-slate-300 max-w-xs truncate">{scan.direccion}</td>
                    <td className="py-2.5">
                      {scan.zone_changed ? (
                        <span className="text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                          Reubicado de {scan.previous_zone}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export default InventarioZonasPage;

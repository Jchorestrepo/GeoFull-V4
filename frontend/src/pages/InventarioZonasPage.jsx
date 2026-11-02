import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  ScanBarcode, 
  Layers, 
  PackageCheck, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  MapPin, 
  ArrowRightLeft,
  RotateCcw,
  Sparkles,
  PackageX,
  Eye,
  Trash2,
  ShieldCheck,
  Search,
  X,
  Map,
  Copy,
  Check
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { dataCache } from '../lib/dataCache';
import { UnscannedOrdersView } from '../components/inventario/UnscannedOrdersView';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function InventarioZonasPage() {
  const [zones, setZones] = useState([]);
  const [activeZone, setActiveZone] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingScan, setProcessingScan] = useState(false);
  const [reorganizingMap, setReorganizingMap] = useState(false);
  const [lastScannedPackage, setLastScannedPackage] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('inventario');

  // Modal de inspección de códigos por zona
  const [inspectZone, setInspectZone] = useState(null);
  const [zonePackagesData, setZonePackagesData] = useState({
    en_bodega: [],
    pendientes: [],
    total_bodega: 0,
    total_pendientes: 0,
    alertas_rojas_count: 0
  });
  const [loadingZonePackages, setLoadingZonePackages] = useState(false);
  const [modalTab, setModalTab] = useState('bodega'); // 'bodega' | 'alertas' | 'pendientes'
  const [modalSearch, setModalSearch] = useState('');
  const [copiedGuia, setCopiedGuia] = useState(null);

  // Referencia para el timer de doble escaneo de zona (< 3s)
  const lastZoneScanRef = useRef({ zoneId: null, timestamp: 0 });
  const inputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const dirtyCacheRef = useRef(false);

  const tenantId = localStorage.getItem('active_tenant_id') || 'empresa_demo';
  const token = localStorage.getItem('token');
  const authHeaders = {
    'X-Tenant-ID': tenantId,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  useEffect(() => {
    return () => {
      if (dirtyCacheRef.current) {
        dataCache.invalidateOrders();
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  // Audio Synth Engine (Web Audio API + SpeechSynthesis)
  const playSound = (type) => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'zone_changed') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'unimported_alert') {
        // Alarma sonora grave doble para código no existente en importación
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.setValueAtTime(180, now + 0.18);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'reset') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'error') {
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (err) {
      console.warn('Audio Context error:', err);
    }
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
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
    setTimeout(() => setToast(null), 4500);
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/zones/inventory-summary`, {
        headers: authHeaders
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setZones(data);

      if (activeZone) {
        const updatedActive = data.find((z) => z.id === activeZone.id);
        if (updatedActive) {
          setActiveZone(updatedActive);
        }
      }
      if (inspectZone) {
        const updatedInspect = data.find((z) => z.id === inspectZone.id);
        if (updatedInspect) {
          setInspectZone(updatedInspect);
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

  useEffect(() => {
    if (inputRef.current && !inspectZone) {
      inputRef.current.focus();
    }
  }, [inspectZone]);

  const openZonePackagesModal = async (zone, defaultTab = 'bodega') => {
    setInspectZone(zone);
    setModalSearch('');
    setModalTab(zone.alertas_rojas > 0 ? 'alertas' : defaultTab);
    setLoadingZonePackages(true);
    try {
      const res = await axios.get(`${API_BASE}/zones/${zone.id}/packages`, {
        headers: authHeaders
      });
      setZonePackagesData(res.data);
    } catch (err) {
      console.error('Error cargando códigos de la zona:', err);
      showToast('No se pudieron cargar los códigos de la zona', 'error');
    } finally {
      setLoadingZonePackages(false);
    }
  };

  const handleRemovePackageFromZone = async (pkg) => {
    if (!inspectZone) return;
    try {
      const res = await axios.delete(
        `${API_BASE}/zones/${inspectZone.id}/packages/${pkg.id}`,
        { headers: authHeaders }
      );
      showToast(res.data.message || `Código ${pkg.guia} retirado de la zona`, 'success');
      dirtyCacheRef.current = true;
      await Promise.all([
        openZonePackagesModal(inspectZone, modalTab),
        fetchSummary()
      ]);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al eliminar código de la zona', 'error');
    }
  };

  const handleVerifyExtraPackage = async (pkg) => {
    if (!inspectZone) return;
    try {
      const res = await axios.patch(
        `${API_BASE}/zones/${inspectZone.id}/packages/${pkg.id}/verify-extra`,
        {},
        { headers: authHeaders }
      );
      showToast(res.data.message || `Código ${pkg.guia} verificado como paquete extra`, 'success');
      dirtyCacheRef.current = true;
      await Promise.all([
        openZonePackagesModal(inspectZone, 'bodega'),
        fetchSummary()
      ]);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al verificar código extra', 'error');
    }
  };

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
        const isDoubleScan =
          lastZoneScanRef.current.zoneId === matchedZone.id &&
          now - lastZoneScanRef.current.timestamp < 3000;

        if (isDoubleScan) {
          lastZoneScanRef.current = { zoneId: null, timestamp: 0 };
          await handleResetZone(matchedZone, false);
        } else {
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

        const res = await axios.post(
          `${API_BASE}/zones/inventory-scan-package`,
          { barcode: code, zone_id: activeZone.id },
          { headers: authHeaders }
        );

        const packageData = res.data;
        setLastScannedPackage(packageData);

        setRecentScans((prev) => [
          { ...packageData, timestamp: new Date().toLocaleTimeString() },
          ...prev.slice(0, 29)
        ]);

        if (packageData.already_in_zone) {
          playSound('zone_changed');
          showToast(
            `La guía ${packageData.guia} ya estaba escaneada en "${activeZone.nombre}" (conteo sin cambios)`,
            'info'
          );
        } else if (packageData.is_unimported_alert) {
          playSound('unimported_alert');
          speakText('Código no encontrado en importación');
          showToast(
            `⚠️ Código "${packageData.guia}" NO existe en importación. Zona "${activeZone.nombre}" marcada en ROJO para revisión.`,
            'error'
          );
        } else if (packageData.was_in_bodega_other_zone) {
          playSound('zone_changed');
          showToast(
            `🔄 Guía ${packageData.guia} salió de "${packageData.previous_zone}" (-1) y entró a "${activeZone.nombre}" (+1)`,
            'info'
          );
        } else if (packageData.zone_changed) {
          playSound('zone_changed');
          showToast(
            `Guía ${packageData.guia} asignada a "${activeZone.nombre}" (Sugerida originalmente: ${packageData.previous_zone})`,
            'info'
          );
        } else {
          playSound('success');
        }

        // Actualizar conteos exactos en tiempo real (incluyendo salida de zona anterior y alertas rojas)
        if (!packageData.already_in_zone) {
          setZones((prev) =>
            prev.map((z) => {
              // Si el paquete salió de otra zona donde ya estaba EN_BODEGA, restar -1 a esa zona
              if (packageData.was_in_bodega_other_zone && z.id === packageData.previous_zone_id) {
                const newAlertas = packageData.is_unimported_alert ? Math.max(0, (z.alertas_rojas || 0) - 1) : (z.alertas_rojas || 0);
                return {
                  ...z,
                  total_bodega: Math.max(0, z.total_bodega - 1),
                  total_esperados: Math.max(0, (z.total_esperados || 0) - (packageData.is_unimported_alert ? 0 : 1)),
                  alertas_rojas: newAlertas,
                  tiene_alerta_roja: newAlertas > 0
                };
              }
              // Si el paquete tenía asignada otra zona en importación (SECTORIZADO) y se movió aquí
              if (!packageData.was_in_bodega_other_zone && packageData.zone_changed && z.id === packageData.previous_zone_id) {
                return {
                  ...z,
                  pendientes_escanear: Math.max(0, (z.pendientes_escanear || 0) - 1),
                  total_esperados: Math.max(0, (z.total_esperados || 0) - 1)
                };
              }
              // Zona activa destino: sumar +1
              if (z.id === activeZone.id) {
                const newAlertas = (z.alertas_rojas || 0) + (packageData.is_unimported_alert ? 1 : 0);
                const newEsperados = packageData.is_unimported_alert
                  ? (z.total_esperados || 0)
                  : packageData.zone_changed
                  ? (z.total_esperados || 0) + 1
                  : Math.max(z.total_bodega + 1, z.total_esperados || 0);
                return {
                  ...z,
                  total_bodega: z.total_bodega + 1,
                  total_esperados: newEsperados,
                  alertas_rojas: newAlertas,
                  tiene_alerta_roja: newAlertas > 0
                };
              }
              return z;
            })
          );

          setActiveZone((prev) => {
            if (!prev) return null;
            const newAlertas = (prev.alertas_rojas || 0) + (packageData.is_unimported_alert ? 1 : 0);
            return {
              ...prev,
              total_bodega: prev.total_bodega + 1,
              alertas_rojas: newAlertas,
              tiene_alerta_roja: newAlertas > 0
            };
          });
        }

        dirtyCacheRef.current = true;
      }
    } catch (err) {
      console.error('Error al procesar escaneo:', err);
      playSound('error');
      const detail = err.response?.data?.detail || 'Error procesando código de barras';
      showToast(detail, 'error');
    } finally {
      setProcessingScan(false);
      if (inputRef.current && !inspectZone) inputRef.current.focus();
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
        { headers: authHeaders }
      );

      playSound('reset');
      speakText(`Conteo ${zoneToReset.nombre} en cero`);
      showToast(`Zona "${zoneToReset.nombre}" reiniciada a 0 paquetes`, 'success');

      await fetchSummary();
      dirtyCacheRef.current = false;
      dataCache.invalidateOrders();
    } catch (err) {
      console.error('Error al reiniciar zona:', err);
      showToast('Error al reiniciar zona', 'error');
    }
  };

  const handleResetAllZones = async () => {
    if (!window.confirm('¿Estás seguro de reiniciar TODAS las zonas a 0 paquetes y limpiar los códigos no verificados?')) {
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/zones/reset-all-inventory`, {}, { headers: authHeaders });
      playSound('reset');
      showToast(res.data.message || 'Todas las zonas han sido reiniciadas a 0', 'success');
      await fetchSummary();
      dirtyCacheRef.current = false;
      dataCache.invalidateOrders();
    } catch (err) {
      showToast('Error al reiniciar todas las zonas', 'error');
    }
  };

  const handleReorganizeMap = async () => {
    setReorganizingMap(true);
    try {
      const res = await axios.post(`${API_BASE}/zones/reorganize-map`, {}, { headers: authHeaders });
      playSound('success');
      showToast(res.data.message || 'Mapa reorganizado y actualizado con las zonas de bodega', 'success');
      dirtyCacheRef.current = false;
      dataCache.invalidateOrders();
      dataCache.invalidateZones();
      await fetchSummary();
    } catch (err) {
      console.error('Error al reorganizar mapa:', err);
      showToast(err.response?.data?.detail || 'Error al reorganizar el mapa', 'error');
    } finally {
      setReorganizingMap(false);
    }
  };

  const copyGuia = async (guiaText) => {
    try {
      await navigator.clipboard.writeText(guiaText);
      setCopiedGuia(guiaText);
      setTimeout(() => setCopiedGuia(null), 1500);
    } catch (e) {}
  };

  const totalRedZones = zones.filter((z) => z.tiene_alerta_roja || z.alertas_rojas > 0).length;
  const totalUnimportedCodes = zones.reduce((acc, z) => acc + (z.alertas_rojas || 0), 0);

  // Filtrado de paquetes dentro del modal de inspección de zona
  const getFilteredModalItems = () => {
    const cleanSearch = modalSearch.trim().toLowerCase();
    let sourceList = [];
    if (modalTab === 'alertas') {
      sourceList = (zonePackagesData.en_bodega || []).filter((p) => p.alerta_roja);
    } else if (modalTab === 'pendientes') {
      sourceList = zonePackagesData.pendientes || [];
    } else {
      sourceList = zonePackagesData.en_bodega || [];
    }

    if (!cleanSearch) return sourceList;
    return sourceList.filter(
      (p) =>
        p.guia.toLowerCase().includes(cleanSearch) ||
        (p.cliente || '').toLowerCase().includes(cleanSearch) ||
        (p.direccion || '').toLowerCase().includes(cleanSearch)
    );
  };

  const filteredModalItems = getFilteredModalItems();

  return (
    <div className="space-y-4 md:space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header Superior */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <ScanBarcode className="w-6 h-6 md:w-7 md:h-7 text-blue-400 flex-shrink-0" />
            Inventario de Paquetes por Zonas
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Escanea la zona para activarla (o 2 veces en &lt;3s para reiniciar). Si entra un código que no existe en importación, la zona se pondrá en <b className="text-red-400">ROJO</b> para revisión.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleReorganizeMap}
            disabled={reorganizingMap}
            className="touch-target px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            title="Sincronizar todos los paquetes con las zonas donde quedaron y actualizar el Mapa"
          >
            <Map className={`w-4 h-4 ${reorganizingMap ? 'animate-spin' : ''}`} />
            {reorganizingMap ? 'Actualizando Mapa...' : 'Reorganizar Mapa'}
          </button>

          <button
            onClick={handleResetAllZones}
            className="touch-target px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Reiniciar el contador de todas las zonas a cero"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar Todas a 0
          </button>

          <button
            onClick={fetchSummary}
            className="touch-target flex items-center justify-center p-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refrescar resumen"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Banner Global de Alerta Roja si alguna zona tiene códigos que no existen en importación */}
      {totalRedZones > 0 && (
        <div className="p-4 rounded-2xl bg-red-500/15 border-2 border-red-500/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-extrabold text-red-300">
                ¡Atención! Hay {totalUnimportedCodes} código(s) que NO existen en la importación en {totalRedZones} zona(s)
              </h4>
              <p className="text-xs text-red-200/80">
                Haz clic en el botón &ldquo;Revisar Códigos&rdquo; de las zonas marcadas en ROJO para verificar si fue un mal escaneo o un paquete extra.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navegación de vistas */}
      <div className="flex border-b border-white/10 gap-2 overflow-x-auto">
        {[
          { id: 'inventario', label: 'Inventario por Zonas', icon: ScanBarcode },
          { id: 'sin_escanear', label: 'Sin escanear', icon: PackageX }
        ].map((t) => {
          const Icon = t.icon;
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              type="button"
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 touch-target ${
                isSelected
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'sin_escanear' ? (
        <UnscannedOrdersView />
      ) : (
        <>
          {/* Barcode Scanner Main Input Box */}
          <GlassCard className="p-4 md:p-5 border-blue-500/30 bg-blue-500/5 space-y-3">
            <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <ScanBarcode className="w-5 h-5 text-blue-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Escanea aquí el Código de Barras de la Zona o Paquete..."
                  className="w-full bg-slate-950/90 border-2 border-blue-500/40 focus:border-blue-400 rounded-2xl pl-12 pr-10 py-4 md:py-3.5 text-base md:text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-xl transition-all"
                  autoFocus
                />
                {processingScan && (
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400 absolute right-4 top-1/2 -translate-y-1/2" />
                )}
              </div>
              <button
                type="submit"
                disabled={processingScan || !barcodeInput.trim()}
                className="w-full sm:w-auto px-6 py-4 md:py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm md:text-xs rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/25 cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                Procesar Escaneo
              </button>
            </form>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400 px-1">
              <span>💡 Escaneo continuo a distancia habilitado: si un código no existe en la importación, entra a la zona y la pinta en ROJO para revisión.</span>
              <span className="hidden sm:inline font-mono text-blue-400">Escáner listo</span>
            </div>
          </GlassCard>

          {/* Grid Principal: Zona Activa & Tarjeta de Último Paquete Escaneado */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Banner de Zona Activa */}
            <GlassCard
              className={`p-4 md:p-6 lg:col-span-2 flex flex-col justify-between space-y-4 transition-all ${
                activeZone?.tiene_alerta_roja || activeZone?.alertas_rojas > 0
                  ? 'border-2 border-red-500 bg-red-500/15 shadow-lg shadow-red-500/20'
                  : 'border-emerald-500/30 bg-emerald-500/5'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {activeZone?.tiene_alerta_roja || activeZone?.alertas_rojas > 0 ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-400 animate-bounce" />
                      <span className="text-xs font-extrabold text-red-300 uppercase tracking-wider">
                        ⚠️ ZONA ACTIVA CON ALERTA ({activeZone.alertas_rojas} CÓDIGO NO IMPORTADO)
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        Zona Activa de Escaneo
                      </span>
                    </>
                  )}
                </div>
                {activeZone && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openZonePackagesModal(activeZone)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        activeZone.tiene_alerta_roja || activeZone.alertas_rojas > 0
                          ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30'
                          : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver Códigos ({activeZone.total_bodega})
                    </button>
                    <button
                      onClick={() => handleResetZone(activeZone)}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reiniciar a 0
                    </button>
                  </div>
                )}
              </div>

              {activeZone ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <h3 className="text-xl md:text-2xl font-black text-white flex items-center gap-3 break-words">
                      <span
                        className="w-4 h-4 rounded-full shadow-lg flex-shrink-0"
                        style={{
                          backgroundColor:
                            activeZone.tiene_alerta_roja || activeZone.alertas_rojas > 0
                              ? '#ef4444'
                              : activeZone.color || '#10b981'
                        }}
                      />
                      {activeZone.nombre}
                    </h3>
                    <p className="text-xs font-mono text-slate-300 mt-1 break-all">
                      Código de Barras: <span className="text-emerald-300 font-bold">{activeZone.codigo_barras}</span>
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2">
                    <span className="text-xs text-slate-300 font-medium">Escaneados en Bodega</span>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-4xl font-black font-mono tracking-tight ${
                          activeZone.tiene_alerta_roja || activeZone.alertas_rojas > 0
                            ? 'text-red-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {activeZone.total_bodega}
                      </span>
                      <span className="text-sm font-mono text-slate-400">
                        / {activeZone.total_esperados || 0} esp.
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-700/60 rounded-2xl bg-slate-950/30">
                  Escanea el código de barras de una zona física o haz clic en alguna zona abajo para comenzar a contar paquetes.
                </div>
              )}
            </GlassCard>

            {/* Panel del Último Paquete Escaneado */}
            <GlassCard
              className={`p-4 md:p-6 space-y-3 flex flex-col justify-between ${
                lastScannedPackage?.is_unimported_alert
                  ? 'border-2 border-red-500/80 bg-red-500/10'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-blue-400" />
                  Último Código Escaneado
                </h4>
                {lastScannedPackage?.is_unimported_alert ? (
                  <Badge variant="red" className="bg-red-500 text-white border-red-400 text-[10px]">
                    ⚠️ NO EN IMPORTACIÓN
                  </Badge>
                ) : lastScannedPackage?.zone_changed ? (
                  <Badge variant="amber" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
                    Reubicado de Zona
                  </Badge>
                ) : null}
              </div>

              {lastScannedPackage ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">Código / Guía:</span>
                    <span
                      className={`text-sm font-mono font-extrabold break-all text-right min-w-0 ${
                        lastScannedPackage.is_unimported_alert ? 'text-red-300' : 'text-blue-300'
                      }`}
                    >
                      {lastScannedPackage.guia}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Estado:</span>
                    {lastScannedPackage.is_unimported_alert ? (
                      <Badge variant="red">REVISAR EN ZONA</Badge>
                    ) : (
                      <Badge variant="emerald">{lastScannedPackage.estado}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 pt-1">
                    <span className="text-slate-500 block text-[10px]">Detalle / Dirección:</span>
                    <p className="font-semibold text-slate-200 line-clamp-2 mt-0.5">
                      {lastScannedPackage.direccion}
                    </p>
                  </div>
                  {lastScannedPackage.was_in_bodega_other_zone && (
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-1.5 mt-2">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>
                        Salió de <b>{lastScannedPackage.previous_zone} (-1)</b> y entró a <b>{lastScannedPackage.zona_nombre} (+1)</b>
                      </span>
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

          {/* Listado de Zonas Registradas (Tarjetas con Estado, Alertas Rojas y Botón Ver Códigos) */}
          <GlassCard className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <h3 className="text-sm font-bold text-white">
                  Zonas de Bodega ({zones.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Haz clic en una tarjeta para activarla o en &ldquo;Ver Códigos&rdquo; para inspeccionar sus guías
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                Cargando zonas de la empresa...
              </div>
            ) : zones.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-700/60 rounded-2xl bg-slate-900/30">
                No se han registrado zonas GeoJSON. Dirígete a Configuración &rarr; Sectores para importar zonas.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {zones.map((z) => {
                  const isSelected = activeZone?.id === z.id;
                  const hasRedAlert = z.tiene_alerta_roja || (z.alertas_rojas || 0) > 0;

                  return (
                    <div
                      key={z.id}
                      onClick={() => {
                        setActiveZone(z);
                        playSound(hasRedAlert ? 'unimported_alert' : 'success');
                        speakText(`${z.nombre}, ${z.total_bodega} paquetes`);
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                        hasRedAlert
                          ? 'border-2 border-red-500 bg-red-500/15 shadow-lg shadow-red-500/20 ring-2 ring-red-500/40'
                          : isSelected
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/30'
                          : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: hasRedAlert ? '#ef4444' : z.color || '#10b981' }}
                            />
                            <h4 className="text-xs font-bold text-white truncate" title={z.nombre}>
                              {z.nombre}
                            </h4>
                          </div>
                          {hasRedAlert ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white flex items-center gap-1 shrink-0">
                              ⚠️ {z.alertas_rojas} ALERTA
                            </span>
                          ) : isSelected ? (
                            <Badge variant="emerald" className="text-[10px]">ACTIVA</Badge>
                          ) : null}
                        </div>

                        {hasRedAlert && (
                          <div className="p-2 rounded-xl bg-red-950/80 border border-red-500/50 text-[11px] text-red-200 font-semibold">
                            ⚠️ Contiene {z.alertas_rojas} código(s) que no existe(n) en la importación.
                          </div>
                        )}
                      </div>

                      <div className="flex items-end justify-between border-t border-slate-800/60 pt-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-mono text-slate-400 break-all block">
                            CB: <b className="text-slate-300">{z.codigo_barras}</b>
                          </span>
                          <span className="text-[11px] font-mono text-slate-300 mt-0.5 block">
                            Esperados: <b>{z.total_esperados || 0}</b>
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-2xl font-black font-mono ${
                              hasRedAlert ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {z.total_bodega}
                          </span>
                          <span className="text-[10px] text-slate-400 block -mt-1">
                            de {z.total_esperados || 0}
                          </span>
                        </div>
                      </div>

                      {/* Botón para visualizar los códigos de la zona */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openZonePackagesModal(z);
                        }}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          hasRedAlert
                            ? 'bg-red-500 hover:bg-red-400 text-white shadow-md shadow-red-500/30'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-white/10'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {hasRedAlert
                          ? `Revisar Códigos (${z.alertas_rojas} en rojo)`
                          : `Ver Códigos (${z.total_bodega})`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* Tabla de Escaneos Recientes de la Sesión */}
          {recentScans.length > 0 && (
            <GlassCard className="p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-blue-400" />
                  Historial de Escaneos de esta Sesión ({recentScans.length})
                </h3>
              </div>

              <div className="rt-wrap overflow-x-auto">
                <table className="rt w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2">Hora</th>
                      <th className="pb-2">Guía / Código</th>
                      <th className="pb-2">Zona Asignada</th>
                      <th className="pb-2">Dirección / Estado</th>
                      <th className="pb-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentScans.map((scan, idx) => (
                      <tr
                        key={idx}
                        className={
                          scan.is_unimported_alert
                            ? 'bg-red-500/15 hover:bg-red-500/20'
                            : 'hover:bg-slate-900/40'
                        }
                      >
                        <td data-label="Hora" className="py-2.5 font-mono text-slate-400">{scan.timestamp}</td>
                        <td className="rt-title py-2.5 font-mono font-bold text-blue-300 break-all">
                          {scan.guia}
                        </td>
                        <td data-label="Zona Asignada" className="py-2.5 font-bold text-emerald-400">
                          {scan.zona_nombre}
                        </td>
                        <td data-label="Dirección" className="py-2.5 text-slate-300 max-w-xs truncate">
                          {scan.direccion}
                        </td>
                        <td data-label="Detalle" className="py-2.5">
                          {scan.is_unimported_alert ? (
                            <span className="text-[11px] font-bold text-red-200 bg-red-500/30 px-2 py-0.5 rounded border border-red-400/50">
                              ⚠️ NO EXISTE EN IMPORTACIÓN
                            </span>
                          ) : scan.already_in_zone ? (
                            <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              Ya estaba en esta zona
                            </span>
                          ) : scan.was_in_bodega_other_zone ? (
                            <span className="text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                              Movido desde {scan.previous_zone} (-1)
                            </span>
                          ) : scan.zone_changed ? (
                            <span className="text-[11px] text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                              Reubicado de {scan.previous_zone}
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-400">OK en Zona</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* MODAL PARA VISUALIZAR Y GESTIONAR LOS CÓDIGOS DE UNA ZONA */}
      {inspectZone && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md"
          onClick={() => setInspectZone(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div
              className={`p-4 sm:p-6 border-b flex items-start sm:items-center justify-between gap-4 ${
                zonePackagesData.alertas_rojas_count > 0
                  ? 'bg-red-500/15 border-red-500/40'
                  : 'bg-slate-900/90 border-white/10'
              }`}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full"
                    style={{
                      backgroundColor:
                        zonePackagesData.alertas_rojas_count > 0
                          ? '#ef4444'
                          : inspectZone.color || '#10b981'
                    }}
                  />
                  <h3 className="text-lg sm:text-xl font-black text-white">
                    Códigos en {inspectZone.nombre}
                  </h3>
                  {zonePackagesData.alertas_rojas_count > 0 && (
                    <Badge variant="red" className="bg-red-500 text-white">
                      ⚠️ {zonePackagesData.alertas_rojas_count} NO EN IMPORTACIÓN
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Verifica qué códigos fueron escaneados en esta zona, elimina errores de lectura o confirma paquetes extra.
                </p>
              </div>

              <button
                onClick={() => setInspectZone(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas y Buscador del Modal */}
            <div className="p-4 border-b border-white/10 bg-slate-950/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setModalTab('bodega')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    modalTab === 'bodega'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  En Bodega ({zonePackagesData.total_bodega || 0})
                </button>
                <button
                  onClick={() => setModalTab('alertas')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    modalTab === 'alertas'
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : zonePackagesData.alertas_rojas_count > 0
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  No en Importación ({zonePackagesData.alertas_rojas_count || 0})
                </button>
                <button
                  onClick={() => setModalTab('pendientes')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    modalTab === 'pendientes'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Faltantes por Escanear ({zonePackagesData.total_pendientes || 0})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Buscar guía, cliente..."
                  className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Cuerpo / Listado de Códigos */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loadingZonePackages ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  Cargando códigos de la zona...
                </div>
              ) : filteredModalItems.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                  No hay códigos en esta categoría para mostrar.
                </div>
              ) : (
                filteredModalItems.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      pkg.alerta_roja
                        ? 'bg-red-500/15 border-red-500/60 shadow-md shadow-red-500/10'
                        : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-extrabold text-sm text-white break-all">
                          {pkg.guia}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyGuia(pkg.guia)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          title="Copiar código"
                        >
                          {copiedGuia === pkg.guia ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {pkg.alerta_roja && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white">
                            ⚠️ NO EXISTE EN IMPORTACIÓN
                          </span>
                        )}
                        {pkg.es_no_importado && pkg.verificado_bodega && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                            Paquete Extra Verificado
                          </span>
                        )}
                        {pkg.reubicado && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Era de: {pkg.zona_original_nombre}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 truncate">
                        <b className="text-slate-400">Cliente:</b> {pkg.cliente} &bull;{' '}
                        <b className="text-slate-400">Dirección:</b> {pkg.direccion}
                      </p>
                    </div>

                    {/* Botones de Acción por Paquete */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {pkg.alerta_roja && (
                        <button
                          type="button"
                          onClick={() => handleVerifyExtraPackage(pkg)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="Confirmar que sí es un paquete físico real aunque no vino en el archivo de importación"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Confirmar Paquete Real
                        </button>
                      )}

                      {pkg.estado === 'EN_BODEGA' && (
                        <button
                          type="button"
                          onClick={() => handleRemovePackageFromZone(pkg)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                            pkg.alerta_roja
                              ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm'
                              : 'bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-white/10'
                          }`}
                          title={
                            pkg.alerta_roja
                              ? 'Eliminar este código mal escaneado de la zona'
                              : 'Sacar esta guía del conteo en bodega de la zona'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {pkg.alerta_roja ? 'Eliminar Mal Escaneo' : 'Retirar de Zona'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InventarioZonasPage;

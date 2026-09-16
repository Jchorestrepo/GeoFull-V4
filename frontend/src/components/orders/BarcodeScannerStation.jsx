import React, { useState, useRef, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  QrCode,
  Volume2,
  VolumeX,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Maximize2,
  Minimize2,
  Tv,
  MapPin,
  X
} from 'lucide-react';
import axios from 'axios';

const SECTOR_PALETTE = [
  { bg: 'from-blue-900 via-slate-900 to-slate-950', border: 'border-blue-500', text: 'text-blue-400', badge: 'bg-blue-500/30 text-blue-300' },
  { bg: 'from-emerald-900 via-slate-900 to-slate-950', border: 'border-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/30 text-emerald-300' },
  { bg: 'from-purple-900 via-slate-900 to-slate-950', border: 'border-purple-500', text: 'text-purple-400', badge: 'bg-purple-500/30 text-purple-300' },
  { bg: 'from-amber-900 via-slate-900 to-slate-950', border: 'border-amber-500', text: 'text-amber-400', badge: 'bg-amber-500/30 text-amber-300' },
  { bg: 'from-pink-900 via-slate-900 to-slate-950', border: 'border-pink-500', text: 'text-pink-400', badge: 'bg-pink-500/30 text-pink-300' }
];

function getSectorStyle(sectorName) {
  if (!sectorName) {
    return { bg: 'from-red-950 via-slate-950 to-red-950', border: 'border-red-500/80', text: 'text-red-400', badge: 'bg-red-500/30 text-red-300' };
  }
  let hash = 0;
  for (let i = 0; i < sectorName.length; i++) hash = sectorName.charCodeAt(i) + ((hash << 5) - hash);
  return SECTOR_PALETTE[Math.abs(hash) % SECTOR_PALETTE.length];
}

export function BarcodeScannerStation({ onOrderFound }) {
  const [inputGuia, setInputGuia] = useState('');
  const [scannedResult, setScannedResult] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [searching, setSearching] = useState(false);
  const [isTvMode, setIsTvMode] = useState(false);
  const inputRef = useRef(null);
  const tvInputRef = useRef(null);

  // Auto-enfoque automático al montar la estación de escaneo
  useEffect(() => {
    if (isTvMode) {
      tvInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [isTvMode]);

  // Reproducir efectos de sonido (Audio Beep)
  const playBeep = (type = 'success') => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type === 'success' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(type === 'success' ? 880 : 330, audioCtx.currentTime); // 880Hz A5 vs 330Hz E4
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  };

  // Función de Síntesis de Voz (Web Speech API)
  const speakZone = (textToSpeak) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Detener locución previa
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'es-CO';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("No se pudo reproducir la voz:", err);
    }
  };

  const handleSearchGuia = async (guiaToSearch) => {
    const term = (guiaToSearch || inputGuia).trim();
    if (!term) return;

    setSearching(true);
    setNotFound(false);
    setScannedResult(null);

    try {
      // Buscar pedido por número de guía
      const res = await axios.get(`/api/v1/orders/?guia=${encodeURIComponent(term)}`);

      const matchedOrder = res.data.find(
        o => o.guia.toLowerCase() === term.toLowerCase()
      ) || res.data[0];

      if (matchedOrder) {
        setScannedResult(matchedOrder);
        onOrderFound?.(matchedOrder);
        playBeep('success');

        // Locución de Voz
        if (matchedOrder.zona_nombre) {
          const cleanZoneName = matchedOrder.zona_nombre.replace(/^\d+[_-\s]*/, '');
          speakZone(`Zona ${cleanZoneName}`);
        } else {
          speakZone("Atención, paquete fuera de zona");
        }
      } else {
        setNotFound(true);
        playBeep('error');
        speakZone("Guía no encontrada");
      }
    } catch (err) {
      console.error("Error al buscar guía por código de barras", err);
      setNotFound(true);
      playBeep('error');
      speakZone("Error al consultar código");
    } finally {
      setSearching(false);
      setInputGuia('');
      if (isTvMode) {
        tvInputRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchGuia();
    }
  };

  const currentStyle = scannedResult ? getSectorStyle(scannedResult.zona_nombre) : null;

  return (
    <>
      <GlassCard className="p-6 rounded-3xl border border-blue-500/30 bg-slate-900/90 shadow-2xl relative overflow-hidden">
        {/* Glow background effect */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <QrCode className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                Estación de Escaneo por Voz & Pantalla Gigante
                <Badge variant="emerald" className="flex items-center gap-1 text-[10px]">
                  <Sparkles className="w-3 h-3 text-emerald-400 fill-emerald-400/20" />
                  Voz Inteligente
                </Badge>
              </h3>
              <p className="text-xs text-slate-400">
                Escanea el código de barras con la pistola USB. El sector se anunciará por voz y se desplegará en pantalla gigante.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle Modo TV Pantalla Gigante */}
            <button
              onClick={() => setIsTvMode(true)}
              className="flex items-center gap-2 py-2 px-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20"
            >
              <Tv className="w-4 h-4" />
              <span>Modo TV / Pantalla Gigante</span>
            </button>

            {/* Toggle de Voz */}
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`flex items-center gap-2 py-2 px-3.5 rounded-2xl text-xs font-bold transition-all border ${
                voiceEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-400 animate-bounce" /> : <VolumeX className="w-4 h-4" />}
              <span>{voiceEnabled ? 'Voz Activada' : 'Voz Silenciada'}</span>
            </button>
          </div>
        </div>

        {/* Input optimizado para Pistola Lectora de Códigos */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputGuia}
            onChange={(e) => setInputGuia(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Esperando lectura de pistola de código de barras o escribe la Guía y presiona Enter..."
            className="w-full pl-12 pr-28 py-3.5 rounded-2xl bg-slate-950 border-2 border-blue-500/40 focus:border-blue-400 text-white font-mono font-bold text-sm placeholder:text-slate-500 outline-none shadow-inner transition-all"
          />
          <button
            onClick={() => handleSearchGuia()}
            disabled={searching || !inputGuia.trim()}
            className="absolute right-2 top-2 bottom-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {/* TARJETA RESULTADO HERO DESTACADA CON FUENTE GRANDE */}
        {scannedResult && (
          <div className={`p-6 rounded-3xl border-2 transition-all animate-fadeIn bg-gradient-to-r ${currentStyle.bg} ${currentStyle.border} shadow-2xl`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 text-xs font-mono font-bold text-slate-300">
                  <span>GUÍA ESCANEADA:</span>
                  <span className="text-blue-400 text-sm">{scannedResult.guia}</span>
                </div>

                <div className="text-base font-extrabold text-white">
                  {scannedResult.direccion_limpia || scannedResult.direccion_original}
                </div>

                <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-slate-300">
                  <span>Cliente: <strong className="text-white font-bold">{scannedResult.cliente || 'Consumidor Final'}</strong></span>
                  <span>Tel: <strong className="text-white font-mono">{scannedResult.telefono_cliente || 'N/A'}</strong></span>
                </div>
              </div>

              {/* ZONA ASIGNADA PANTALLA GIGANTE EN TARJETA */}
              <div className="shrink-0 w-full md:w-auto">
                {scannedResult.zona_nombre ? (
                  <div className="p-6 rounded-3xl bg-slate-950/80 border-2 border-emerald-500/60 text-center shadow-2xl min-w-[280px]">
                    <p className="text-xs text-emerald-400 font-extrabold uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      SECTOR / ZONA ASIGNADA
                    </p>
                    <h4 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight text-emerald-300 drop-shadow-md">
                      {scannedResult.zona_nombre}
                    </h4>
                  </div>
                ) : (
                  <div className="p-6 rounded-3xl bg-slate-950/80 border-2 border-red-500/60 text-center shadow-2xl min-w-[280px]">
                    <p className="text-xs text-red-400 font-extrabold uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      ALERTA OPERATIVA
                    </p>
                    <h4 className="text-3xl md:text-4xl font-black text-red-400 uppercase tracking-tight">
                      FUERA DE ZONA
                    </h4>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ESTADO DE NO ENCONTRADO */}
        {notFound && (
          <div className="p-5 rounded-3xl bg-red-950/80 border-2 border-red-500/60 flex items-center gap-4 text-red-200 animate-fadeIn">
            <XCircle className="w-8 h-8 text-red-400 shrink-0" />
            <div>
              <h4 className="font-extrabold text-base text-white">Guía No Encontrada</h4>
              <p className="text-xs text-red-300">
                No existe ningún pedido registrado con ese código de barras.
              </p>
            </div>
          </div>
        )}
      </GlassCard>

      {/* OVERLAY COMPLETO: MODO TV / PANTALLA GIGANTE DE ALMACÉN */}
      {isTvMode && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-8 overflow-hidden animate-fadeIn">
          {/* Top TV Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                <Tv className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  GeoFull V4 — Estación TV de Escaneo Almacén
                </h2>
                <p className="text-xs text-slate-400">Modo de Alta Visibilidad para Monitores / Televisores de Bodega</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`flex items-center gap-2 py-2 px-4 rounded-2xl text-xs font-bold transition-all border ${
                  voiceEnabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
                <span>{voiceEnabled ? 'Voz Activada' : 'Voz Silenciada'}</span>
              </button>

              <button
                onClick={() => setIsTvMode(false)}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Scanner Input Bar in TV Mode */}
          <div className="mb-8">
            <div className="relative">
              <Search className="w-8 h-8 absolute left-5 top-1/2 -translate-y-1/2 text-purple-400" />
              <input
                ref={tvInputRef}
                type="text"
                value={inputGuia}
                onChange={(e) => setInputGuia(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escanea con la pistola de código de barras..."
                className="w-full pl-16 pr-36 py-5 rounded-3xl bg-slate-900 border-4 border-purple-500/50 focus:border-purple-400 text-white font-mono font-black text-2xl outline-none shadow-2xl"
              />
              <button
                onClick={() => handleSearchGuia()}
                disabled={searching || !inputGuia.trim()}
                className="absolute right-3 top-3 bottom-3 px-8 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-lg transition-colors disabled:opacity-40"
              >
                {searching ? '...' : 'Buscar'}
              </button>
            </div>
          </div>

          {/* PANTALLA GIGANTE RESULTADO ESCANEO */}
          <div className="flex-1 flex items-center justify-center">
            {scannedResult ? (
              <div className={`w-full max-w-6xl p-12 rounded-3xl border-4 bg-gradient-to-r ${currentStyle.bg} ${currentStyle.border} shadow-2xl flex flex-col items-center text-center space-y-6 animate-fadeIn`}>
                <div className="px-6 py-2 rounded-full bg-slate-950/80 border border-white/20 text-slate-300 font-mono text-xl font-bold">
                  GUÍA ESCANEADA: <span className="text-blue-400">{scannedResult.guia}</span>
                </div>

                {/* GIANT SECTOR DISPLAY */}
                <div className="w-full p-10 rounded-3xl bg-slate-950/90 border-4 border-white/10 shadow-2xl">
                  <p className="text-lg text-slate-400 font-black uppercase tracking-widest mb-2">
                    SECTOR / ZONA DE DESPACHO
                  </p>
                  <h1 className="text-6xl md:text-8xl font-black text-white uppercase tracking-tight text-emerald-400 drop-shadow-2xl">
                    {scannedResult.zona_nombre || 'FUERA DE ZONA'}
                  </h1>
                </div>

                <div className="text-2xl font-bold text-slate-200">
                  {scannedResult.direccion_limpia || scannedResult.direccion_original}
                </div>

                <div className="flex items-center justify-center gap-8 text-lg text-slate-300">
                  <span>Cliente: <strong className="text-white font-bold">{scannedResult.cliente || 'Consumidor Final'}</strong></span>
                  <span>Teléfono: <strong className="text-white font-mono">{scannedResult.telefono_cliente || 'N/A'}</strong></span>
                </div>
              </div>
            ) : notFound ? (
              <div className="w-full max-w-4xl p-12 rounded-3xl bg-red-950/90 border-4 border-red-500 text-center space-y-4 animate-fadeIn">
                <XCircle className="w-20 h-20 text-red-400 mx-auto" />
                <h1 className="text-5xl font-black text-white">GUÍA NO ENCONTRADA</h1>
                <p className="text-xl text-red-300">Escanea otro paquete de la lista.</p>
              </div>
            ) : (
              <div className="text-center text-slate-500 space-y-4">
                <QrCode className="w-32 h-32 mx-auto text-slate-700 animate-pulse" />
                <h2 className="text-3xl font-extrabold text-slate-400">ESTACIÓN TV EN ESPERA DE ESCANEO</h2>
                <p className="text-lg text-slate-500">Apunta la pistola de código de barras al paquete...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

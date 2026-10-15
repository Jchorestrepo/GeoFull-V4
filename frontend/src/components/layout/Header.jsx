import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import {
  Building2,
  Sparkles,
  LogOut,
  ShieldAlert,
  Compass,
  Search,
  X
} from 'lucide-react';

export function Header() {
  const { user, activeTenantId, logout, isImpersonating, restoreSuperAdminSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');

  // Si estamos en historial con parámetro ?q=, sincronizar el input
  useEffect(() => {
    if (location.pathname.startsWith('/historial')) {
      const params = new URLSearchParams(location.search);
      const q = params.get('q') || params.get('guia');
      if (q) {
        setSearchQuery(q);
      }
    }
  }, [location.pathname, location.search]);

  const handleExitSupportMode = () => {
    restoreSuperAdminSession();
    navigate('/saas-admin');
  };

  const doSearch = (queryVal) => {
    const trimmed = String(queryVal !== undefined ? queryVal : searchQuery).trim();
    if (!trimmed) return;

    // Navegar inmediatamente a /historial con el parámetro de búsqueda y estado
    navigate(`/historial?q=${encodeURIComponent(trimmed)}`, {
      state: { inputText: trimmed, timestamp: Date.now() }
    });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    doSearch(searchQuery);
  };

  // Al pegar una guía o varias guías en el input, disparar navegación y consulta inmediata
  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text');
    if (pasted && pasted.trim()) {
      e.preventDefault();
      setSearchQuery(pasted);
      doSearch(pasted);
    }
  };

  return (
    <header className="space-y-2 mx-3 mt-3 mb-3 md:my-4 md:ml-0 md:mr-4 shrink-0" style={{ paddingTop: 'var(--safe-top)' }}>
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-purple-600/90 text-white text-xs px-3 md:px-4 py-2 rounded-2xl flex items-center justify-between gap-2 shadow-lg shadow-purple-500/20 backdrop-blur-md border border-purple-400/40">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 shrink-0 text-purple-200 animate-pulse" />
            <span className="truncate">
              <strong className="hidden sm:inline">Modo Soporte Activo: </strong>
              <span className="sm:hidden font-bold">Soporte: </span>
              <span className="hidden sm:inline">Suplantando la empresa </span>
              <strong className="uppercase">{activeTenantId}</strong>
            </span>
          </div>
          <button
            onClick={handleExitSupportMode}
            title="Volver a Consola SaaS Admin"
            className="shrink-0 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">Volver a Consola SaaS Admin</span>
            <span className="sm:hidden">Salir</span>
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="apple-glass rounded-3xl p-3 md:p-4 flex items-center justify-between gap-3 border border-white/10 shadow-2xl">
        {/* Lado Izquierdo: Empresa y Tenant */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          {/* Logo en móvil */}
          <div className="md:hidden w-9 h-9 shrink-0 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white flex items-center gap-2 min-w-0">
              <span className="truncate max-w-[120px] sm:max-w-[160px] md:max-w-[200px]">
                {user?.empresa_nombre || 'Empresa Demo Logística'}
              </span>
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 uppercase max-w-[6rem] truncate">
                {activeTenantId}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              <span className="hidden sm:inline">Usuario: </span>
              <span className="font-semibold text-slate-200">{user?.nombre_completo || user?.email}</span>
              <span className="hidden lg:inline"> ({user?.rol || 'operario'})</span>
            </p>
          </div>
        </div>

        {/* Centro: Buscador Global de Guías (Desktop & Tablet) */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden sm:flex flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-2 lg:mx-4"
        >
          <div className="relative group w-full">
            <Search className="w-4 h-4 text-slate-400 group-focus-within:text-blue-400 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPaste={handlePaste}
              placeholder="Rastrear guía(s)... (Ej: 6080126004088 o pegar)"
              className="w-full bg-slate-950/60 hover:bg-slate-950/80 focus:bg-slate-950/95 border border-white/10 focus:border-blue-500/60 rounded-2xl pl-10 pr-16 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-mono transition-all shadow-inner"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-500 font-mono absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                ↵ Enter
              </span>
            )}
          </div>
        </form>

        {/* Lado Derecho: Estado PostGIS + Avatar + Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Badge variant="titanium" className="hidden xl:inline-flex">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            PostGIS 7 Niveles Active
          </Badge>

          {/* Desktop User Avatar & Logout */}
          <div className="hidden md:flex items-center gap-2 pl-2 lg:border-l border-slate-700/60">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300">
              {(user?.nombre_completo || user?.email || 'U').charAt(0).toUpperCase()}
            </div>

            <button
              onClick={logout}
              title="Cerrar Sesión"
              className="p-2 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer active:scale-95"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile User Avatar & Logout */}
          <div className="md:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300">
              {(user?.nombre_completo || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <button
              onClick={logout}
              title="Cerrar Sesión"
              className="p-2 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer active:scale-95"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Buscador Móvil (Solo visible en pantallas pequeñas < sm) */}
      <div className="sm:hidden px-1">
        <form onSubmit={handleSearchSubmit} className="w-full">
          <div className="relative group w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPaste={handlePaste}
              placeholder="Rastrear guía(s)... (Pegar o consultar)"
              className="w-full bg-slate-900/60 hover:bg-slate-900/80 focus:bg-slate-950/95 border border-white/10 focus:border-blue-500/60 rounded-2xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-mono transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </header>
  );
}

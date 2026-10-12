import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import { Building2, Bell, Sparkles, LogOut, UserCheck, ShieldAlert, RefreshCw, Compass } from 'lucide-react';

export function Header() {
  const { user, activeTenantId, logout, isImpersonating, restoreSuperAdminSession } = useAuth();
  const navigate = useNavigate();

  const handleExitSupportMode = () => {
    restoreSuperAdminSession();
    navigate('/saas-admin');
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

      {/* Main Header */}
      <div className="apple-glass rounded-3xl p-3 md:p-4 flex items-center justify-between gap-3 border border-white/10 shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo en móvil (el sidebar está oculto) */}
          <div className="md:hidden w-9 h-9 shrink-0 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white flex items-center gap-2 min-w-0">
              <span className="truncate">{user?.empresa_nombre || 'Empresa Demo Logística'}</span>
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 uppercase max-w-[7rem] truncate">
                {activeTenantId}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              <span className="hidden sm:inline">Usuario: </span>
              <span className="font-semibold text-slate-200">{user?.nombre_completo || user?.email}</span>
              <span className="hidden sm:inline"> ({user?.rol || 'operario'})</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="titanium" className="hidden lg:inline-flex">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            PostGIS 7 Niveles Active
          </Badge>

          {/* User initials badge & Logout (en móvil viven en el sheet "Más") */}
          <div className="hidden md:flex items-center gap-2 pl-2 lg:border-l border-slate-700/60">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300">
              {(user?.nombre_completo || user?.email || 'U').charAt(0).toUpperCase()}
            </div>

            <button
              onClick={logout}
              title="Cerrar Sesión"
              className="p-2 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="md:hidden w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300">
            {(user?.nombre_completo || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}

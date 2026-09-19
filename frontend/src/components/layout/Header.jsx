import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import { Building2, Bell, Sparkles, LogOut, UserCheck, ShieldAlert, RefreshCw } from 'lucide-react';

export function Header() {
  const { user, activeTenantId, logout, isImpersonating, restoreSuperAdminSession } = useAuth();
  const navigate = useNavigate();

  const handleExitSupportMode = () => {
    restoreSuperAdminSession();
    navigate('/saas-admin');
  };

  return (
    <header className="space-y-2 my-4 mr-4">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-purple-600/90 text-white text-xs px-4 py-2 rounded-2xl flex items-center justify-between shadow-lg shadow-purple-500/20 backdrop-blur-md border border-purple-400/40">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-purple-200 animate-pulse" />
            <span>
              <strong>Modo Soporte Activo:</strong> Suplantando la empresa <strong className="uppercase">{activeTenantId}</strong>.
            </span>
          </div>
          <button
            onClick={handleExitSupportMode}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
          >
            Volver a Consola SaaS Admin
          </button>
        </div>
      )}

      {/* Main Header */}
      <div className="apple-glass rounded-3xl p-4 flex items-center justify-between border border-white/10 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-2">
              {user?.empresa_nombre || 'Empresa Demo Logística'}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 uppercase">
                {activeTenantId}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Usuario: <span className="font-semibold text-slate-200">{user?.nombre_completo || user?.email}</span> ({user?.rol || 'operario'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="titanium" className="hidden sm:inline-flex">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            PostGIS 7 Niveles Active
          </Badge>

          {/* User initials badge & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700/60">
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
        </div>
      </div>
    </header>
  );
}

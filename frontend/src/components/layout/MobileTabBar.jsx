import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NAVIGATION_ITEMS, SAAS_ADMIN_ITEM } from './Sidebar';
import { MoreHorizontal, X, LogOut, ShieldAlert, ChevronRight } from 'lucide-react';

const PRIMARY_PATHS = ['/dashboard', '/sectorizacion', '/inventario-zonas', '/conciliacion'];

/**
 * Navegación inferior estilo iOS — solo visible en móvil (< md).
 * Super Admin: el acceso SaaS reemplaza a Conciliación en la barra (Conciliación pasa a "Más").
 */
export function MobileTabBar() {
  const { user, logout, isImpersonating, restoreSuperAdminSession } = useAuth();
  const canAccessSaaSAdmin = user?.rol === 'super_admin' || isImpersonating;
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Cerrar el sheet al cambiar de ruta
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  // Bloquear scroll del fondo con el sheet abierto
  useEffect(() => {
    if (!moreOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  let primary = NAVIGATION_ITEMS.filter((i) => PRIMARY_PATHS.includes(i.path));
  if (canAccessSaaSAdmin) {
    primary = [...primary.filter((i) => i.path !== '/conciliacion'), SAAS_ADMIN_ITEM];
  }
  const primaryPaths = primary.map((i) => i.path);
  const secondary = NAVIGATION_ITEMS.filter((i) => !primaryPaths.includes(i.path));
  const moreIsActive = secondary.some((i) => location.pathname.startsWith(i.path));

  const handleExitSupportMode = () => {
    restoreSuperAdminSession();
    navigate('/saas-admin');
  };

  return (
    <>
      {/* Tab Bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 px-3 pt-2 pb-safe bg-slate-950/80 backdrop-blur-2xl border-t border-white/10"
        aria-label="Navegación principal"
      >
        <ul className="grid grid-cols-5 gap-1">
          {primary.map((item) => {
            const Icon = item.icon;
            const isSaaS = item.path === SAAS_ADMIN_ITEM.path;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-1 h-12 rounded-2xl text-[10px] font-semibold tracking-tight transition-colors ${
                      isActive
                        ? isSaaS
                          ? 'text-purple-300 bg-purple-600/15'
                          : 'text-blue-300 bg-blue-600/15'
                        : 'text-slate-400 active:bg-white/5'
                    }`
                  }
                >
                  <Icon className={`w-5 h-5 ${isSaaS ? 'text-purple-400' : ''}`} />
                  <span className="truncate max-w-full px-0.5">{item.shortLabel}</span>
                </NavLink>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`w-full flex flex-col items-center justify-center gap-1 h-12 rounded-2xl text-[10px] font-semibold tracking-tight transition-colors ${
                moreIsActive ? 'text-blue-300 bg-blue-600/15' : 'text-slate-400 active:bg-white/5'
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Sheet "Más" */}
      {moreOpen && (
        <div className="md:hidden modal-overlay bg-black/60 backdrop-blur-md" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Más opciones"
            className="modal-sheet apple-glass bg-slate-900/95 rounded-t-3xl border border-white/10 px-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Perfil */}
            <div className="flex items-center justify-between gap-3 py-3 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm font-bold text-blue-300">
                  {(user?.nombre_completo || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user?.nombre_completo || user?.email}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {user?.empresa_nombre || 'Empresa Demo Logística'} · {user?.rol || 'operario'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="touch-target p-2 rounded-full bg-white/5 text-slate-300 flex items-center justify-center"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Módulos secundarios */}
            <ul className="py-2 space-y-1">
              {secondary.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center justify-between gap-3 px-3 h-14 rounded-2xl text-sm font-medium transition-colors ${
                          isActive ? 'bg-blue-600/20 text-white border border-blue-500/40' : 'text-slate-200 active:bg-white/5 border border-transparent'
                        }`
                      }
                    >
                      <span className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-slate-800/80 border border-white/5 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-blue-400" />
                        </span>
                        {item.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </NavLink>
                  </li>
                );
              })}
            </ul>

            {/* Acciones de sesión */}
            <div className="pt-2 pb-2 border-t border-white/10 space-y-2">
              {isImpersonating && (
                <button
                  type="button"
                  onClick={handleExitSupportMode}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-purple-600/20 text-purple-200 border border-purple-500/40 text-sm font-semibold"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Volver a Consola SaaS Admin
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MobileTabBar;

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  MapPin,
  PackageCheck,
  Users,
  History,
  Settings,
  ShieldAlert,
  Compass,
  LayoutDashboard
} from 'lucide-react';

const NAVIGATION_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sectorizacion', label: 'Sectorización', icon: MapPin, badge: 'Zonas' },
  { path: '/conciliacion', label: 'Control & Conciliación', icon: PackageCheck },
  { path: '/personal', label: 'Personal & Vales', icon: Users },
  { path: '/historial', label: 'Historial / Rastreo', icon: History },
  { path: '/configuracion', label: 'Configuración', icon: Settings },
];

export function Sidebar() {
  const { user, isImpersonating } = useAuth();
  const canAccessSaaSAdmin = user?.rol === 'super_admin' || isImpersonating;

  return (
    <aside className="w-72 apple-glass h-[calc(100vh-2rem)] my-4 ml-4 rounded-3xl flex flex-col justify-between p-4 shrink-0 border border-white/10 shadow-2xl">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Compass className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
              GeoFull <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">V4</span>
            </h1>
            <p className="text-[11px] text-slate-400 tracking-tight">Geocodificación & Multi-Tenant</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Módulos del Sistema
          </div>
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600/20 text-white border border-blue-500/40 shadow-lg shadow-blue-500/10 backdrop-blur-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* SaaS Admin Button at bottom (Super Admin Only) */}
      {canAccessSaaSAdmin && (
        <div className="pt-4 border-t border-white/10">
          <NavLink
            to="/saas-admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                  : 'bg-slate-900/40 text-slate-400 hover:text-purple-300 hover:bg-purple-950/20 border border-white/5'
              }`
            }
          >
            <ShieldAlert className="w-4 h-4 text-purple-400" />
            <span>Consola SaaS Admin</span>
          </NavLink>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;

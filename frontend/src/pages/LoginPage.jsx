import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { Zap, ShieldCheck, ArrowRight, Lock, Mail, Building2, RefreshCw } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setToast({ type: 'error', message: 'Ingresa correo y contraseña' });
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      setToast({ type: 'success', message: '¡Sesión iniciada exitosamente!' });
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      const msg = err.response?.data?.detail || 'Credenciales no válidas. Revisa tu correo o contraseña.';
      setToast({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (presetEmail, presetPass) => {
    setEmail(presetEmail);
    setPassword(presetPass);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Glow Background Elements */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="w-full max-w-md z-10 space-y-6">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">GeoFull V4</h1>
          <p className="text-xs text-slate-400">Plataforma Logística Multi-Inquilino & Geocodificación PostGIS</p>
        </div>

        {/* Tarjeta de Inicio de Sesión */}
        <GlassCard className="p-8 space-y-6 border-slate-700/60 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              Iniciar Sesión en SaaS
            </h2>
            <Badge variant="titanium" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
              V4 Auth Active
            </Badge>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">Correo Electrónico</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="admin@geofull.app"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verificando credenciales...
                </>
              ) : (
                <>
                  Ingresar a la Plataforma
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Accesos Rápidos Demo */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center">
              Accesos Rápidos Modo Demostración
            </span>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@geofull.app', 'GeoFull2026!SuperAdmin')}
                className="w-full py-2 px-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>🔑 Super Admin Global</span>
                <span className="text-[10px] font-mono opacity-80">admin@geofull.app</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('demo@empresa.com', 'GeoFull2026!DemoEmpresa')}
                className="w-full py-2 px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>🏢 Admin Empresa Demo</span>
                <span className="text-[10px] font-mono opacity-80">demo@empresa.com</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('coordinadora@empresa.com', 'GeoFull2026!Coordinadora')}
                className="w-full py-2 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>🚚 Coordinadora Express</span>
                <span className="text-[10px] font-mono opacity-80">coordinadora@empresa.com</span>
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

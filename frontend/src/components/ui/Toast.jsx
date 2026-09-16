import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export function Toast({ type = 'info', title, message, onClose, duration = 4000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const config = {
    success: { icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-950/80' },
    error: { icon: XCircle, color: 'text-red-400', border: 'border-red-500/40', bg: 'bg-red-950/80' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-950/80' },
    info: { icon: Info, color: 'text-blue-400', border: 'border-blue-500/40', bg: 'bg-blue-950/80' }
  }[type];

  const Icon = config.icon;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl apple-glass border ${config.border} ${config.bg} shadow-2xl max-w-md animate-slideIn`}>
      <Icon className={`w-5 h-5 ${config.color} shrink-0 mt-0.5`} />
      <div className="flex-1 pr-2">
        <h4 className="font-bold text-xs text-white tracking-tight">{title}</h4>
        {message && <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{message}</p>}
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

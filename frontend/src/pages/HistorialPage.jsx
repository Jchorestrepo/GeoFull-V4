import React from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { History } from 'lucide-react';

export function HistorialPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-blue-400" />
            Historial & Rastreo Unificado
          </h2>
          <p className="text-xs text-slate-400 mt-1">Línea de tiempo cronológica por número de guía.</p>
        </div>
        <Badge variant="titanium">Etapa 6 Pendiente</Badge>
      </div>

      <GlassCard className="p-8 text-center space-y-3">
        <History className="w-10 h-10 text-blue-400 mx-auto" />
        <h3 className="text-lg font-bold text-white">Módulo de Rastreo</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Trazabilidad unificada de cada pedido con línea de tiempo detallada.
        </p>
      </GlassCard>
    </div>
  );
}

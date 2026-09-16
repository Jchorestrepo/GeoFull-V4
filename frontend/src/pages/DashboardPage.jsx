import React from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { LayoutDashboard, Sparkles } from 'lucide-react';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-blue-400" />
            Dashboard Operativo
          </h2>
          <p className="text-xs text-slate-400 mt-1">Métricas clave y KPIs de la operación diaria (Siguiente Etapa).</p>
        </div>
        <Badge variant="titanium">Etapa 2 Pendiente</Badge>
      </div>

      <GlassCard className="p-8 text-center space-y-3">
        <Sparkles className="w-10 h-10 text-blue-400 mx-auto animate-pulse" />
        <h3 className="text-lg font-bold text-white">Módulo Dashboard en Preparación</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Este módulo se construirá de forma quirúrgica en la Etapa 2, alineando los KPIs exactos que necesitas visualizar en la operación diaria.
        </p>
      </GlassCard>
    </div>
  );
}

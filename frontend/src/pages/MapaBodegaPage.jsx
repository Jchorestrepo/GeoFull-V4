import React from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { BodegaMap } from '../components/map/BodegaMap';
import { Map, Layers, RefreshCw } from 'lucide-react';

export function MapaBodegaPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Map className="w-6 h-6 text-emerald-400" />
            Mapa de Polígonos & Paquetes en Bodega
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visualización interactiva estilo GeoFull V3: Polígonos GeoJSON de zonas, pines geolocalizados de paquetes y reasignación rápida de sectores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="emerald">GeoJSON & PostGIS</Badge>
          <Badge variant="blue">Paridad V3</Badge>
        </div>
      </div>

      {/* Main Map Card */}
      <GlassCard className="p-4 rounded-3xl border border-white/10 space-y-3">
        <BodegaMap height="calc(100vh - 14rem)" />
      </GlassCard>
    </div>
  );
}

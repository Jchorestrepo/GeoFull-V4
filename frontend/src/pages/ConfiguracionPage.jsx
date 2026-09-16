import React, { useState } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Settings, Layers, Users, ShieldAlert, Building2 } from 'lucide-react';
import { ZoneManager } from '../components/config/ZoneManager';
import { TeamManager } from '../components/config/TeamManager';
import { SystemMaintenance } from '../components/config/SystemMaintenance';

export function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState('sectores');

  const tabs = [
    { id: 'sectores', label: 'Subir Sectores (GeoJSON)', icon: Layers, component: ZoneManager },
    { id: 'equipo', label: 'Gestión de Equipo', icon: Users, component: TeamManager },
    { id: 'sistema', label: 'Mantenimiento del Sistema', icon: ShieldAlert, component: SystemMaintenance },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeTab).component;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            Configuración de Empresa
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de zonas GeoJSON, supervisores/equipo web y mantenimiento del sistema.
          </p>
        </div>
        <Badge variant="titanium" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
          GeoFull V4
        </Badge>
      </div>

      {/* Tab Navigation */}
      <GlassCard className="p-2 flex items-center gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 shadow-lg shadow-blue-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
              {tab.label}
            </button>
          );
        })}
      </GlassCard>

      {/* Active Tab Component Container */}
      <div className="animate-fade-in">
        <ActiveComponent />
      </div>
    </div>
  );
}

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';

import { SectorizacionPage } from './pages/SectorizacionPage';
import { MapaBodegaPage } from './pages/MapaBodegaPage';
import { DashboardPage } from './pages/DashboardPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { PersonalPage } from './pages/PersonalPage';
import { ConciliacionPage } from './pages/ConciliacionPage';
import { HistorialPage } from './pages/HistorialPage';
import { SaaSAdminPage } from './pages/SaaSAdminPage';

function MainAppContent() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        Cargando GeoFull V4 SaaS...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const defaultHome = user?.rol === 'super_admin' ? '/saas-admin' : '/sectorizacion';

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to={defaultHome} replace />} />
          <Route path="sectorizacion" element={<SectorizacionPage />} />
          <Route path="mapa-bodega" element={<MapaBodegaPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="configuracion" element={<ConfiguracionPage />} />
          <Route path="personal" element={<PersonalPage />} />
          <Route path="conciliacion" element={<ConciliacionPage />} />
          <Route path="historial" element={<HistorialPage />} />
          <Route path="saas-admin" element={<SaaSAdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to={defaultHome} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

export default App;

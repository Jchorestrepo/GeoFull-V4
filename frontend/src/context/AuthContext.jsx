import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('v4_token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('v4_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTenantId, setActiveTenantId] = useState(() => {
    return localStorage.getItem('active_tenant_id') || 'global';
  });
  const [loading, setLoading] = useState(true);

  // Configurar interceptores de Axios para incluir X-Tenant-ID y Bearer token globalmente
  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use((config) => {
      const currentToken = localStorage.getItem('v4_token');
      const currentTenant = localStorage.getItem('active_tenant_id') || 'global';

      if (!config.headers.Authorization && currentToken) {
        config.headers.Authorization = `Bearer ${currentToken}`;
      }
      config.headers['X-Tenant-ID'] = currentTenant;
      return config;
    }, (error) => Promise.reject(error));

    const resInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          // Token expirado o inválido -> cerrar sesión de forma segura
          logout();
        }
        return Promise.reject(error);
      }
    );

    setLoading(false);

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
    };
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
    const { access_token, user: userData } = res.data;

    setToken(access_token);
    setUser(userData);
    const tenantToSet = userData.tenant_id || 'global';
    setActiveTenantId(tenantToSet);

    localStorage.setItem('v4_token', access_token);
    localStorage.setItem('v4_user', JSON.stringify(userData));
    localStorage.setItem('active_tenant_id', tenantToSet);

    return userData;
  };

  const loginWithGoogle = async (credential) => {
    const res = await axios.post(`${API_BASE}/auth/google`, { credential });
    const { access_token, user: userData } = res.data;

    setToken(access_token);
    setUser(userData);
    const tenantToSet = userData.tenant_id || 'global';
    setActiveTenantId(tenantToSet);

    localStorage.setItem('v4_token', access_token);
    localStorage.setItem('v4_user', JSON.stringify(userData));
    localStorage.setItem('active_tenant_id', tenantToSet);

    return userData;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('v4_token');
    localStorage.removeItem('v4_user');
    localStorage.removeItem('active_tenant_id');
    localStorage.removeItem('super_admin_backup_token');
    localStorage.removeItem('super_admin_backup_user');
  };

  const switchTenant = (tenantId) => {
    setActiveTenantId(tenantId);
    localStorage.setItem('active_tenant_id', tenantId);
    if (user) {
      const updatedUser = { ...user, tenant_id: tenantId };
      setUser(updatedUser);
      localStorage.setItem('v4_user', JSON.stringify(updatedUser));
    }
  };

  const impersonateTenant = async (tenantId) => {
    const backupToken = localStorage.getItem('super_admin_backup_token');
    const adminToken = backupToken || token;

    if (!backupToken && token && user?.rol === 'super_admin') {
      localStorage.setItem('super_admin_backup_token', token);
      localStorage.setItem('super_admin_backup_user', JSON.stringify(user));
    }

    const res = await axios.post(
      `${API_BASE}/auth/impersonate?target_tenant_id=${tenantId}`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const { access_token, user: impUser } = res.data;

    setToken(access_token);
    setUser(impUser);
    setActiveTenantId(tenantId);

    localStorage.setItem('v4_token', access_token);
    localStorage.setItem('v4_user', JSON.stringify(impUser));
    localStorage.setItem('active_tenant_id', tenantId);
  };

  const restoreSuperAdminSession = () => {
    const backupToken = localStorage.getItem('super_admin_backup_token');
    const backupUser = localStorage.getItem('super_admin_backup_user');

    if (backupToken && backupUser) {
      const parsedUser = JSON.parse(backupUser);
      setToken(backupToken);
      setUser(parsedUser);
      setActiveTenantId(parsedUser.tenant_id || 'global');

      localStorage.setItem('v4_token', backupToken);
      localStorage.setItem('v4_user', backupUser);
      localStorage.setItem('active_tenant_id', parsedUser.tenant_id || 'global');

      localStorage.removeItem('super_admin_backup_token');
      localStorage.removeItem('super_admin_backup_user');
    }
  };

  const isImpersonating = !!localStorage.getItem('super_admin_backup_token');

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        activeTenantId,
        loading,
        isAuthenticated: !!token && !!user,
        isImpersonating,
        login,
        loginWithGoogle,
        logout,
        switchTenant,
        impersonateTenant,
        restoreSuperAdminSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}

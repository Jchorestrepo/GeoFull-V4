// Smart in-memory cache for GeoFull V4
// Ensures 0ms instant page transitions and event-driven invalidation.
import axios from 'axios';

let cachedOrdersByTenant = {};
let cachedZonesByTenant = {};
let cachedDashboardStatsByTenant = {};
let cachedZonesGeoJSONByTenant = {};

let ordersFetchPromises = {};
let zonesFetchPromises = {};
let dashboardStatsPromises = {};
let zonesGeoJSONPromises = {};

let lastFetchTimestamp = {}; // tenantId -> { orders, zones, dashboard, zonesGeoJSON }
let hasMutatedByTenant = {};

const STALE_TTL_MS = 60 * 60 * 1000; // 1 hour (60 minutes)

const listeners = new Set();

function emitCacheChange() {
  listeners.forEach(fn => {
    try { fn(); } catch (e) { console.error('Cache listener error', e); }
  });
}

const getActiveTenantId = () => localStorage.getItem('active_tenant_id') || 'empresa_demo';

function recordFetchTime(tenantId, key) {
  if (!lastFetchTimestamp[tenantId]) {
    lastFetchTimestamp[tenantId] = {};
  }
  lastFetchTimestamp[tenantId][key] = Date.now();
  if (hasMutatedByTenant[tenantId]) {
    hasMutatedByTenant[tenantId] = false;
  }
  emitCacheChange();
}

export const dataCache = {
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  isStale: (key = 'dashboard') => {
    const tenantId = getActiveTenantId();
    if (hasMutatedByTenant[tenantId]) return true;
    const last = lastFetchTimestamp[tenantId]?.[key];
    if (!last) return false; // If never fetched, it will fetch on demand
    return (Date.now() - last) > STALE_TTL_MS;
  },

  notifyMutation: (tenantId = null) => {
    const tid = tenantId || getActiveTenantId();
    hasMutatedByTenant[tid] = true;
    // Invalidate cached data so next fetch gets fresh content
    delete cachedOrdersByTenant[tid];
    delete cachedZonesByTenant[tid];
    delete cachedDashboardStatsByTenant[tid];
    delete cachedZonesGeoJSONByTenant[tid];
    emitCacheChange();
  },

  getOrders: async (forceRefresh = false) => {
    const tenantId = getActiveTenantId();
    if (cachedOrdersByTenant[tenantId] && !forceRefresh && !hasMutatedByTenant[tenantId]) {
      return cachedOrdersByTenant[tenantId];
    }
    if (ordersFetchPromises[tenantId] && !forceRefresh) {
      return ordersFetchPromises[tenantId];
    }
    ordersFetchPromises[tenantId] = axios.get('/api/v1/orders/', {
      headers: { 'X-Tenant-ID': tenantId },
      params: { solo_bodega: true }
    }).then(res => {
      cachedOrdersByTenant[tenantId] = res.data;
      ordersFetchPromises[tenantId] = null;
      recordFetchTime(tenantId, 'orders');
      return cachedOrdersByTenant[tenantId];
    }).catch(err => {
      ordersFetchPromises[tenantId] = null;
      throw err;
    });
    return ordersFetchPromises[tenantId];
  },

  getZones: async (forceRefresh = false) => {
    const tenantId = getActiveTenantId();
    if (cachedZonesByTenant[tenantId] && !forceRefresh && !hasMutatedByTenant[tenantId]) {
      return cachedZonesByTenant[tenantId];
    }
    if (zonesFetchPromises[tenantId] && !forceRefresh) {
      return zonesFetchPromises[tenantId];
    }
    zonesFetchPromises[tenantId] = axios.get('/api/v1/zones/', {
      headers: { 'X-Tenant-ID': tenantId }
    }).then(res => {
      cachedZonesByTenant[tenantId] = res.data;
      zonesFetchPromises[tenantId] = null;
      recordFetchTime(tenantId, 'zones');
      return cachedZonesByTenant[tenantId];
    }).catch(err => {
      zonesFetchPromises[tenantId] = null;
      throw err;
    });
    return zonesFetchPromises[tenantId];
  },

  getDashboardStats: async (forceRefresh = false) => {
    const tenantId = getActiveTenantId();
    if (cachedDashboardStatsByTenant[tenantId] && !forceRefresh && !hasMutatedByTenant[tenantId]) {
      return cachedDashboardStatsByTenant[tenantId];
    }
    if (dashboardStatsPromises[tenantId] && !forceRefresh) {
      return dashboardStatsPromises[tenantId];
    }
    dashboardStatsPromises[tenantId] = axios.get('/api/v1/reconciliation/dashboard-stats', {
      headers: { 'X-Tenant-ID': tenantId }
    }).then(res => {
      cachedDashboardStatsByTenant[tenantId] = res.data;
      dashboardStatsPromises[tenantId] = null;
      recordFetchTime(tenantId, 'dashboard');
      return cachedDashboardStatsByTenant[tenantId];
    }).catch(err => {
      dashboardStatsPromises[tenantId] = null;
      throw err;
    });
    return dashboardStatsPromises[tenantId];
  },

  getZonesGeoJSON: async (forceRefresh = false) => {
    const tenantId = getActiveTenantId();
    if (cachedZonesGeoJSONByTenant[tenantId] && !forceRefresh && !hasMutatedByTenant[tenantId]) {
      return cachedZonesGeoJSONByTenant[tenantId];
    }
    if (zonesGeoJSONPromises[tenantId] && !forceRefresh) {
      return zonesGeoJSONPromises[tenantId];
    }
    zonesGeoJSONPromises[tenantId] = axios.get('/api/v1/zones/geojson', {
      headers: { 'X-Tenant-ID': tenantId }
    }).then(res => {
      cachedZonesGeoJSONByTenant[tenantId] = res.data;
      zonesGeoJSONPromises[tenantId] = null;
      recordFetchTime(tenantId, 'zonesGeoJSON');
      return cachedZonesGeoJSONByTenant[tenantId];
    }).catch(err => {
      zonesGeoJSONPromises[tenantId] = null;
      throw err;
    });
    return zonesGeoJSONPromises[tenantId];
  },

  invalidateOrders: (tenantId = null) => {
    const tid = tenantId || getActiveTenantId();
    delete cachedOrdersByTenant[tid];
    emitCacheChange();
  },

  invalidateZones: (tenantId = null) => {
    const tid = tenantId || getActiveTenantId();
    delete cachedZonesByTenant[tid];
    emitCacheChange();
  },

  invalidateAll: () => {
    cachedOrdersByTenant = {};
    cachedZonesByTenant = {};
    cachedDashboardStatsByTenant = {};
    cachedZonesGeoJSONByTenant = {};
    ordersFetchPromises = {};
    zonesFetchPromises = {};
    dashboardStatsPromises = {};
    zonesGeoJSONPromises = {};
    emitCacheChange();
  },

  updateSingleOrderInCache: (updatedOrder) => {
    const tenantId = getActiveTenantId();
    const orders = cachedOrdersByTenant[tenantId];
    if (!orders) return;
    const idx = orders.findIndex(o => o.id === updatedOrder.id);
    if (idx !== -1) {
      orders[idx] = updatedOrder;
    } else {
      orders.unshift(updatedOrder);
    }
    emitCacheChange();
  }
};

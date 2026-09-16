// Simple in-memory cache for orders and zones per tenant to make page transitions INSTANT (0ms delay).
import axios from 'axios';

let cachedOrdersByTenant = {};
let cachedZonesByTenant = {};
let ordersFetchPromises = {};
let zonesFetchPromises = {};

const getActiveTenantId = () => localStorage.getItem('active_tenant_id') || 'empresa_demo';

export const dataCache = {
  getOrders: async (forceRefresh = false) => {
    const tenantId = getActiveTenantId();
    if (cachedOrdersByTenant[tenantId] && !forceRefresh) {
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
      return cachedOrdersByTenant[tenantId];
    }).catch(err => {
      ordersFetchPromises[tenantId] = null;
      throw err;
    });
    return ordersFetchPromises[tenantId];
  },

  getZones: async (forceRefresh = false) => {
    const tenantId = getActiveTenantId();
    if (cachedZonesByTenant[tenantId] && !forceRefresh) {
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
      return cachedZonesByTenant[tenantId];
    }).catch(err => {
      zonesFetchPromises[tenantId] = null;
      throw err;
    });
    return zonesFetchPromises[tenantId];
  },

  invalidateOrders: (tenantId = null) => {
    const tid = tenantId || getActiveTenantId();
    delete cachedOrdersByTenant[tid];
  },

  invalidateZones: (tenantId = null) => {
    const tid = tenantId || getActiveTenantId();
    delete cachedZonesByTenant[tid];
  },

  invalidateAll: () => {
    cachedOrdersByTenant = {};
    cachedZonesByTenant = {};
    ordersFetchPromises = {};
    zonesFetchPromises = {};
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
  }
};

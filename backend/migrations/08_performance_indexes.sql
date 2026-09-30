-- ==============================================================================
-- GeoFull V4 — Migration 08: Performance Indexes for Dashboard & Sectorización
-- ==============================================================================

-- 1. Composite Index on pedidos (tenant_id, zona_nombre) for fast zone distribution metrics
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_zona ON pedidos (tenant_id, zona_nombre);

-- 2. Composite Index on pedidos (tenant_id, domiciliario_id, estado) for top drivers metrics
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_driver_estado ON pedidos (tenant_id, domiciliario_id, estado);

-- 3. Composite Index on pedidos (tenant_id, estado, fecha_importacion) for retention & active warehouse status
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_estado_fecha ON pedidos (tenant_id, estado, fecha_importacion);

-- 4. Composite Index on novedades_nomina (tenant_id, estado) for quick pending vales count
CREATE INDEX IF NOT EXISTS idx_novedades_tenant_estado ON novedades_nomina (tenant_id, estado);

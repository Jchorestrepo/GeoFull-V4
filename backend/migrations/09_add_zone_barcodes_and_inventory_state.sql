-- =============================================================================
-- GeoFull V4 — Migración 09: Código de Barras en Zonas e Inventario
-- =============================================================================

ALTER TABLE zonas_personalizadas 
ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_zonas_barcode ON zonas_personalizadas (tenant_id, codigo_barras);

COMMENT ON COLUMN zonas_personalizadas.codigo_barras IS 'Código de barras para escaneo físico en bodega';

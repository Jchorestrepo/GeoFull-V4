-- Migración 05: Resultado del motor de normalización de direcciones (paquete `normalizador`)
-- estado_normalizacion: OK | PARCIAL | FALLO
-- clave_direccion: clave de deduplicación (ej: CL20BSUR3806)
-- confianza_normalizacion: 0.0 - 1.0
-- advertencias_normalizacion: lista de advertencias del motor

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS estado_normalizacion VARCHAR(20),
    ADD COLUMN IF NOT EXISTS clave_direccion VARCHAR(100),
    ADD COLUMN IF NOT EXISTS confianza_normalizacion NUMERIC(4, 3),
    ADD COLUMN IF NOT EXISTS advertencias_normalizacion JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pedidos_clave_direccion ON pedidos (tenant_id, clave_direccion);

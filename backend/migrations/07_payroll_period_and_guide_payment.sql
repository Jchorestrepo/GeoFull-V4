-- =============================================================================
-- GeoFull V4 — Migration 07: Períodos de Nómina Persistentes & Trazabilidad Anti-Doble Pago
-- =============================================================================

-- 1. Tabla de Períodos de Nómina por Empresa
CREATE TABLE IF NOT EXISTS periodos_nomina (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    nombre_periodo VARCHAR(150) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(50) DEFAULT 'ABIERTO', -- 'ABIERTO', 'PAGADO', 'CERRADO'
    total_neto NUMERIC(12,2) DEFAULT 0.00,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_pago TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_periodos_tenant ON periodos_nomina (tenant_id, estado);

ALTER TABLE periodos_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON periodos_nomina;
CREATE POLICY tenant_isolation ON periodos_nomina
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- 2. Extensión de la tabla Pedidos para trazabilidad individual de pago de guías
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS liquidacion_id UUID,
    ADD COLUMN IF NOT EXISTS fecha_pago_conductor TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_pedidos_pago_conductor ON pedidos (tenant_id, domiciliario_id, pagado_conductor);

-- 3. Extensión de Novedades para vinculación directa a Períodos
ALTER TABLE novedades_nomina
    ADD COLUMN IF NOT EXISTS periodo_id UUID REFERENCES periodos_nomina(id) ON DELETE SET NULL;

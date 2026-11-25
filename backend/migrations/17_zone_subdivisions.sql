-- Subzonas operativas exclusivas para Inventario por Zonas en Bodega.
-- No altera polígonos GeoJSON, mapa ni sectorización automática.

CREATE TABLE IF NOT EXISTS subzonas_inventario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    zona_padre_id UUID NOT NULL REFERENCES zonas_personalizadas(id) ON DELETE CASCADE,
    letra VARCHAR(10) NOT NULL,
    nombre_subzona VARCHAR(160) NOT NULL,
    codigo_barras VARCHAR(100),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subzona_padre_letra UNIQUE (zona_padre_id, letra)
);

CREATE INDEX IF NOT EXISTS idx_subzonas_tenant_padre
    ON subzonas_inventario (tenant_id, zona_padre_id);

ALTER TABLE subzonas_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE subzonas_inventario FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON subzonas_inventario;
CREATE POLICY tenant_isolation ON subzonas_inventario
    USING (
        current_setting('app.current_tenant_id', true) = '__SUPERADMIN__'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = '__SUPERADMIN__'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS subzona_id UUID REFERENCES subzonas_inventario(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_subzona
    ON pedidos (tenant_id, subzona_id)
    WHERE subzona_id IS NOT NULL;

-- Migración 10: Tabla de auditoría e historial cronológico de pedidos (Trazabilidad JMS / J&T)

CREATE TABLE IF NOT EXISTS pedidos_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    guia VARCHAR(100) NOT NULL,
    tipo_evento VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    estado_anterior VARCHAR(50),
    estado_nuevo VARCHAR(50),
    usuario_id UUID,
    usuario_nombre VARCHAR(255) DEFAULT 'Sistema',
    detalles JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedidos_historial_guia ON pedidos_historial (tenant_id, guia);
CREATE INDEX IF NOT EXISTS idx_pedidos_historial_pedido ON pedidos_historial (tenant_id, pedido_id, created_at DESC);

-- RLS: Seguridad por Tenant
ALTER TABLE pedidos_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_pedidos_historial ON pedidos_historial;
CREATE POLICY tenant_isolation_pedidos_historial ON pedidos_historial
    USING (tenant_id = current_setting('app.current_tenant_id', true));

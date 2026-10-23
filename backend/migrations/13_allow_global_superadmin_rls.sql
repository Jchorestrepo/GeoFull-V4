-- ==============================================================================
-- Migration 13: Permitir acceso a Super Admin ('global') a través de RLS
-- ==============================================================================

-- 1. Políticas RLS de lectura y gestión para tenant_id = 'global'
DROP POLICY IF EXISTS tenant_isolation ON pedidos;
CREATE POLICY tenant_isolation ON pedidos
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation_pedidos_historial ON pedidos_historial;
CREATE POLICY tenant_isolation_pedidos_historial ON pedidos_historial
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON zonas_personalizadas;
CREATE POLICY tenant_isolation ON zonas_personalizadas
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON personal_conductores;
CREATE POLICY tenant_isolation ON personal_conductores
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON conciliaciones_diarias;
CREATE POLICY tenant_isolation ON conciliaciones_diarias
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON liquidaciones;
CREATE POLICY tenant_isolation ON liquidaciones
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

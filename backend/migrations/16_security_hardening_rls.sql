-- ==============================================================================
-- GeoFull V4 — Migration 16: Endurecimiento de Políticas RLS Multi-Tenant (SEC-08)
-- ==============================================================================
-- 1. Cerrar brecha en `usuarios` cuando `app.current_tenant_id` está vacío ('') o NULL.
--    Ahora solo permite acceso al contexto 'global' (autenticación/SaaS) o al propio tenant_id,
--    e incluye cláusula WITH CHECK para impedir inserción/modificación cruzada entre tenants.
-- 2. Homologar políticas RLS con USING + WITH CHECK en todas las tablas operativas.
-- ==============================================================================

DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON pedidos;
CREATE POLICY tenant_isolation ON pedidos
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation_pedidos_historial ON pedidos_historial;
CREATE POLICY tenant_isolation_pedidos_historial ON pedidos_historial
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON zonas_personalizadas;
CREATE POLICY tenant_isolation ON zonas_personalizadas
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON personal_conductores;
CREATE POLICY tenant_isolation ON personal_conductores
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON conciliaciones_diarias;
CREATE POLICY tenant_isolation ON conciliaciones_diarias
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON liquidaciones;
CREATE POLICY tenant_isolation ON liquidaciones
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON novedades_nomina;
CREATE POLICY tenant_isolation ON novedades_nomina
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON adelantos_prestamos;
CREATE POLICY tenant_isolation ON adelantos_prestamos
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON periodos_nomina;
CREATE POLICY tenant_isolation ON periodos_nomina
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON inventario;
CREATE POLICY tenant_isolation ON inventario
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON rangos_logicos;
CREATE POLICY tenant_isolation ON rangos_logicos
    USING (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.current_tenant_id', true) = 'global'
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

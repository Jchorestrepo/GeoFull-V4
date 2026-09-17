-- =============================================================================
-- Migration 03: Permisos de Autenticación RLS en Tabla Usuarios
-- Permite consultar usuarios por correo durante la autenticación de inicio de sesión
-- =============================================================================

DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    USING (
        current_setting('app.current_tenant_id', true) IS NULL 
        OR current_setting('app.current_tenant_id', true) = ''
        OR tenant_id = current_setting('app.current_tenant_id', true)
    );

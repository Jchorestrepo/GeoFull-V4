-- ==============================================================================
-- GeoFull V4 — Migration 11: Create Non-Superuser App Role & Enforce RLS
-- ==============================================================================

-- 1. Crear el rol de aplicación sin privilegios de superusuario ni bypass RLS
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'geofull_app') THEN
        CREATE ROLE geofull_app WITH LOGIN PASSWORD 'geofull_app_secure_pass_2026'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

-- 2. Otorgar permisos operacionales en el esquema public
GRANT CONNECT ON DATABASE geofull_v4 TO geofull_app;
GRANT USAGE ON SCHEMA public TO geofull_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO geofull_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO geofull_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO geofull_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO geofull_app;

-- 3. Forzar RLS estricto (FORCE ROW LEVEL SECURITY)
ALTER TABLE pedidos FORCE ROW LEVEL SECURITY;
ALTER TABLE zonas_personalizadas FORCE ROW LEVEL SECURITY;
ALTER TABLE personal_conductores FORCE ROW LEVEL SECURITY;
ALTER TABLE pedidos_historial FORCE ROW LEVEL SECURITY;
ALTER TABLE novedades_nomina FORCE ROW LEVEL SECURITY;
ALTER TABLE conciliaciones_diarias FORCE ROW LEVEL SECURITY;
ALTER TABLE adelantos_prestamos FORCE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones FORCE ROW LEVEL SECURITY;
ALTER TABLE periodos_nomina FORCE ROW LEVEL SECURITY;
ALTER TABLE inventario FORCE ROW LEVEL SECURITY;
ALTER TABLE rangos_logicos FORCE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;

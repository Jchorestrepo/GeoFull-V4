-- ==============================================================================
-- GeoFull V4 — Migration 15: Índices de Alto Rendimiento para Inventario,
-- Escaneo de Guías, Historial y Optimización InitPlan en Políticas RLS
-- ==============================================================================

-- 1. Índice compuesto cubriente para conteos instantáneos de zonas en bodega (Index-Only Scan)
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_zona_id_estado
ON pedidos (tenant_id, zona_id, estado) INCLUDE (cliente);

-- 2. Índice funcional para búsqueda instantánea de guías en escáner (insensible a mayúsculas/espacios)
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_guia_upper
ON pedidos (tenant_id, UPPER(TRIM(guia)));

-- 3. Índice parcial para códigos no importados en bodega (limpieza y alertas rojas en < 1ms)
CREATE INDEX IF NOT EXISTS idx_pedidos_unimported_bodega
ON pedidos (tenant_id, zona_id)
WHERE estado = 'EN_BODEGA' AND cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN';

-- 4. Índice compuesto en pedidos_historial para consulta rápida de paquetes sin escanear (Anti-Join)
CREATE INDEX IF NOT EXISTS idx_pedidos_historial_tenant_evento_pedido
ON pedidos_historial (tenant_id, tipo_evento, pedido_id);

-- 5. Optimizar políticas RLS usando subconsulta escalar (InitPlan) para que PostgreSQL
-- evalúe current_setting() UNA sola vez por consulta en lugar de una vez por cada fila.
DROP POLICY IF EXISTS tenant_isolation ON pedidos;
CREATE POLICY tenant_isolation ON pedidos
    USING (
        (SELECT current_setting('app.current_tenant_id', true)) = 'global'
        OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

DROP POLICY IF EXISTS tenant_isolation_pedidos_historial ON pedidos_historial;
CREATE POLICY tenant_isolation_pedidos_historial ON pedidos_historial
    USING (
        (SELECT current_setting('app.current_tenant_id', true)) = 'global'
        OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

DROP POLICY IF EXISTS tenant_isolation ON zonas_personalizadas;
CREATE POLICY tenant_isolation ON zonas_personalizadas
    USING (
        (SELECT current_setting('app.current_tenant_id', true)) = 'global'
        OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

DROP POLICY IF EXISTS tenant_isolation ON personal_conductores;
CREATE POLICY tenant_isolation ON personal_conductores
    USING (
        (SELECT current_setting('app.current_tenant_id', true)) = 'global'
        OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

DROP POLICY IF EXISTS tenant_isolation ON conciliaciones_diarias;
CREATE POLICY tenant_isolation ON conciliaciones_diarias
    USING (
        (SELECT current_setting('app.current_tenant_id', true)) = 'global'
        OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

DROP POLICY IF EXISTS tenant_isolation ON liquidaciones;
CREATE POLICY tenant_isolation ON liquidaciones
    USING (
        (SELECT current_setting('app.current_tenant_id', true)) = 'global'
        OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

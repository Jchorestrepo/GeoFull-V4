-- =============================================================================
-- GeoFull V4 — DDL Inicial de Base de Datos PostgreSQL + PostGIS (RLS)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TABLAS GLOBALES (`public`)
-- -----------------------------------------------------------------------------

-- Tenants / Empresas
CREATE TABLE IF NOT EXISTS public.empresas (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    nit VARCHAR(50) UNIQUE NOT NULL,
    email_contacto VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    ciudades_habilitadas JSONB DEFAULT '["MEDELLIN"]'::jsonb,
    cuota_pedidos_mes INT DEFAULT 10000,
    mapeo_columnas JSONB DEFAULT '{}'::jsonb,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Registro de Datasets / GPKGs por Ciudad
CREATE TABLE IF NOT EXISTS public.datasets_ciudades (
    id VARCHAR(64) PRIMARY KEY,
    ciudad VARCHAR(100) NOT NULL,
    departamento VARCHAR(100),
    total_predios INT DEFAULT 0,
    total_ejes INT DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    fecha_importacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Predios Catastrales (Importados en EPSG:4326)
CREATE TABLE IF NOT EXISTS public.nomenclatura_domiciliaria (
    OBJECTID SERIAL PRIMARY KEY,
    "Shape" GEOMETRY(Point, 4326),
    direccion TEXT,
    via TEXT,
    placa TEXT,
    cbml TEXT,
    numero_mejora SMALLINT,
    direccionencasillada TEXT,
    direccioncodificada TEXT
);

CREATE INDEX IF NOT EXISTS idx_nom_via_placa ON public.nomenclatura_domiciliaria (via, placa);
CREATE INDEX IF NOT EXISTS idx_nom_geom ON public.nomenclatura_domiciliaria USING GIST ("Shape");

-- Ejes Viales (Importados en EPSG:4326)
CREATE TABLE IF NOT EXISTS public.eje_de_nomenclatura (
    OBJECTID SERIAL PRIMARY KEY,
    "Shape" GEOMETRY(MultiLineString, 4326),
    tipo_via TEXT,
    numero_via SMALLINT,
    apendice_via TEXT,
    orientacion_via TEXT,
    label TEXT,
    nombre_comun TEXT,
    comuna TEXT
);

CREATE INDEX IF NOT EXISTS idx_eje_tipo_num ON public.eje_de_nomenclatura (tipo_via, numero_via);
CREATE INDEX IF NOT EXISTS idx_eje_geom ON public.eje_de_nomenclatura USING GIST ("Shape");


-- -----------------------------------------------------------------------------
-- 2. TABLAS OPERATIVAS POR TENANT CON ROW-LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------

-- Zonas Personalizadas por Empresa
CREATE TABLE IF NOT EXISTS zonas_personalizadas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    nombre_zona VARCHAR(150) NOT NULL,
    codigo_zona VARCHAR(50),
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    activa BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_zonas_geom ON zonas_personalizadas USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_zonas_tenant ON zonas_personalizadas (tenant_id);

ALTER TABLE zonas_personalizadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON zonas_personalizadas;
CREATE POLICY tenant_isolation ON zonas_personalizadas
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Rangos Lógicos
CREATE TABLE IF NOT EXISTS rangos_logicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    zona_id UUID REFERENCES zonas_personalizadas(id) ON DELETE CASCADE,
    tipo_via VARCHAR(10) NOT NULL,
    numero_via INT NOT NULL,
    placa_minima INT NOT NULL,
    placa_maxima INT NOT NULL,
    orientacion VARCHAR(20),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rangos_tenant ON rangos_logicos (tenant_id);

ALTER TABLE rangos_logicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON rangos_logicos;
CREATE POLICY tenant_isolation ON rangos_logicos
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Pedidos (Tabla Central Operativa)
CREATE TABLE IF NOT EXISTS pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    guia VARCHAR(100) NOT NULL,
    cliente VARCHAR(255),
    telefono_cliente VARCHAR(50),
    direccion_original TEXT NOT NULL,
    direccion_limpia TEXT,
    observaciones_entrega TEXT,
    datos_extra JSONB DEFAULT '{}'::jsonb,
    latitud NUMERIC(10, 8),
    longitud NUMERIC(11, 8),
    geom GEOMETRY(Point, 4326),
    nivel_precision VARCHAR(50),
    precision_metros VARCHAR(10),
    confianza_score INT,
    zona_id UUID REFERENCES zonas_personalizadas(id),
    zona_nombre VARCHAR(150),
    estado VARCHAR(50) DEFAULT 'CREADO',
    domiciliario_id UUID,
    domiciliario_nombre VARCHAR(255),
    fecha_entrega TIMESTAMP WITH TIME ZONE,
    pagado_conductor BOOLEAN DEFAULT FALSE,
    proveedor_entrega VARCHAR(100) DEFAULT 'iMile',
    alerta_rango_logico BOOLEAN DEFAULT FALSE,
    detalle_alerta_rango TEXT,
    fecha_importacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_guia UNIQUE (tenant_id, guia)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_guia ON pedidos (tenant_id, guia);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos (tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_geom ON pedidos USING GIST (geom);

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pedidos;
CREATE POLICY tenant_isolation ON pedidos
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Inventario (Escaneo QR en Bodega)
CREATE TABLE IF NOT EXISTS inventario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
    codigo_qr VARCHAR(255) NOT NULL,
    estado_fisico VARCHAR(50) NOT NULL,
    escaneado_por UUID,
    fecha_escaneo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventario_tenant ON inventario (tenant_id);

ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventario;
CREATE POLICY tenant_isolation ON inventario
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Usuarios Web (Gestión del Equipo)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON usuarios (tenant_id);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Personal Conductores (Módulo Personal)
CREATE TABLE IF NOT EXISTS personal_conductores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    nombre_completo VARCHAR(255) NOT NULL,
    cedula VARCHAR(50) NOT NULL,
    telefono VARCHAR(50),
    tipo_contrato VARCHAR(50),
    tarifa_paquete NUMERIC(10, 2) DEFAULT 2000.00,
    alias_nombres JSONB DEFAULT '[]'::jsonb,
    activo BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, cedula)
);

CREATE INDEX IF NOT EXISTS idx_conductores_tenant ON personal_conductores (tenant_id);

ALTER TABLE personal_conductores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON personal_conductores;
CREATE POLICY tenant_isolation ON personal_conductores
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Conciliaciones Diarias (Control de Entregas por Día)
CREATE TABLE IF NOT EXISTS conciliaciones_diarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    domiciliario_id UUID REFERENCES personal_conductores(id),
    fecha_operacion DATE NOT NULL,
    total_sistema INT NOT NULL,
    total_entregados INT DEFAULT 0,
    total_novedades INT DEFAULT 0,
    archivo_subido TEXT,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_tenant ON conciliaciones_diarias (tenant_id);

ALTER TABLE conciliaciones_diarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conciliaciones_diarias;
CREATE POLICY tenant_isolation ON conciliaciones_diarias
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Liquidaciones (Nómina Quincenal / Período Personalizado)
CREATE TABLE IF NOT EXISTS liquidaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    domiciliario_id UUID REFERENCES personal_conductores(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    total_paquetes_periodo INT DEFAULT 0,
    tarifa_paquete NUMERIC(10, 2),
    monto_bruto NUMERIC(12, 2) DEFAULT 0.00,
    descuentos NUMERIC(12, 2) DEFAULT 0.00,
    monto_neto NUMERIC(12, 2) DEFAULT 0.00,
    estado VARCHAR(50) DEFAULT 'BORRADOR',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_tenant ON liquidaciones (tenant_id);

ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON liquidaciones;
CREATE POLICY tenant_isolation ON liquidaciones
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Adelantos / Préstamos de Nómina
CREATE TABLE IF NOT EXISTS adelantos_prestamos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    domiciliario_id UUID REFERENCES personal_conductores(id) NOT NULL,
    monto NUMERIC(12, 2) NOT NULL,
    motivo TEXT,
    estado VARCHAR(50) DEFAULT 'PENDIENTE',
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    aprobado_por UUID
);

CREATE INDEX IF NOT EXISTS idx_adelantos_tenant ON adelantos_prestamos (tenant_id);

ALTER TABLE adelantos_prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON adelantos_prestamos;
CREATE POLICY tenant_isolation ON adelantos_prestamos
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Seed Default Tenant
INSERT INTO public.empresas (id, nombre, nit, email_contacto, telefono, ciudades_habilitadas, cuota_pedidos_mes, activo)
VALUES ('empresa_demo', 'Empresa Demo Logística S.A.S.', '900123456-1', 'demo@geofull.co', '3001234567', '["MEDELLIN"]'::jsonb, 10000, true)
ON CONFLICT (id) DO NOTHING;

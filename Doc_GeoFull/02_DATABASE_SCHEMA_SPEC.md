# GeoFull V4 — 02. Especificación del Esquema de Base de Datos PostgreSQL + PostGIS

> **Propósito**: Definir la estructura DDL completa de la base de datos de GeoFull V4, incluyendo las tablas catastrales reales de `geocoding-medellin` (reproyectadas a EPSG:4326), las Zonas Personalizadas por empresa, el modelo de conciliación diaria y liquidación quincenal de nómina, y todas las tablas operativas por tenant.

---

## 1. Extensiones y Configuración Base

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## 2. Esquema Global (`public`) — SaaS & Datasets Catastrales

### 2.1 Tabla `public.empresas`
```sql
CREATE TABLE IF NOT EXISTS public.empresas (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    nit VARCHAR(50) UNIQUE NOT NULL,
    email_contacto VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    ciudades_habilitadas JSONB DEFAULT '["MEDELLIN"]'::jsonb,
    cuota_pedidos_mes INT DEFAULT 10000,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Tabla `public.datasets_ciudades` (Registro de GPKGs importados)
```sql
CREATE TABLE IF NOT EXISTS public.datasets_ciudades (
    id VARCHAR(64) PRIMARY KEY,
    ciudad VARCHAR(100) NOT NULL,
    departamento VARCHAR(100),
    total_predios INT DEFAULT 0,
    total_ejes INT DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    fecha_importacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 Tabla `public.nomenclatura_domiciliaria` (Predios Catastrales)
> **⚠️ NOTA SOBRE IMPORTACIÓN**: Los archivos GPKG originales de GeoMedellín usan **EPSG:9377** (origen nacional Colombia). Al importar con `ogr2ogr`, se **DEBE** reprojectar a EPSG:4326:
> ```bash
> ogr2ogr -f PostgreSQL "PG:..." nomenclatura_domiciliaria.gpkg -t_srs EPSG:4326 -nln nomenclatura_domiciliaria
> ```

Columnas reales del dataset (518,116 registros para Medellín):
```sql
-- Esta tabla la crea ogr2ogr automáticamente. Esquema resultante:
-- OBJECTID          INTEGER PRIMARY KEY
-- Shape             GEOMETRY(Point, 4326)    -- reproyectada de EPSG:9377
-- direccion         TEXT                     -- 'CL 39 35-03'
-- via               TEXT                     -- 'CL 39', 'CR 89D SUR'
-- placa             TEXT                     -- '35-03', '44B SUR-101'
-- cbml              TEXT(11)                 -- código CBML catastral
-- numero_mejora     SMALLINT
-- direccionencasillada   TEXT
-- direccioncodificada    TEXT

-- Índices requeridos tras importación:
CREATE INDEX IF NOT EXISTS idx_nom_via_placa ON public.nomenclatura_domiciliaria (via, placa);
CREATE INDEX IF NOT EXISTS idx_nom_geom ON public.nomenclatura_domiciliaria USING GIST ("Shape");
```

### 2.4 Tabla `public.eje_de_nomenclatura` (Ejes Viales — 42,696 registros)
```sql
-- Importada con ogr2ogr, columnas reales:
-- OBJECTID          INTEGER PRIMARY KEY
-- Shape             GEOMETRY(MultiLineString, 4326)   -- reproyectada
-- tipo_via          TEXT     -- 'CL', 'CR', 'TV', 'DG', 'CQ', 'SR'
-- numero_via        SMALLINT -- 1..270
-- apendice_via      TEXT     -- NULL, 'A', 'B', 'DA'...
-- orientacion_via   TEXT     -- NULL, 'S', 'E' (una sola letra, NO 'SUR')
-- label             TEXT     -- forma legible: 'CL 56B', 'CR 89D SUR'
-- nombre_comun      TEXT     -- nombre popular: 'BOMBONA', 'TARRAGONA'
-- comuna            TEXT

CREATE INDEX IF NOT EXISTS idx_eje_tipo_num ON public.eje_de_nomenclatura (tipo_via, numero_via);
CREATE INDEX IF NOT EXISTS idx_eje_geom ON public.eje_de_nomenclatura USING GIST ("Shape");
```

---

## 3. Tablas por Tenant (RLS — Row-Level Security)

> En V4, todas las tablas operativas llevan una columna `tenant_id` y se protegen con RLS. No se crean esquemas dinámicos `tenant_<id>`.

### 3.1 Tabla `zonas_personalizadas` (Zonas GeoJSON por Empresa)
Cada empresa sube sus propios GeoJSONs de zonas. Todas las zonas de la empresa están activas simultáneamente y **no deben sobreponerse**.

```sql
CREATE TABLE IF NOT EXISTS zonas_personalizadas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    nombre_zona VARCHAR(150) NOT NULL,
    codigo_zona VARCHAR(50),
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    activa BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NOTA: La no-sobreposición se valida PROGRAMÁTICAMENTE al importar,
-- usando ST_Intersects y excluyendo ST_Touches, NO con EXCLUDE USING GIST
-- (el operador && compara bounding-boxes, no polígonos reales).
CREATE INDEX IF NOT EXISTS idx_zonas_geom ON zonas_personalizadas USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_zonas_tenant ON zonas_personalizadas (tenant_id);

ALTER TABLE zonas_personalizadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON zonas_personalizadas
    USING (tenant_id = current_setting('app.current_tenant_id'));
```

### 3.2 Tabla `rangos_logicos`
```sql
CREATE TABLE IF NOT EXISTS rangos_logicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    zona_id UUID REFERENCES zonas_personalizadas(id) ON DELETE CASCADE,
    tipo_via VARCHAR(10) NOT NULL,       -- 'CL', 'CR'
    numero_via INT NOT NULL,
    placa_minima INT NOT NULL,
    placa_maxima INT NOT NULL,
    orientacion VARCHAR(20),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 Tabla `pedidos` (Tabla Central Operativa)
```sql
CREATE TABLE IF NOT EXISTS pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    guia VARCHAR(100) NOT NULL,
    cliente VARCHAR(255),
    telefono_cliente VARCHAR(50),
    direccion_original TEXT NOT NULL,
    direccion_limpia TEXT,
    complemento TEXT,
    latitud NUMERIC(10, 8),
    longitud NUMERIC(11, 8),
    geom GEOMETRY(Point, 4326),
    nivel_precision VARCHAR(50),         -- 'EXACT_MATCH', 'PLACA_APROX', 'INTERSECTION_MATCH', etc.
    precision_metros VARCHAR(10),        -- '2', '50', '30', '100', '200'
    confianza_score INT,                 -- 100, 85, 55, 50, 45, 25, 15
    zona_id UUID REFERENCES zonas_personalizadas(id),
    zona_nombre VARCHAR(150),
    estado VARCHAR(50) DEFAULT 'CREADO', -- 'CREADO','SECTORIZADO','FUERA_DE_ZONA','EN_INVENTARIO','DESPACHADO','ENTREGADO','NOVEDAD'
    domiciliario_id UUID,
    alerta_rango_logico BOOLEAN DEFAULT FALSE,
    detalle_alerta_rango TEXT,
    fecha_importacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedidos_guia ON pedidos (tenant_id, guia);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos (tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_geom ON pedidos USING GIST (geom);
```

### 3.4 Tabla `inventario` (Escaneo QR en Bodega)
```sql
CREATE TABLE IF NOT EXISTS inventario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
    codigo_qr VARCHAR(255) NOT NULL,
    estado_fisico VARCHAR(50) NOT NULL,  -- 'RECIBIDO','CONFIRMADO','DESPACHADO','EXTRAVIADO'
    escaneado_por UUID,
    fecha_escaneo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 3.5 Tabla `usuarios` (Gestión del Equipo — Solo Acceso Web)
```sql
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL,            -- 'admin_empresa', 'operario'
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);
```

### 3.6 Tabla `personal_conductores` (Módulo Personal)
```sql
CREATE TABLE IF NOT EXISTS personal_conductores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    cedula VARCHAR(50) NOT NULL,
    telefono VARCHAR(50),
    tipo_contrato VARCHAR(50),           -- 'PRESTACION_SERVICIOS', 'DESTAJO'
    tarifa_paquete NUMERIC(10, 2) DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, cedula)
);
```

### 3.7 Tablas de Conciliación y Nómina

#### `conciliaciones_diarias` (Control de Entregas por Día)
```sql
CREATE TABLE IF NOT EXISTS conciliaciones_diarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    domiciliario_id UUID REFERENCES personal_conductores(id),
    fecha_operacion DATE NOT NULL,
    total_sistema INT NOT NULL,          -- paquetes asignados según el sistema
    total_entregados INT DEFAULT 0,      -- paquetes confirmados como entregados
    total_novedades INT DEFAULT 0,
    archivo_subido TEXT,                 -- nombre del archivo Excel subido ese día
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### `liquidaciones` (Nómina por Quincena o Período Personalizado)
```sql
CREATE TABLE IF NOT EXISTS liquidaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    domiciliario_id UUID REFERENCES personal_conductores(id),
    fecha_inicio DATE NOT NULL,          -- inicio del período (ej: 1 del mes)
    fecha_fin DATE NOT NULL,             -- fin del período (ej: 15 del mes)
    total_paquetes_periodo INT DEFAULT 0,
    tarifa_paquete NUMERIC(10, 2),
    monto_bruto NUMERIC(12, 2) DEFAULT 0.00,
    descuentos NUMERIC(12, 2) DEFAULT 0.00, -- adelantos/vales descontados
    monto_neto NUMERIC(12, 2) DEFAULT 0.00,
    estado VARCHAR(50) DEFAULT 'BORRADOR', -- 'BORRADOR','REVISADA','PAGADA'
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### `adelantos_prestamos`
```sql
CREATE TABLE IF NOT EXISTS adelantos_prestamos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    domiciliario_id UUID REFERENCES personal_conductores(id) NOT NULL,
    monto NUMERIC(12, 2) NOT NULL,
    motivo TEXT,
    estado VARCHAR(50) DEFAULT 'PENDIENTE', -- 'PENDIENTE','APROBADO','RECHAZADO','DESCONTADO'
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    aprobado_por UUID
);
```

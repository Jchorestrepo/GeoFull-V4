-- Migración 06: Módulo de Nómina V4, Personal, Vales, Bonos, Penalidades y Conciliación Dual

-- 1. Campos de remuneración y periodicidad en personal_conductores
ALTER TABLE personal_conductores
    ADD COLUMN IF NOT EXISTS tipo_remuneracion VARCHAR(50) DEFAULT 'DESTAJO',
    ADD COLUMN IF NOT EXISTS salario_fijo NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS periodicidad_pago VARCHAR(50) DEFAULT 'GLOBAL',
    ADD COLUMN IF NOT EXISTS tarifa_paquete NUMERIC(10, 2) DEFAULT 2000.00;

-- 2. Campos de configuración por defecto en empresas
ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS periodicidad_nomina_default VARCHAR(50) DEFAULT 'QUINCENAL',
    ADD COLUMN IF NOT EXISTS tarifa_paquete_default NUMERIC(10, 2) DEFAULT 2000.00;

-- 3. Tabla de novedades_nomina (Vales / Anticipos, Bonos y Penalidades)
CREATE TABLE IF NOT EXISTS novedades_nomina (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES public.empresas(id),
    domiciliario_id UUID NOT NULL REFERENCES personal_conductores(id) ON DELETE CASCADE,
    tipo_novedad VARCHAR(50) NOT NULL, -- 'VALE', 'BONO', 'PENALIDAD'
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    motivo TEXT,
    fecha_novedad DATE NOT NULL DEFAULT CURRENT_DATE,
    estado VARCHAR(50) DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'APLICADO', 'ANULADO'
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_novedades_tenant ON novedades_nomina (tenant_id);
CREATE INDEX IF NOT EXISTS idx_novedades_driver ON novedades_nomina (domiciliario_id);

ALTER TABLE novedades_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON novedades_nomina;
CREATE POLICY tenant_isolation ON novedades_nomina
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- 4. Extensión de la tabla liquidaciones para soporte completo de pago y conciliación
ALTER TABLE liquidaciones
    ADD COLUMN IF NOT EXISTS periodicidad VARCHAR(50) DEFAULT 'QUINCENAL',
    ADD COLUMN IF NOT EXISTS monto_paquetes NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS salario_fijo_aplicado NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS bonos NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS penalidades NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS vales_descontados NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(50) DEFAULT 'PENDIENTE',
    ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(50),
    ADD COLUMN IF NOT EXISTS referencia_pago TEXT,
    ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS archivo_conciliacion_2 TEXT,
    ADD COLUMN IF NOT EXISTS discrepancias_json JSONB DEFAULT '[]'::jsonb;

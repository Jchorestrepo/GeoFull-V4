-- Migración 02: Campos extendidos de domiciliarios / conductores para paridad con V3
-- Permite guardar información personal detallada, cuentas bancarias primarias/secundarias,
-- credenciales de plataformas (iMile, J&T, etc.) y documentos adjuntos (Cédula, Servicios, Certificado Bancario, RUTs).

ALTER TABLE personal_conductores
    ADD COLUMN IF NOT EXISTS nombres VARCHAR(100),
    ADD COLUMN IF NOT EXISTS apellidos VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
    ADD COLUMN IF NOT EXISTS jefe_zona VARCHAR(100),
    ADD COLUMN IF NOT EXISTS banco VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cuenta VARCHAR(100),
    ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(50) DEFAULT 'Ahorros',
    ADD COLUMN IF NOT EXISTS cc_titular VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cuentas_bancarias JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS plataformas JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS foto TEXT,
    ADD COLUMN IF NOT EXISTS doc_cedula_frontal TEXT,
    ADD COLUMN IF NOT EXISTS doc_cedula_trasera TEXT,
    ADD COLUMN IF NOT EXISTS doc_servicios TEXT,
    ADD COLUMN IF NOT EXISTS doc_certificado_bancario TEXT,
    ADD COLUMN IF NOT EXISTS docs_rut JSONB DEFAULT '[]'::jsonb;

-- ==============================================================================
-- Migration 14: Columna 'complemento' en pedidos
-- ==============================================================================
-- tracking.py y el schema spec (02_DATABASE_SCHEMA_SPEC.md) usan 'complemento',
-- pero ninguna migración anterior la crea. Sin ella, el rastreo devuelve 500.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS complemento TEXT;

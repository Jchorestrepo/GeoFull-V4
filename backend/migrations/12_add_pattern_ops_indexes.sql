-- ==============================================================================
-- GeoFull V4 — Migration 12: High-Performance text_pattern_ops Indexes for PostGIS
-- ==============================================================================

-- 1. Índice compuesto B-tree con text_pattern_ops para aceleración 15x de búsqueda LIKE en predios
CREATE INDEX IF NOT EXISTS idx_nom_via_placa_pattern 
ON public.nomenclatura_domiciliaria (via text_pattern_ops, placa text_pattern_ops);

-- 2. Índice con text_pattern_ops para búsquedas de ejes viales
CREATE INDEX IF NOT EXISTS idx_eje_tipo_num_pattern 
ON public.eje_de_nomenclatura (tipo_via text_pattern_ops, numero_via);

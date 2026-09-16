# GeoFull V4 — 03. Especificación del Pipeline de Geocodificación (3 Etapas)

> **Propósito**: Especificar el pipeline de procesamiento de direcciones de GeoFull V4 basado en el módulo `geocoding-medellin` integrado internamente. Documenta los **7 niveles reales de precisión**, la sectorización exclusiva por zonas personalizadas del tenant, la validación por rangos lógicos y el recalculo asistido con Google Maps.

---

## 1. Pipeline Consolidado (3 Etapas — Sin Agentes)

En GeoFull V4 **no existen "agentes" como clases Python separadas**. El pipeline es una función que ejecuta 3 etapas secuenciales usando el módulo `geocoding-medellin` integrado por `import` directo:

```
ENTRADA: Texto dirección cruda (con ruido, teléfonos, notas, referencias)
   │
   ▼
[ETAPA 1A: Pre-Limpiador & Extractor de Núcleo (Sanitizer)]
   │  → Separa el NÚCLEO Nomenclatural ("Calle 50 # 45-12")
   │  → Preserva NOTAS/OBSERVACIONES DE ENTREGA ("Apto 502, frente al D1, cel 3001234567")
   │
   ▼
[ETAPA 1B: Normalización Registral (geocoding_medellin.normalizer.normalize_address())]
   │  → Retorna NormalizedAddress con via_db='CL 50', placa_db='45-12'
   │
   ▼
[ETAPA 2: geocoding_medellin.geocoder.geocode()]
   │  → Busca en 7 niveles de precisión contra la BD catastral local
   │  → Retorna GeocodeResult con lat, lon, status, precision_meters
   │
   ▼
[ETAPA 3: Sectorización (código propio de GeoFull V4)]
   │  → ST_Contains contra zonas_personalizadas del tenant
   │  → Si no cae en ninguna zona: estado = 'FUERA_DE_ZONA'
   │  → Si cae en zona: validación de Rangos Lógicos
   │
   ▼
SALIDA: Pedido geocodificado y sectorizado (con direccion_limpia + notas_entrega separadas)
```

**Agente Aprendiz: ELIMINADO** — No existe motor de aprendizaje automático en V4. Las correcciones se aplican manualmente.

---

## 2. Etapa 1: Pre-Limpieza y Normalización Sintáctica

### 2.0 Pre-Limpiador y Extractor de Núcleo (`Sanitizer` — Reutilización de `agent_1_parser.py`)
Para no reinventar la rueda ni perder meses de calibración con datos reales de clientes, **GeoFull V4 migra directamente el código probado de `agent_1_parser.py` (V3)** como el módulo `backend/app/geocoder/sanitizer.py`.

Este limpiador aplica las reglas probadas en V3:
1. **Corrección de Errores Tipográficos Frecuentes**: Corrige typos como `#ll0` → `#110`, `5o` → `50`, `79-B1` → `79B-1`, números pegados (`79B12` → `79B-12`) y pegados de vía (`Calle 50 4512` → `Calle 50 # 45-12`).
2. **Eliminación de Basura de Ciudad/Departamento**: Remueve textos como `medellin`, `antioquia`, `colombia`, `itagui` que ensucian la consulta.
3. **Extracción de Núcleo Nomenclatural**: Aísla el patrón principal de dirección (ej: `Calle 50 # 45-12`).
4. **Preservación de Notas de Entrega**: Extrae los teléfonos de 10 dígitos, referencias visuales ("frente a...", "al lado de..."), nombres de conjunto/barrio e indicaciones de entrega y los guarda en el campo `observaciones_entrega`.
5. **Pase Limpio a `geocoding-medellin`**: Envía **únicamente** la `direccion_nucleo` limpia al `AddressNormalizer`.

### 2.1 Tipos de Vía (Abreviados como en la BD)
| Entrada del usuario | Código BD | Nombre completo |
|---|---|---|
| `CL`, `CLL`, `CLE`, `CALLE`, `C` | `CL` | CALLE |
| `CR`, `CRA`, `KR`, `KRA`, `K`, `CARRERA` | `CR` | CARRERA |
| `TV`, `TR`, `TRV`, `TRANSVERSAL` | `TV` | TRANSVERSAL |
| `DG`, `DIAG`, `DIAGONAL` | `DG` | DIAGONAL |
| `CQ`, `CIRC`, `CIRCULAR` | `CQ` | CIRCULAR |
| `AV`, `AVENIDA` | **AMBIGUO** → prueba `CR` y `CL` | AVENIDA |

### 2.2 Estructura de Salida (`NormalizedAddress`)
```python
@dataclass
class NormalizedAddress:
    codigo_via: str         # 'CL'
    numero_via: int         # 39
    apendice_via: str       # 'A', 'DA', '' (pegado al número)
    orientacion_via: str    # 'SUR', 'ESTE', None
    via_generadora: int     # 35 (primer bloque de la placa)
    apendice_generadora: str
    numero_casa: int        # 3 (número de casa, con cero: '03')
    via_db: str             # 'CL 39'       — para buscar en columna via
    placa_db: str           # '35-03'       — para buscar en columna placa
    direccion_db: str       # 'CL 39 35-03' — concatenación
    ambiguo: bool           # True si el tipo de vía es AVENIDA
```

### 2.3 Reglas Críticas del Formato Catastral
- El **apéndice va pegado al número**: `CL 39A` ≠ `CL 39` ≠ `CL 39DA` (son calles distintas).
- El **número de casa siempre tiene ≥2 dígitos** con cero a la izquierda: `35-03`, no `35-3`.
- La **orientación** es un token separado: `CR 89D SUR`, `18AA SUR-160`.
- En `eje_de_nomenclatura`, la orientación se almacena como una sola letra (`S`, `E`), no como `SUR`/`ESTE`.

---

## 3. Etapa 2: Geocodificación Catastral Local (7 Niveles de Precisión)

El geocoder de `geocoding-medellin` busca la dirección en **7 niveles jerárquicos de precisión**:

| Nivel | Status del Resultado | Precisión | Score | Fuente de Datos |
|---|---|---|---|---|
| 1 | `EXACT_MATCH` | ±2m (Rooftop) | 100 | `nomenclatura_domiciliaria` — igualdad exacta vía+placa |
| 2 | `PLACA_APROX` | ±50m | 85 | `nomenclatura_domiciliaria` — misma cuadra, placa cercana |
| 3 | `VIA_APENDICE` | ±80m | 55 | `nomenclatura_domiciliaria` — vía sin apéndice |
| 4 | `LOTE` | ±80m | 45 | `nomenclatura_domiciliaria` — búsqueda por lote/manzana |
| 5 | `INTERSECTION_MATCH` | ±30m | 50 | `eje_de_nomenclatura` — cruce de dos vías |
| 6 | `VIA_ONLY` | ±200m | 25 | `nomenclatura_domiciliaria` — solo la vía, sin placa |
| 7 | `FALLBACK` | ±100m | 15 | `eje_de_nomenclatura` — centroide del tramo de la vía |

Si **ningún nivel encuentra resultado**: el pedido se marca como `REQUIERE_REVISIÓN` con opción de recalcular con Google Maps desde el Frontend.

### 3.1 Ejemplo de Búsqueda Real en la BD
```
Entrada: "Calle 39 # 35-3"
Normalización: via_db = 'CL 39', placa_db = '35-03' (relleno del cero)

Nivel 1 (EXACT_MATCH):
  SELECT * FROM nomenclatura_domiciliaria
  WHERE via = 'CL 39' AND placa ~ '^(35-03)( |$)' → ±2m

Nivel 2 (PLACA_APROX — misma cuadra):
  WHERE via = 'CL 39' AND placa ~ '^35([^0-9-][^-]*)?-' → '35-01','35A-07','35-09'... → ±50m

Nivel 5 (INTERSECTION — cruce):
  a.tipo_via='CL' AND a.numero_via=39 × b.tipo_via='CR' AND b.numero_via=35 → ±30m

Nivel 7 (FALLBACK — centroide):
  ST_Centroid(ST_Union("Shape")) de todos los tramos de 'CL 39' → ±100m
```

---

## 4. Etapa 3: Sectorización y Rangos Lógicos

### 4.1 Asignación a Zona Personalizada
El punto geocodificado se cruza contra **todas las zonas personalizadas activas del tenant simultáneamente**:
```sql
SELECT id, nombre_zona FROM zonas_personalizadas
WHERE tenant_id = :tenant_id
  AND activa = TRUE
  AND ST_Contains(geom, ST_SetSRID(ST_Point(:longitud, :latitud), 4326));
```

- Si el punto cae en una zona → se asigna esa zona.
- Si **no cae en ninguna zona** → estado del pedido = `FUERA_DE_ZONA`.

### 4.2 Validación de Rangos Lógicos
Si el pedido fue asignado a una zona, se verifica que la placa de la dirección se encuentre dentro del rango lógico configurado para esa zona y esa vía. Si no coincide, se enciende una alerta (`alerta_rango_logico = true`).

---

## 5. Recalculo Asistido con Google Maps API

Si una dirección no se resuelve en ninguno de los 7 niveles locales o se marca como `FUERA_DE_ZONA`:
1. El sistema marca el registro como `REQUIERE_REVISIÓN`.
2. El usuario en el Frontend da clic en **"Recalcular ubicación con Google"**.
3. Google Maps retorna coordenadas actualizadas.
4. El operario puede arrastrar el pin manualmente en el mapa Leaflet.

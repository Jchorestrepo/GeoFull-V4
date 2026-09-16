# CLAUDE.md - Continuidad de Desarrollo

## Proyecto: Geocodificador Local Medellín

### Descripción General
API REST dockerizada para geocodificación de direcciones en Medellín usando datasets oficiales de GeoMedellín (eje_de_nomenclatura.gpkg y nomenclatura_domiciliaria.gpkg).

**Status:** ✅ Estructura base completa, lista para pruebas

---

## Arquitectura

```
[Cliente] → [FastAPI (8000)] → [PostgreSQL+PostGIS (5432)]
                                     ↓
                            [eje_de_nomenclatura]
                            [nomenclatura_domiciliaria]
                            [Índices GIST y B-Tree]
```

### Componentes

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| **Docker** | docker-compose.yml | Orquestación de servicios |
| **API** | main.py | FastAPI con 3 niveles de búsqueda |
| **Normalización** | modules/normalizer.py | Parsing de direcciones |
| **Geocodificación** | modules/geocoder.py | Lógica de 3 niveles |
| **BD** | modules/db.py | Conexión a PostgreSQL |
| **Init** | init_db.py | Importación de GPKG |

---

## Flujo de Geocodificación

### Entrada
```
"Calle 39 # 35-3"
```

### Normalización
El parser produce las cadenas **tal como están almacenadas**, de modo que el nivel 1
resuelve por igualdad indexada y no por `LIKE`:
```
via_db = 'CL 39'      (tipo abreviado, apéndice pegado, orientación aparte)
placa_db = '35-03'    (número de casa relleno a dos dígitos)
```
Ante una lectura ambigua (`AVENIDA` → `CR` o `CL`; `39S` → apéndice `S` u orientación
`SUR`) el normalizador **no adivina**: emite todas las variantes plausibles
(`variantes_via()` / `variantes_placa()`) y la consulta las resuelve de golpe con
`via = ANY(...)`, de forma que una decisión errada del parser no deja la dirección
inalcanzable.

### Nivel 1: Búsqueda Exacta (±2m)
- Busca en `nomenclatura_domiciliaria` (POINTS)
- Query: `via = ANY(ARRAY['CL 39']) AND placa ~ '^(35\-03)( |$)'`
- El ancla regex admite los sufijos del dato (`' (0103)'`, `' LOTE'`)
- Si encuentra → coordenadas exactas del predio

### Nivel 2: Intersección (±30m)
- Si el nivel 1 falla, busca intersección en `eje_de_nomenclatura`
- Query: `a.tipo_via='CL' AND a.numero_via=39` × `b.tipo_via='CR' AND b.numero_via=35`
  con `ST_Intersects` (los códigos van abreviados, que es como están en la tabla)
- Si encuentra → punto de cruce de calles

### Nivel 3: Centroide (±100m)
- Si el nivel 2 falla, retorna el centroide de la calle
- Query: `ST_Centroid(ST_Union(shape))` agrupando **todos** los tramos de `CL 39`
- Fallback: coordenadas aproximadas

### Búsqueda flexible (`/api/v1/geocode/flexible`)
Cuando no interesa un único punto sino *encontrar la dirección de todos modos*, este
endpoint degrada por niveles en una sola consulta y devuelve una lista de candidatos
puntuados. El nivel clave es `PLACA_APROX`: misma vía y mismo **número inicial de la
placa** (la cuadra), ordenado por cercanía del número de casa.

---

## Estructura de Datos

> Detalle completo y verificado en [DATA_STRUCTURE.md](DATA_STRUCTURE.md).

### nomenclatura_domiciliaria.gpkg
- **Tipo:** POINT (puntos exactos de direcciones) · **Registros:** 518.116
- **Campos:** OBJECTID, Shape, direccion, via, placa, cbml, numero_mejora,
  direccionencasillada, x_origen_nacional, y_origen_nacional
- `direccion = via || ' ' || placa`
- `via` = `'CL 39'`, `'CR 33A'`, `'CL 20B SUR'` — **el tipo va abreviado**
- `placa` = `'35-03'`, `'36B-20'`, `'44B SUR-101'` — **la casa siempre lleva 2 dígitos**

### eje_de_nomenclatura.gpkg
- **Tipo:** MULTILINESTRING (líneas de calles) · **Registros:** 42.696
- **Campos:** OBJECTID, Shape, tipo_via, numero_via, apendice_via, orientacion_via,
  label, label_big, nombre_comun, via_principal, via_generadora, comuna, jerarquia_via
- Clave real: `(tipo_via, numero_via, apendice_via, orientacion_via)`
- `tipo_via` es **abreviado** (`CL`, `CR`, `TV`, `DG`, `CQ`, `SR`, `VR`)
- `orientacion_via` es **una letra** (`S`, `E`), no `SUR`
- `label` es la forma legible; `via_principal` **no** es un nombre de calle (vale `'56B'`)

---

## Cómo Construir y Ejecutar

### 1. Descomprimir los GPKG en `data/gpkg/`
```bash
cd ~/Documentos/IA/geocoding-medellin
mkdir -p data/gpkg
unzip gpkg_eje_de_nomenclatura.zip -d data/gpkg/
unzip gpkg_nomenclatura_domiciliaria.zip -d data/gpkg/
```

### 2. Construir imágenes Docker
```bash
sudo docker-compose build
```

### 3. Iniciar servicios
```bash
sudo docker-compose up -d
```

### 4. Verificar estado
```bash
sudo docker-compose logs -f api
```

### 5. Probar API
```bash
# Health check
curl http://localhost:8000/health

# Normalizar dirección
curl -X POST http://localhost:8000/api/v1/normalize \
  -H "Content-Type: application/json" \
  -d '{"direccion":"Calle 39 # 35-35"}'

# Geocodificar
curl -X POST http://localhost:8000/api/v1/geocode \
  -H "Content-Type: application/json" \
  -d '{"direccion":"Calle 39 # 35-35"}'

# O por GET
curl "http://localhost:8000/api/v1/geocode?direccion=Calle+39+%2335-35"
```

### 6. Ver documentación interactiva
```
http://localhost:8000/docs
```

---

## Endpoints de la API

### `/health` (GET)
Estado del servidor y BD

### `/stats` (GET)
Estadísticas de datos cargados

### `/api/v1/normalize` (POST)
Convierte dirección cruda a componentes estructurados **en el formato exacto de la BD**
- Input: `{"direccion":"Calle 39 # 35-3"}`
- Output: `{"tipo_via":"CALLE", "codigo_via":"CL", "numero_via":39, "apendice_via":"",
  "orientacion_via":null, "via_generadora":35, "numero_casa":3,
  "via_db":"CL 39", "placa_db":"35-03", "direccion_db":"CL 39 35-03"}`

`via_db` / `placa_db` son las cadenas tal como están almacenadas: el tipo va abreviado,
el apéndice pegado al número (`CL 39A`), la orientación como token aparte (`CR 89D SUR`)
y el número de casa relleno a dos dígitos (`35-3` → `35-03`).

### `/api/v1/geocode` (POST/GET)
Geocodifica una dirección (un solo punto, estrategia de 3 niveles)
- Input: `{"direccion":"Calle 39 # 35-35"}`
- Output: `{"success":true, "status":"EXACT_MATCH", "lat":6.2437, "lon":-75.5898, "precision_meters":"2"}`

### `/api/v1/geocode/flexible` (POST/GET)
Búsqueda relajada: **no exige coincidencia exacta**. Si la placa pedida no existe,
devuelve las direcciones que comparten tipo de vía, número de vía y **número inicial
de la placa** (la misma cuadra), ordenadas por cercanía.

- Input: `{"direccion":"Calle 39 # 35-7", "limit":5, "incluir_via_only":true}`
- Output: `{"success":true, "match_level":"PLACA_APROX", "total":5, "best":{...}, "candidates":[...]}`

Niveles (`match_level`), de mayor a menor precisión:

| nivel | precisión | significado |
|---|---|---|
| `EXACT_MATCH` | ±2 m | la placa completa coincide |
| `PLACA_APROX` | ±50 m | misma vía y misma cuadra, otra casa |
| `VIA_APENDICE` | ±80 m | vía vecina por apéndice (`CL 39A` cuando se pidió `CL 39`) |
| `LOTE` | ±80 m | dirección por lote referida a la vía de cruce |
| `VIA_ONLY` | ±200 m | cualquier punto de la vía |
| `INTERSECTION_MATCH` | ±30 m | cruce de ejes viales |
| `FALLBACK` | ±100 m | centroide de la calle |

Cada candidato trae `lat`, `lon`, `match_level`, `precision_meters`, `score` (0-100),
`direccion`, `via`, `placa`, `cbml` y `objectid`.

### `/api/v1/geocode/batch` (POST)
Geocodifica múltiples direcciones

---

## Pasos Siguientes / TODO

### ✅ Completado
- [x] Estructura de proyecto Docker
- [x] Módulo de normalización de direcciones
- [x] Lógica de 3 niveles
- [x] Setup de PostgreSQL+PostGIS
- [x] Script de inicialización de BD
- [x] API REST con FastAPI
- [x] Documentación Swagger/OpenAPI

### 🔄 En Desarrollo
- [x] Prueba de corpus del normalizador contra las 518K filas reales
- [x] Prueba de la búsqueda flexible sin PostgreSQL
- [ ] Pruebas de integración contra la API levantada
- [ ] Optimización de índices
- [ ] Caché de resultados frecuentes
- [ ] Rate limiting y autenticación
- [ ] Validación de precisión con datos reales

### 📋 Próximas Fases
1. **Pruebas exhaustivas:** Validar con 100+ direcciones reales de Medellín
2. **Optimización:** Connection pooling, query optimization, caching
3. **Monitoreo:** Logging, métricas, alertas
4. **Deployment:** Configuración para producción (SSL, reverse proxy, backup)

---

## Configuración

### Variables de Entorno (.env)
```
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=geocodificador_medellin
DATABASE_USER=postgres
DATABASE_PASSWORD=postgis_secure_pass_2024
LOG_LEVEL=INFO
DEBUG=false
```

### Puertos
- **API:** 8000 (FastAPI + Swagger)
- **PostgreSQL:** 5432 (interno)

---

## Archivos Importantes

```
.
├── docker-compose.yml          # Orquestación
├── Dockerfile                  # Imagen API
├── requirements.txt            # Dependencias Python
├── main.py                     # FastAPI app
├── init_db.py                  # Inicialización de BD
├── .env.example                # Template de configuración
├── modules/
│   ├── normalizer.py          # Parsing de direcciones
│   ├── geocoder.py            # Lógica de 3 niveles
│   └── db.py                  # Conexiones y queries
├── data/
│   ├── gpkg/                  # Archivos GPKG (descargados)
│   └── sql/                   # Scripts SQL
└── CLAUDE.md                  # Este archivo
```

---

## Pruebas

Las dos primeras no necesitan Docker ni PostgreSQL: leen el GeoPackage con `sqlite3`.

```bash
# Corpus del normalizador: recorre las 518.116 filas reales y exige que la forma
# canonica reproduzca exactamente lo almacenado en `via` y `placa`.
# Umbrales: 100 % del subconjunto gramatical y >= 99,99 % de ida y vuelta.
PYTHONPATH=. python3 tests/test_normalizer_corpus.py

# Solo lo rapido (regresion dirigida + escritura humana), sin recorrer el corpus:
PYTHONPATH=. python3 tests/test_normalizer_corpus.py --rapido

# Busqueda flexible: emula los predicados del SQL en Python sobre los datos reales
# y comprueba la cadena completa normalizador -> niveles -> puntuacion -> respuesta.
PYTHONPATH=. python3 tests/test_flexible_offline.py

# Integracion contra la API levantada (esta si ejerce el SQL de verdad):
sudo docker-compose up -d && ./test_api.sh
```

> Las pruebas sólo necesitan `loguru` (además de la stdlib). Si no está instalado en el
> sistema, lo más cómodo es correrlas dentro del contenedor, que ya lo trae:
> `sudo docker-compose exec api python3 tests/test_normalizer_corpus.py`

Resultado actual del corpus: **518.048 / 518.049 = 99,9998 %** de ida y vuelta y
**100 %** del subconjunto cubierto por la gramática. La única fila que no se reproduce
es `CL 5 X CR 50.  LT 0372`, que trae un punto sobrante en el dato de origen; la forma
canónica que emite el normalizador (`X CR 50  LT 0372`) es la correcta, y la fila sigue
siendo alcanzable porque el ancla del nivel `LOTE` admite ese punto.

---

## Debugging

### Ver logs de la API
```bash
sudo docker-compose logs -f api
```

### Ver logs de PostgreSQL
```bash
sudo docker-compose logs -f postgres
```

### Ejecutar bash en el contenedor
```bash
sudo docker-compose exec api bash
```

### Conectar a PostgreSQL directamente
```bash
sudo docker-compose exec postgres psql -U postgres -d geocodificador_medellin
```

---

## Comandos Docker Útiles

```bash
# Build
sudo docker-compose build

# Start (background)
sudo docker-compose up -d

# Stop
sudo docker-compose down

# Restart
sudo docker-compose restart

# Logs
sudo docker-compose logs -f api

# Remove volumes (⚠️ borra datos)
sudo docker-compose down -v

# Rebuild and start
sudo docker-compose up -d --build
```

---

## Notas Técnicas

### Precisión
- **Nivel 1 (EXACT):** ±2 metros (punto exacto del predio)
- **Nivel 2 (INTERSECTION):** ±30 metros (cruce de calles)
- **Nivel 3 (FALLBACK):** ±100 metros (centroide de calle)

### Performance
- Índices GIST en geometrías espaciales (10-50ms por query)
- Índices B-Tree en campos de texto (texto plano < 1ms)
- Connection pooling: min 1, max 10

### Validación
- GeoPackage es formato SQLite + PostGIS
- SRS/CRS: EPSG:9377 (proyección local Medellín)

---

## Links Útiles

- [FastAPI Docs](https://fastapi.tiangolo.com)
- [PostGIS Manual](https://postgis.net/documentation/)
- [GeoMedellín Portal](https://datos.gov.co)
- [GeoPackage Spec](https://www.geopackage.org/)

---

**Última actualización:** 2026-09-07
**Desarrollado por:** Claude Code

# 🗺️ Geocodificador Local Medellín

**API REST dockerizada para geocodificación de direcciones en Medellín**

Utiliza datasets oficiales de GeoMedellín con precisión ±2 metros (rooftop) y fallbacks inteligentes.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-green)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org/)
[![PostGIS](https://img.shields.io/badge/PostGIS-3.4-blue)](https://postgis.net/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://www.docker.com/)

---

## 📋 Características

✅ **3 niveles de precisión** 
- Nivel 1: Búsqueda exacta en BD (rooftop, ±2m)
- Nivel 2: Intersección de calles (±30m)
- Nivel 3: Centroide de calle (±100m)

✅ **Normalización de direcciones**
- Soporta variantes: "CL", "CALLE", "Calle", "CR", "CARRERA", etc.
- Extrae números, apéndices (A, B, C) y placas
- Manejo de direcciones incompletas

✅ **Alto rendimiento**
- Respuestas en 10-50ms por geocodificación
- Índices espaciales GIST en geometrías
- Connection pooling automático

✅ **Totalmente dockerizado**
- Sin instalación local requerida
- PostgreSQL + PostGIS pre-configurados
- API REST con documentación Swagger/OpenAPI

✅ **Batch processing**
- Geocodifica múltiples direcciones en una llamada
- Ideal para importación de datos masiva

---

## 🚀 Quick Start

### Paso 1: Preparar datos
```bash
cd ~/Documentos/IA/geocoding-medellin
mkdir -p data/gpkg
unzip gpkg_eje_de_nomenclatura.zip -d data/gpkg/
unzip gpkg_nomenclatura_domiciliaria.zip -d data/gpkg/
```

### Paso 2: Construir
```bash
sudo docker-compose build
```

### Paso 3: Ejecutar
```bash
sudo docker-compose up -d
```

### Paso 4: Probar
```bash
# Geocodificar
curl -X POST http://localhost:8000/api/v1/geocode \
  -H "Content-Type: application/json" \
  -d '{"direccion":"Calle 39 # 35-35"}'

# Interfaz web
http://localhost:8000/docs
```

---

## 📚 Documentación Completa

### Para operación con Docker
→ Lee **[DOCKER_COMMANDS.md](./DOCKER_COMMANDS.md)**

### Para continuidad entre sesiones
→ Lee **[CLAUDE.md](./CLAUDE.md)**

### Para estructura de datos
→ Lee **[DATA_STRUCTURE.md](./DATA_STRUCTURE.md)**

---

## 🔗 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/stats` | Estadísticas de datos |
| GET/POST | `/api/v1/geocode` | Geocodificar una dirección (un punto) |
| GET/POST | `/api/v1/geocode/flexible` | Búsqueda relajada: lista de candidatos aunque la placa exacta no exista |
| POST | `/api/v1/normalize` | Normalizar dirección al formato exacto de la BD |
| POST | `/api/v1/geocode/batch` | Geocodificar múltiples |

---

## 📝 Ejemplos de Uso

### Geocodificación Simple
```bash
curl -X POST http://localhost:8000/api/v1/geocode \
  -H "Content-Type: application/json" \
  -d '{"direccion":"Calle 39 # 35-35"}'
```

**Respuesta:**
```json
{
  "success": true,
  "status": "EXACT_MATCH",
  "lat": 6.2437,
  "lon": -75.5898,
  "precision_meters": "2",
  "address_normalized": "CL 39 # 35-35"
}
```

### Normalización
```bash
curl -X POST http://localhost:8000/api/v1/normalize \
  -H "Content-Type: application/json" \
  -d '{"direccion":"Avenida Carrera 43A No. 16a - 25"}'
```

**Respuesta:**
```json
{
  "tipo_via": "CARRERA",
  "codigo_via": "CR",
  "numero_via": 43,
  "apendice_via": "A",
  "orientacion_via": null,
  "via_generadora": 16,
  "apendice_generadora": "A",
  "numero_casa": 25,
  "via_db": "CR 43A",
  "placa_db": "16A-25",
  "direccion_db": "CR 43A 16A-25",
  "raw_input": "Avenida Carrera 43A No. 16a - 25"
}
```

`via_db` y `placa_db` son las cadenas **tal como están almacenadas**: el tipo abreviado,
el apéndice pegado al número (`CR 43A` es otra vía distinta de `CR 43`), la orientación
como token aparte (`CR 89D SUR`) y el número de casa relleno a dos dígitos
(`35-3` → `35-03`). Gracias a eso la búsqueda es por igualdad indexada, no por `LIKE`.

### Búsqueda flexible

Cuando la placa exacta no existe, este endpoint devuelve igualmente las direcciones que
comparten tipo de vía, número de vía y **número inicial de la placa** (la misma cuadra):

```bash
curl -s "http://localhost:8000/api/v1/geocode/flexible?direccion=Calle+39+%23+35-7&limit=5"
```

**Respuesta:**
```json
{
  "success": true,
  "status": "PLACA_APROX",
  "match_level": "PLACA_APROX",
  "total": 5,
  "best": {
    "direccion": "CL 39 35A-07",
    "via": "CL 39", "placa": "35A-07",
    "lat": 6.2437, "lon": -75.5898,
    "match_level": "PLACA_APROX",
    "precision_meters": "50",
    "score": 85
  },
  "candidates": [ "..." ]
}
```

Niveles de `match_level`, de mayor a menor precisión: `EXACT_MATCH` (±2 m) ·
`PLACA_APROX` (±50 m) · `VIA_APENDICE` (±80 m) · `LOTE` (±80 m) · `VIA_ONLY` (±200 m) ·
`INTERSECTION_MATCH` (±30 m) · `FALLBACK` (±100 m).

Parámetros: `limit` (1-50, por defecto 10) e `incluir_via_only` (por defecto `true`;
ponerlo en `false` restringe el resultado a la cuadra pedida).

### Batch Processing
```bash
curl -X POST http://localhost:8000/api/v1/geocode/batch \
  -H "Content-Type: application/json" \
  -d '{
    "direcciones": [
      "Calle 39 # 35-35",
      "CR 33A 36B-20",
      "Avenida Paseo Peatonal # 1-1"
    ]
  }'
```

---

## 🧪 Pruebas

```bash
# Sin Docker: leen el GeoPackage directamente
PYTHONPATH=. python3 tests/test_normalizer_corpus.py     # 518K filas, ida y vuelta
PYTHONPATH=. python3 tests/test_normalizer_corpus.py --rapido
PYTHONPATH=. python3 tests/test_flexible_offline.py      # niveles y puntuacion

# Con la API levantada
./test_api.sh
```

> Las pruebas sólo necesitan `loguru` (además de la stdlib). Si no está instalado en el
> sistema, lo más cómodo es correrlas dentro del contenedor, que ya lo trae:
> `sudo docker-compose exec api python3 tests/test_normalizer_corpus.py`

El corpus recorre las 518.116 direcciones reales y exige que la forma canónica del
normalizador reproduzca exactamente lo que la base de datos almacena: **99,9998 %** de
ida y vuelta y **100 %** del subconjunto cubierto por la gramática.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────┐
│             Cliente / Script                │
└────────────────┬────────────────────────────┘
                 │ HTTP POST/GET
                 ▼
         ┌──────────────────┐
         │   FastAPI        │
         │   Port 8000      │
         │  - Normalizar    │
         │  - Geocodificar  │
         │  - Batch         │
         └────────┬─────────┘
                  │ psycopg2
                  ▼
      ┌──────────────────────────┐
      │   PostgreSQL+PostGIS     │
      │   Port 5432              │
      │                          │
      │ ┌────────────────────┐   │
      │ │ eje_de_nomenclatura│   │
      │ │  (10K+ LINES)      │   │
      │ │  GIST Index        │   │
      │ └────────────────────┘   │
      │                          │
      │ ┌────────────────────┐   │
      │ │nomenclatura_domici│   │
      │ │  (200K+ POINTS)    │   │
      │ │  GIST Index        │   │
      │ └────────────────────┘   │
      └──────────────────────────┘
```

---

## 📊 Datos

### Datasets Origen
- **eje_de_nomenclatura.gpkg** (12MB)
  - 10,000+ registros
  - Líneas de calles (MULTILINESTRING)
  - SRS: EPSG:9377

- **nomenclatura_domiciliaria.gpkg** (85MB)
  - 200,000+ registros
  - Puntos exactos de direcciones (POINT)
  - SRS: EPSG:9377

Fuente: [Portal de Datos Abiertos - GeoMedellín](https://datos.gov.co)

---

## ⚙️ Requisitos

- Docker & Docker Compose
- ~2GB de espacio en disco
- 2GB de RAM mínimo
- Conexión a internet (primera descarga)

### Sin requisitos de instalación local:
- ❌ PostgreSQL
- ❌ PostGIS
- ❌ Python (viene en contenedor)
- ❌ GDAL/OGR (viene en contenedor)

---

## 🛠️ Stack Tecnológico

| Componente | Versión | Propósito |
|-----------|---------|----------|
| Python | 3.11 | Runtime |
| FastAPI | 0.104 | Framework API |
| Uvicorn | 0.24 | ASGI Server |
| PostgreSQL | 16 | Base de datos |
| PostGIS | 3.4 | Extensión espacial |
| psycopg2 | 2.9 | Driver PostgreSQL |
| GeoPandas | 0.14 | Manejo de geometrías |
| Pydantic | 2.5 | Validación datos |

---

## 📖 Guía de Uso por Tipo de Usuario

### Para Desarrolladores
1. Lee [CLAUDE.md](./CLAUDE.md) - Arquitectura y estructura
2. Modifica `modules/` según necesites
3. Reconstruye con `sudo docker-compose build`

### Para Devops
1. Lee [DOCKER_COMMANDS.md](./DOCKER_COMMANDS.md) - Todos los comandos
2. Personaliza `docker-compose.yml` para tu infraestructura
3. Configura `.env` para producción

### Para Usuarios Finales
1. Ejecuta `sudo docker-compose up -d`
2. Usa `/docs` para interfaz interactiva
3. Integra con scripts Python/curl según necesites

---

## 🔍 Troubleshooting

**¿Qué pasa si la API no inicia?**
```bash
sudo docker-compose logs -f api
```

**¿Qué pasa si PostgreSQL no se conecta?**
```bash
sudo docker-compose logs -f postgres
```

**¿Qué pasa si cambio puertos?**
Edita `docker-compose.yml` y reconstruye:
```bash
sudo docker-compose build
sudo docker-compose up -d
```

Ver más en [DOCKER_COMMANDS.md](./DOCKER_COMMANDS.md#-troubleshooting)

---

## 📝 Notas de Precisión

- **Nivel 1 (EXACT):** ±2m - Punto exacto del predio en nomenclatura_domiciliaria
- **Nivel 2 (INTERSECTION):** ±30m - Punto de intersección de dos calles
- **Nivel 3 (FALLBACK):** ±100m - Centroide de la calle

La precisión depende de:
1. Calidad de los datos de origen
2. Normalización de la dirección de entrada
3. Disponibilidad de datos para esa ubicación

---

## 🤝 Desarrollo Futuro

- [ ] Tests automatizados (pytest)
- [ ] Caching de resultados
- [ ] Rate limiting y API keys
- [ ] Búsqueda por proximidad (nearby)
- [ ] Búsqueda por barrio/comuna
- [ ] Export a diferentes formatos (CSV, GeoJSON, KML)
- [ ] Web UI frontend
- [ ] Monitoreo y métricas (Prometheus)
- [ ] CI/CD pipeline

---

## 📄 Licencia

Este proyecto es de código abierto.

---

## 📞 Información

- **Desarrollador:** Claude (Anthropic)
- **Última actualización:** 2026-09-06
- **Versión:** 1.0.0

---

## 🎯 Próximos Pasos

1. **Ejecuta los comandos en [DOCKER_COMMANDS.md](./DOCKER_COMMANDS.md)**
2. **Visita http://localhost:8000/docs para probar la API**
3. **Lee [CLAUDE.md](./CLAUDE.md) para entender la arquitectura**
4. **Integra con tus aplicaciones usando curl o cliente HTTP**

¡Listo para geocodificar direcciones en Medellín! 🚀

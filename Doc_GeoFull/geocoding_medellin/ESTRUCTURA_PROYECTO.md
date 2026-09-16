# 📁 Estructura Completa del Proyecto

## 🎯 Resumen Ejecutivo

Proyecto completo de **API REST dockerizada** para geocodificación en Medellín.  
**Estado:** ✅ Listo para ejecutar  
**Configuración:** 100% en Docker (sin instalación local)

---

## 📂 Árbol de Archivos

```
geocoding-medellin/
│
├── 📋 DOCUMENTACIÓN (léeme primero)
│   ├── README.md                    ← Introducción general
│   ├── CLAUDE.md                    ← Arquitectura y continuidad
│   ├── DOCKER_COMMANDS.md           ← Comandos para ejecutar (MÁS IMPORTANTE)
│   ├── DATA_STRUCTURE.md            ← Estructura de datos
│   ├── ESTRUCTURA_PROYECTO.md       ← Este archivo
│   └── guia_desarrollo_api_medellin.md ← Guía original
│
├── 🐳 DOCKER (configuración)
│   ├── docker-compose.yml           ← Orquestación (PostgreSQL + API)
│   ├── Dockerfile                   ← Imagen de la API
│   └── requirements.txt             ← Dependencias Python
│
├── 🐍 PYTHON (código de la API)
│   ├── main.py                      ← FastAPI app principal
│   ├── init_db.py                   ← Inicialización de BD
│   │
│   └── modules/                     ← Módulos de lógica
│       ├── __init__.py              ← (vacío, para importar módulo)
│       ├── normalizer.py            ← Parsing de direcciones
│       ├── geocoder.py              ← Lógica de 3 niveles
│       └── db.py                    ← Conexiones a PostgreSQL
│
├── 📊 DATOS (GPKG)
│   ├── gpkg_eje_de_nomenclatura.zip        ← 5.2MB (líneas de calles)
│   ├── gpkg_nomenclatura_domiciliaria.zip  ← 33MB (puntos de direcciones)
│   │
│   └── data/
│       ├── gpkg/                    ← (Se crea automáticamente)
│       │   ├── eje_de_nomenclatura.gpkg
│       │   └── nomenclatura_domiciliaria.gpkg
│       │
│       └── sql/                     ← Scripts SQL
│           ├── 01-init.sql         ← Crear extensiones PostGIS
│           └── 03-indices.sql      ← Crear índices
│
├── 🧪 TESTING
│   └── test_api.sh                  ← Script de pruebas
│
├── ⚙️ CONFIGURACIÓN
│   └── .env.example                 ← Template de variables (.env)
│
└── 📄 OTROS
    ├── .gitignore                   ← Archivos ignorados por git
    └── (archivos zip originales)
```

---

## 📝 Descripción de Archivos Clave

### 🔴 PARA EJECUTAR (más importante)

#### `DOCKER_COMMANDS.md`
```
👉 LÉELO PRIMERO
Contiene todos los comandos docker que necesitas ejecutar.
- Preparar datos
- Construir imágenes
- Iniciar servicios
- Probar API
- Debugging
```

#### `docker-compose.yml`
```yaml
version: '3.9'
services:
  postgres:    # PostgreSQL + PostGIS
    image: postgis/postgis:16-3.4
    ports: 5432
  
  api:         # FastAPI
    build: .
    ports: 8000
    depends_on: postgres
```

#### `Dockerfile`
```dockerfile
FROM python:3.11-slim
# Instala GDAL, PostgreSQL client, etc.
# Copia código y dependencias
# Expone puerto 8000
```

---

### 🟢 PARA ENTENDER

#### `README.md`
Explicación general del proyecto:
- Features
- Quick start
- Ejemplos de uso
- Stack tecnológico

#### `CLAUDE.md`
Documentación técnica completa:
- Arquitectura detallada
- Flujo de geocodificación (3 niveles)
- Estructura de datos
- Endpoints de API
- TODO y próximas fases
- **Crítico para continuidad entre sesiones**

#### `DATA_STRUCTURE.md`
Descripción de los datos:
- Campos de cada tabla
- Cantidad de registros
- Ejemplo de búsqueda

---

### 🟡 CÓDIGO PRINCIPAL

#### `main.py`
FastAPI app con todos los endpoints:
```python
@app.post("/api/v1/geocode")
async def geocode_single(input_data: AddressInput):
    # Geocodifica una dirección
    return result.to_dict()

@app.post("/api/v1/geocode/batch")
async def geocode_batch(input_data: AddressInputBatch):
    # Geocodifica múltiples direcciones
    
@app.post("/api/v1/normalize")
async def normalize(input_data: AddressInput):
    # Normaliza una dirección

@app.get("/health")
@app.get("/stats")
# Endpoints de monitoreo
```

#### `init_db.py`
Script que corre al iniciar la API:
```python
def main():
    wait_for_db()           # Espera a que PostgreSQL esté listo
    import_gpkg(...)        # Importa datos desde GPKG
    create_indices()        # Crea índices espaciales
    validate_data()         # Valida datos importados
```

---

### 🔵 MÓDULOS DE LÓGICA

#### `modules/normalizer.py`
Convierte direcciones brutas en componentes:
```python
normalize_address("Calle 39 # 35-35")
# → {tipo_via: 'CALLE', numero_via: 39, 
#    via_generadora: 35, placa: '35-35'}
```

#### `modules/geocoder.py`
Lógica de 3 niveles de búsqueda:
```python
Level 1: search_exact_address()      # BD exacta (±2m)
Level 2: search_intersection()       # Cruce de calles (±30m)
Level 3: search_street_centroid()    # Centroide (±100m)
```

#### `modules/db.py`
Conexión a PostgreSQL:
```python
# Queries SQL y funciones de búsqueda
execute_query()
search_exact_address()
search_intersection()
search_street_centroid()
health_check()
get_statistics()
```

---

### 🟣 CONFIGURACIÓN Y DATOS

#### `.env.example`
```env
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=geocodificador_medellin
DATABASE_USER=postgres
DATABASE_PASSWORD=postgis_secure_pass_2024
LOG_LEVEL=INFO
```

#### `data/sql/01-init.sql`
```sql
CREATE EXTENSION postgis;
CREATE EXTENSION postgis_topology;
-- Setup inicial de BD
```

#### `requirements.txt`
Dependencias Python:
```
fastapi==0.104.1
psycopg2-binary==2.9.9
geopandas==0.14.1
shapely==2.0.2
...
```

---

## 🔄 Flujo de Ejecución

```
Usuario ejecuta:
  sudo docker-compose build
       ↓
   Docker construye 2 imágenes:
   - postgis/postgis:16-3.4 (BD)
   - python:3.11 + requirements.txt (API)
       ↓
   
  sudo docker-compose up -d
       ↓
   Inicia 2 contenedores:
   - postgres (escucha puerto 5432)
   - api (escucha puerto 8000)
       ↓
   
   Contenedor API ejecuta:
   - init_db.py
     ├─ Espera a que PostgreSQL esté listo
     ├─ Importa eje_de_nomenclatura.gpkg → tabla SQL
     ├─ Importa nomenclatura_domiciliaria.gpkg → tabla SQL
     ├─ Crea índices GIST
     └─ Valida datos
   - main.py (FastAPI en puerto 8000)
       ↓
   
Usuario accede:
  http://localhost:8000/api/v1/geocode
  → Request → FastAPI → PostgreSQL → Response
```

---

## 💾 Datos: Flujo de Importación

```
*.zip (descargados)
  └─ unzip → *.gpkg (descomprimido a data/gpkg/)
              └─ init_db.py
                 ├─ geopandas.read_file()
                 ├─ gdf.to_postgis() 
                 └─ CREATE INDEX ...
                    └─ ✓ Tabla SQL con índices
```

---

## 🌐 API: Flujo de una Geocodificación

```
Cliente:
POST /api/v1/geocode
{"direccion": "Calle 39 # 35-35"}
        ↓
main.py: geocode_single()
        ↓
modules/normalizer.py:
  normalize_address()
  → {tipo_via:'CALLE', numero_via:39, via_generadora:35, placa:'35-35'}
        ↓
modules/geocoder.py:
  Level 1: search_exact_address(...)
    → SELECT FROM nomenclatura_domiciliaria WHERE placa='35-35'
      → ✓ FOUND (lat, lon)
        ↓
  RESPONSE:
  {"success": true, "status": "EXACT_MATCH", "lat": 6.2437, "lon": -75.5898}
```

---

## 📊 Estadísticas

| Componente | Tamaño | Cantidad | Tiempo |
|-----------|--------|----------|--------|
| eje_de_nomenclatura.gpkg | 12MB | 10K+ líneas | - |
| nomenclatura_domiciliaria.gpkg | 85MB | 200K+ puntos | - |
| Docker build | ~500MB | 2 imágenes | 2-3 min |
| DB init | ~100MB | Índices | 1-5 min |
| Query response | - | 1 dirección | 10-50ms |

---

## ✅ Checklist de Ejecución

```
[ ] 1. Descargar/verificar .zip en carpeta
      ls -lh gpkg_*.zip

[ ] 2. Leer DOCKER_COMMANDS.md
      cat DOCKER_COMMANDS.md

[ ] 3. Preparar datos
      mkdir -p data/gpkg
      unzip gpkg_*.zip -d data/gpkg/

[ ] 4. Construir imágenes
      sudo docker-compose build

[ ] 5. Iniciar servicios
      sudo docker-compose up -d

[ ] 6. Ver logs
      sudo docker-compose logs -f api

[ ] 7. Esperar mensaje de éxito
      "✓ Database initialization completed!"
      "✓ API ready!"

[ ] 8. Probar health
      curl http://localhost:8000/health

[ ] 9. Probar geocodificación
      curl -X POST http://localhost:8000/api/v1/geocode \
        -H "Content-Type: application/json" \
        -d '{"direccion":"Calle 39 # 35-35"}'

[ ] 10. Ejecutar suite de tests
       ./test_api.sh

[ ] 11. Acceder a Swagger UI
       http://localhost:8000/docs
```

---

## 🔗 Relaciones entre Archivos

```
docker-compose.yml
├─ Dockerfile
│  ├─ requirements.txt
│  └─ main.py
│     ├─ init_db.py
│     │  ├─ modules/db.py
│     │  └─ data/gpkg/*.gpkg
│     │
│     └─ modules/
│        ├─ normalizer.py
│        ├─ geocoder.py
│        └─ db.py
│
├─ data/sql/
│  └─ 01-init.sql
│
└─ .env.example → .env (crear)
```

---

## 🚨 Archivos MÁS Importantes

**Por orden de importancia:**

1. **DOCKER_COMMANDS.md** 👈 Empieza aquí
2. **docker-compose.yml** - Configuración de servicios
3. **main.py** - Código de API
4. **init_db.py** - Importación de datos
5. **CLAUDE.md** - Documentación técnica (para próximas sesiones)
6. **modules/** - Lógica de negocio

---

## 🎓 Para Aprender

- Arquitectura: → CLAUDE.md
- Ejecución: → DOCKER_COMMANDS.md
- Uso: → README.md
- Datos: → DATA_STRUCTURE.md
- Código: → main.py, modules/

---

## 🔐 Notas de Seguridad

⚠️ **Para desarrollo/test solamente:**
- Contraseña hardcodeada en docker-compose.yml
- CORS habilitado para "*"
- DEBUG puede estar activo

✅ **Para producción:**
- Usar variables de entorno
- Restricción de CORS
- HTTPS + certificados
- Secrets manager
- Rate limiting + API keys

---

**Creado:** 2026-09-06  
**Versión:** 1.0.0  
**Status:** ✅ Listo para usar

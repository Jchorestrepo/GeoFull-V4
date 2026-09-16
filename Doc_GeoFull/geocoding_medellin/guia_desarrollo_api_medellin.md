# Guía de Desarrollo: API Local de Geocodificación para Medellín

Esta guía explica detalladamente cómo diseñar, estructurar e implementar una **API REST local** de alta precisión utilizando los datasets oficiales de **Eje de Nomenclatura** y **Nomenclatura Domiciliaria** provistos por el portal de Datos Abiertos de GeoMedellín.

---

## 1. Arquitectura y Componentes del Sistema

Para procesar entre 300 y 2000 direcciones diarias con rendimiento óptimo (milisegundos por consulta) e independencia de internet, la arquitectura recomendada es:

```
[Cliente / Script de Lotes] 
       │ (Petición HTTP POST / GET)
       ▼
 [API REST] (Python/FastAPI o Node.js/Express)
       │ (Módulo de Normalización y Parser de Texto)
       ▼
 [Base de Datos] (PostgreSQL + Extensión PostGIS) 
       ▼
[Indices Espaciales GIST y B-Tree] ──> Retorna Lat/Lon Exacta o Intersección
```

### Por qué esta combinación:
* **PostgreSQL + PostGIS:** Permite almacenar las geometrías indexadas de ambas capas y realizar consultas espaciales nativas como cálculos de intersecciones o búsquedas por proximidad.
* **FastAPI (Python):** Ideal por su velocidad nativa, manejo de asincronía y compatibilidad directa con librerías de análisis de datos (`pandas`, `shapely`) si se requiere lógica avanzada en el backend.

---

## 2. Preparación e Importación de Datos

Una vez descargados los archivos en formato **GeoPackage (`.gpkg`)** de GeoMedellín, se deben cargar en la base de datos PostgreSQL.

### Paso 2.1: Crear la Base de Datos y habilitar PostGIS
Ejecuta en tu consola de PostgreSQL:
```sql
CREATE DATABASE geocodificador_medellin;
\c geocodificador_medellin;
CREATE EXTENSION postgis;
```

### Paso 2.2: Importación de capas mediante `ogr2ogr`
Utiliza la herramienta de consola de GDAL/OGR (disponible al instalar QGIS o paquetes de desarrollo de bases de datos) para migrar los archivos locales a tablas SQL:

```bash
# Importar Nomenclatura Domiciliaria (Puntos de placas)
ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=geocodificador_medellin user=postgres password=tu_clave" nomenclatura_domiciliaria.gpkg -nln nomenclatura_domiciliaria -overwrite

# Importar Eje de Nomenclatura (Líneas de calles)
ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=geocodificador_medellin user=postgres password=tu_clave" eje_nomenclatura.gpkg -nln eje_nomenclatura -overwrite
```

### Paso 2.3: Creación de Índices (Crítico para el rendimiento)
Para garantizar búsquedas instantáneas, se deben indexar los campos de texto plano y las geometrías espaciales:
```sql
-- Índices para la nomenclatura domiciliaria (Búsqueda exacta por componentes)
CREATE INDEX idx_domicilio_via ON nomenclatura_domiciliaria (nombre_via);
CREATE INDEX idx_domicilio_placa ON nomenclatura_domiciliaria (numero_placa);
CREATE INDEX idx_domicilio_geom ON nomenclatura_domiciliaria USING gist (geom);

-- Índices para los ejes viales (Búsqueda de intersecciones)
CREATE INDEX idx_eje_nombre ON eje_nomenclatura (nombre_via);
CREATE INDEX idx_eje_geom ON eje_nomenclatura USING gist (geom);
```
*(Nota: Ajusta los nombres de las columnas `nombre_via` o `numero_placa` según los nombres exactos con los que se hayan importado los atributos desde el portal).*

---

## 3. Lógica del Motor de Búsqueda (Algoritmo de la API)

La nomenclatura en Colombia (y específicamente en Medellín) sigue un estándar de **Eje Principal** y **Vía Generadora** (Ej: *Calle 39 # 35-35* significa: predio ubicado sobre la Calle 39, a 35 metros de la esquina con la Carrera 35).

El endpoint de tu API (`/api/v1/geocode`) debe procesar la solicitud siguiendo estrictamente este flujo lógico de tres capas:

```
                  ┌──────────────────────────┐
                  │ Dirección de Entrada     │
                  └────────────┬─────────────┘
                               ▼
                ┌──────────────────────────────┐
                │ 1. Normalización de Texto    │
                │ (Estandarizar Cl, Cra, #)    │
                └────────────┬─────────────┘
                               ▼
               ┌────────────────────────────────┐
               │ ¿Existe coincidencia exacta en │
               │     Nomenclatura Domiciliaria? │
               └──────────────┬───────────────┬─┘
                              │ Sí            │ No
                              ▼               ▼
         ┌─────────────────────────┐   ┌───────────────────────────────┐
         │ Retornar punto exacto   │   │ 2. Buscar Intersección en     │
         │ Rooftop (Precisión 100%)│   │    Eje de Nomenclatura        │
         └─────────────────────────┘   └──────────────┬──────────────┬─┘
                                                      │ Sí           │ No
                                                      ▼              ▼
                               ┌─────────────────────────┐   ┌──────────────────────────┐
                               │ Calcular cruce de líneas│   │ 3. Caída ("Fallback"):   │
                               │ Retornar punto esquina  │   │    Buscar solo por Vía   │
                               │ (Precisión ~30 metros)  │   │    Principal o Barrio    │
                               └─────────────────────────┘   └──────────────────────────┘
```

### Fase 1: El Módulo de Normalización (Limpieza)
El texto recibido de los usuarios suele venir desestructurado. El backend debe aplicar expresiones regulares (RegEx) para transformar la entrada.
* **Entrada típica:** `"Avenida Carrera 43A No. 16a - 25 Interno 301"`
* **Salida limpia estructurada:** 
  * Tipo de vía: `CARRERA`
  * Número de vía: `43A`
  * Vía generadora (Cruce): `16A`
  * Placa (Metros): `25`

### Fase 2: Estrategia de Consulta en Cascada (SQL)

#### Nivel 1: Búsqueda en Nomenclatura Domiciliaria (Punto Exacto)
La API ejecuta primero una consulta directa buscando el punto del predio.
```sql
SELECT ST_X(geom) as longitud, ST_Y(geom) as latitud, barrio 
FROM nomenclatura_domiciliaria 
WHERE tipo_via = 'CALLE' 
  AND numero_via = '39' 
  AND numero_placa = '35-35' 
LIMIT 1;
```

#### Nivel 2: Interpolación/Intersección por Ejes de Nomenclatura (Si falla el Nivel 1)
Si la placa exacta no existe (vivienda muy nueva o error en el rango), la API busca la intersección de las dos vías principales de la dirección (Calle 39 y Carrera 35) utilizando funciones topológicas de PostGIS:
```sql
SELECT ST_X(ST_Intersection(a.geom, b.geom)) as longitud, 
       ST_Y(ST_Intersection(a.geom, b.geom)) as latitud
FROM eje_nomenclatura a, eje_nomenclatura b
WHERE a.nombre_via = 'CALLE 39' 
  AND b.nombre_via = 'CARRERA 35'
  AND ST_Intersects(a.geom, b.geom)
LIMIT 1;
```
*Resultado:* Te devolverá la coordenada exacta de la esquina. Es un margen excelente para operaciones logísticas o de distribución masiva.

---

## 4. Estructura del Código del Endpoint (Ejemplo en Python)

A continuación se muestra el esquema técnico de cómo estructurar el servidor de la API utilizando FastAPI:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2

app = FastAPI(title="Geocodificador Local Medellín")

# Configuración de conexión de base de datos
DB_PARAMS = {
    "dbname": "geocodificador_medellin",
    "user": "postgres",
    "password": "tu_clave",
    "host": "localhost"
}

class DireccionInput(BaseModel):
    direccion_cruda: str

def normalizar_direccion(texto: str):
    # Aquí se implementa la lógica de expresiones regulares (RegEx)
    # Ejemplo básico de retorno estructurado simulado:
    texto = texto.upper()
    # Lógica interna para mapear 'CL' -> 'CALLE', 'CRA' -> 'CARRERA', extraer números, etc.
    return {"tipo": "CALLE", "via_principal": "39", "via_generadora": "35", "placa": "35-35"}

@app.post("/api/v1/geocode")
async def geocode_address(input_data: DireccionInput):
    componentes = normalizar_direccion(input_data.direccion_cruda)
    
    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()
    
    try:
        # 1. Intentar nivel 1: Domicilio Exacto
        query_domicilio = """
            SELECT ST_X(geom), ST_Y(geom) 
            FROM nomenclatura_domiciliaria 
            WHERE tipo_via = %s AND numero_via = %s AND numero_placa = %s 
            LIMIT 1;
        """
        cursor.execute(query_domicilio, (componentes['tipo'], componentes['via_principal'], componentes['placa']))
        res = cursor.fetchone()
        
        if res:
            return {"status": "EXACT_MATCH", "lat": res[1], "lon": res[0], "origen": "domiciliaria"}
            
        # 2. Intentar nivel 2: Intersección de ejes viales si el domicilio falla
        query_interseccion = """
            SELECT ST_X(ST_Intersection(a.geom, b.geom)), ST_Y(ST_Intersection(a.geom, b.geom))
            FROM eje_nomenclatura a, eje_nomenclatura b
            WHERE a.nombre_via = %s AND b.nombre_via = %s AND ST_Intersects(a.geom, b.geom)
            LIMIT 1;
        """
        nombre_via_a = f"{componentes['tipo']} {componentes['via_principal']}"
        nombre_via_b = f"CARRERA {componentes['via_generadora']}" # Asumiendo cruce estándar
        
        cursor.execute(query_interseccion, (nombre_via_a, nombre_via_b))
        res_int = cursor.fetchone()
        
        if res_int:
            return {"status": "INTERSECTION_MATCH", "lat": res_int[1], "lon": res_int[0], "origen": "eje_vial"}
            
        raise HTTPException(status_code=404, detail="Dirección no localizada en los modelos de la ciudad")
        
    finally:
        cursor.close()
        conn.close()

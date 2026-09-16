# GeoFull V4 — Blueprint Arquitectónico Estratégico (Versión Final Corregida)

> **Propósito**: Especificación definitiva de GeoFull V4: un solo proyecto con `geocoding-medellin` integrado como módulo Python, 3 etapas de pipeline sin agentes, 6 módulos core sin bodegas, conciliación diaria + liquidación quincenal, y zonas personalizadas por empresa.

---

## 1. Menú Simplificado de GeoFull V4 (6 Módulos Centrales)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      MÓDULOS PRINCIPALES DE GEOFULL V4                 │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 📊 Dashboard               │ Métricas y KPIs de la operación        │
│ 2. 🗺️ Sectorización           │ Geocodificación local (7 niveles) y    │
│                               │ Zonas Personalizadas Simultáneas       │
│ 3. 📦 Control y Conciliación  │ Entregas diarias + Nómina quincenal    │
│ 4. 👥 Personal                │ Conductores domiciliarios y vales      │
│ 5. 🔍 Historial / Rastreo     │ Trazabilidad unificada de guías        │
│ 6. ⚙️ Configuración           │ Gestión del Equipo (Usuarios Web)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Reglas de Dominio Definitivas

### 2.1 Integración de `geocoding-medellin`
- Se integra como **módulo Python interno** (`from geocoding_medellin.geocoder import geocode`).
- Comparte la **misma instancia PostgreSQL** que GeoFull V4.
- **No** es un microservicio HTTP aparte.

### 2.2 Sin Bodegas
- El concepto de múltiples bodegas por empresa se elimina. Cada empresa opera como una sola unidad.

### 2.3 Sin Agente Aprendiz
- El motor de aprendizaje automático de correcciones fue eliminado. Las correcciones se aplican manualmente.

### 2.4 Sectorización Exclusiva por Zonas Personalizadas
- Cada empresa sube sus propios GeoJSONs de zonas.
- Todas las zonas están activas al mismo tiempo.
- Los polígonos no se sobreponen (validación programática al importar).
- Si un pedido no cae en ninguna zona → estado `FUERA_DE_ZONA`.

### 2.5 Validación por Rangos Lógicos
- Se mantiene como segunda validación espacial para prevenir errores de asignación.

### 2.6 Control de Entregas (Diario) vs. Liquidación de Nómina (Quincenal)
- **Diariamente**: Se sube un archivo con las guías entregadas por cada domiciliario. El sistema concilia, marca como `ENTREGADO` y retira del inventario.
- **Quincenalmente** (o período personalizado): Se puede re-subir el documento completo para detectar discrepancias acumuladas. El sistema genera la liquidación de nómina (`total_paquetes × tarifa - adelantos`).

### 2.7 Gestión del Equipo vs. Personal
- **Gestión del Equipo (en Configuración)** = Usuarios web (`admin_empresa`, `operario`).
- **Personal (Módulo 4)** = Conductores domiciliarios, tarifas y vales/adelantos.

### 2.8 Historial / Rastreo Unificado
- Se eliminan *Casos Ambiguos* y *Auditoría Visual*.
- Toda la trazabilidad se visualiza en la línea de tiempo de **Historial / Rastreo**.

---

## 3. Matriz Completa de Cambios V3 → V4

| Componente | GeoFull V3 | GeoFull V4 |
|---|---|---|
| **Backend** | Dupla (Node.js Express + Python FastAPI) | **Backend Único FastAPI** |
| **Geocodificación** | Google Maps API + Redis GeoCache | **`geocoding-medellin` local** (518k predios). Google = recalculador manual |
| **Niveles de Precisión** | 1 (según Google: ROOFTOP, GEOMETRIC_CENTER) | **7 niveles** (EXACT_MATCH, PLACA_APROX, INTERSECTION, etc.) |
| **Pipeline** | 7 Agentes secuenciales Python + Agente Aprendiz | **3 Etapas Funcionales** (Pre-Limpiador Sanitizer & Normalizar → Geocodificar Local → Sectorizar). Sin Agente Aprendiz |
| **Multi-Tenant** | Esquemas dinámicos `tenant_<id>` | **PostgreSQL Row-Level Security (RLS)** |
| **Sectorización** | Barrios + Códigos Postales + Zonas | **Solo Zonas Personalizadas Simultáneas** por empresa |
| **Bodegas** | Múltiples por empresa | **Eliminadas** — empresa = unidad operativa |
| **Conciliación** | Módulo separado | **Control Diario** de entregas + **Liquidación Quincenal** de nómina |
| **Revisión de Guías** | Casos Ambiguos + Auditoría Visual (separados) | **Historial / Rastreo** unificado con línea de tiempo |
| **Gestión de Usuarios** | Mezcla web y domiciliarios | **Gestión del Equipo** (web) vs. **Personal** (domiciliarios) |
| **Docker** | 5 servicios (db, redis, pipeline, api, frontend) | **3 servicios** (db, backend, frontend) |
| **Consola SaaS** | Vista simple | **Centro de Control Multiciudad** con subida de GPKGs |
| **EPSG** | N/A (Google devolvía WGS84) | GPKG en EPSG:9377 → **reproyectar a EPSG:4326** con `ogr2ogr -t_srs` |
| **Caché Redis** | Indispensable (evitar repagar Google) | **Eliminada** — BD local PostGIS es la fuente primaria |

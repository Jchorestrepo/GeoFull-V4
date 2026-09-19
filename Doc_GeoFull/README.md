# GeoFull V4 — Documentación Técnica Maestra & Guía de Replicación para IA

Bienvenido a la suite de documentación técnica de **GeoFull V4**. Esta carpeta contiene la especificación completa, autosuficiente y detallada para construir GeoFull V4 desde cero mediante agentes de IA o desarrolladores senior.

---

## 📌 Resumen Ejecutivo

GeoFull V4 es una plataforma SaaS multi-tenant de logística de última milla para Medellín y Colombia. Geocodifica direcciones colombianas informales a nivel **Rooftop (±2m)** usando una base de datos catastral local de **518,116+ predios** (`geocoding-medellin`), sectoriza por zonas personalizadas GeoJSON por empresa, y controla entregas diarias con liquidación de nómina quincenal.

**Stack**: Backend Único FastAPI + AsyncPG | Frontend React + Vite | PostgreSQL 16 + PostGIS | Docker

---

## 📌 Los 6 Módulos Core

```
1. 📊 Dashboard               ├── KPIs operacionales
2. 🗺️ Sectorización           ├── Geocodificación local (7 niveles) + Zonas Personalizadas Simultáneas
3. 📦 Control y Conciliación  ├── Entregas diarias + Nómina quincenal
4. 👥 Personal                ├── Conductores domiciliarios y vales/adelantos
5. 🔍 Historial / Rastreo     ├── Trazabilidad unificada de guías
6. ⚙️ Configuración           ├── Gestión del Equipo (Usuarios con acceso web)
```

---

## 🗂️ Índice de la Documentación

| Documento | Descripción |
|---|---|
| 📄 [01_ARCHITECTURE_OVERVIEW.md](./01_ARCHITECTURE_OVERVIEW.md) | Arquitectura single-stack, integración de `geocoding-medellin` como módulo Python interno, flujos de datos. |
| 📄 [02_DATABASE_SCHEMA_SPEC.md](./02_DATABASE_SCHEMA_SPEC.md) | DDL real de las tablas catastrales (EPSG:9377→4326), tablas RLS por tenant (pedidos, zonas, conciliación, nómina). |
| 📄 [03_AGENT_PIPELINE_SPEC.md](./03_AGENT_PIPELINE_SPEC.md) | Pipeline de 3 etapas, los 7 niveles de precisión reales del geocoder, sectorización y rangos lógicos. |
| 📄 [04_API_CONTRACTS_SPEC.md](./04_API_CONTRACTS_SPEC.md) | Contratos REST completos: auth, SaaS admin, pedidos, sectorización, conciliación, nómina, geocode, móvil. |
| 📄 [05_FRONTEND_UI_SPEC.md](./05_FRONTEND_UI_SPEC.md) | 6 Módulos Core, mapas Leaflet, conciliación diaria + nómina quincenal, Consola SaaS y app móvil. |
| 📄 [06_CICD_AND_DEVOPS_SPEC.md](./06_CICD_AND_DEVOPS_SPEC.md) | Docker (3 servicios), GitHub Actions, migraciones SQL, importación GPKG con `ogr2ogr -t_srs EPSG:4326`. |
| 📄 [07_GEOFULL_V4_STRATEGIC_BLUEPRINT.md](./07_GEOFULL_V4_STRATEGIC_BLUEPRINT.md) | Blueprint definitivo, reglas de negocio y matriz completa V3→V4. |
| 📄 [08_GUIA_DETALLADA_VISTAS_Y_ESENCIA.md](./08_GUIA_DETALLADA_VISTAS_Y_ESENCIA.md) | Especificación detallada página por página y conservación de la esencia operativa V3➔V4. |
| 📄 [normalizador/README.md](./normalizador/README.md) | Motor de normalización de direcciones: pipeline (limpieza, reglas, CRF, ensamblado), estados OK/PARCIAL/FALLO, integración con el geocoder y reentrenamiento. |

---

## 🤖 Reglas Estrictas para IA que Replique este Sistema

1. **Geocodificación Local, NO Google para lotes masivos**:
   - Integrar `geocoding-medellin` como módulo Python interno (`from geocoding_medellin...`).
   - Las tablas catastrales comparten la misma BD PostgreSQL de GeoFull.
   - Los GPKG originales usan **EPSG:9377** — se deben reprojectar a **EPSG:4326** con `ogr2ogr -t_srs EPSG:4326`.
   - Google Maps API se usa **solo** como recalculador manual desde el Frontend.

2. **7 niveles de precisión** (no 3): EXACT_MATCH(100), PLACA_APROX(85), VIA_APENDICE(55), INTERSECTION_MATCH(50), LOTE(45), VIA_ONLY(25), FALLBACK(15).

3. **Solo Zonas Personalizadas GeoJSON** por empresa (no códigos postales ni barrios). Todas activas simultáneamente, sin sobreposición (validada programáticamente con `ST_Intersects`, **no** con `EXCLUDE USING GIST`).

4. **Sin bodegas** — cada empresa es una sola unidad operativa.

5. **Sin Agente Aprendiz** — no hay aprendizaje en línea ni automático en producción. El único modelo es el CRF de respaldo del [Normalizador](./normalizador/README.md): es un modelo fijo que se reentrena a mano con la CLI.

6. **Conciliación diaria** (archivo de entregas) + **Liquidación quincenal** (nómina por período). Se puede re-subir el documento completo de la quincena para detectar discrepancias.

7. **Gestión del Equipo** (Configuración) = Usuarios web | **Personal** = Domiciliarios y nómina.

8. **Historial / Rastreo** reemplaza *Casos Ambiguos* y *Auditoría Visual*. Toda trazabilidad en un solo lugar.

9. **Estado `FUERA_DE_ZONA`** cuando un pedido geocodificado no cae en ninguna zona personalizada.

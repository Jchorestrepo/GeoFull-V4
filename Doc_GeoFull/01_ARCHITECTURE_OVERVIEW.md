# GeoFull V4 — 01. Arquitectura del Sistema, Módulos Core y Flujos de Datos

> **Propósito**: Especificar la arquitectura de software de GeoFull V4: backend único FastAPI con el módulo `geocoding-medellin` integrado internamente, simplificación a **6 Módulos Core** sin bodegas, y aislamiento multi-tenant.

---

## 1. Visión General de la Arquitectura GeoFull V4

GeoFull V4 funciona sobre un **Backend Único Asíncrono en FastAPI (Python + AsyncPG)** que integra directamente como **módulo Python interno** el normalizador y geocodificador del proyecto `geocoding-medellin`. Ambos comparten la misma base de datos PostgreSQL.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND REACT + VITE                           │
│  [1.Dashboard] [2.Sectorización] [3.Control y Conciliación]            │
│  [4.Personal]  [5.Historial/Rastreo] [6.Configuración/Equipo]          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       HTTP / REST (JWT Auth Header)
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              BACKEND ÚNICO FASTAPI (Python + AsyncPG)                  │
│                                                                        │
│  ├── API Operaciones SaaS & Multi-Tenant (RLS)                         │
│  │                                                                     │
│  ├── geocoding_medellin/  (Módulo Python interno — import directo)      │
│  │   ├── normalizer.py   → Normalización sintáctica CL/CR/TV/DG       │
│  │   ├── geocoder.py     → Búsqueda en 7 niveles de precisión         │
│  │   └── db.py           → Consultas PostGIS a tablas catastrales     │
│  │                                                                     │
│  ├── Motor de Sectorización Multizona Simultánea (ST_Contains)         │
│  └── API Conciliación de Entregas + Liquidación de Nómina              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  POSTGRESQL 16 + POSTGIS SPATIAL DB                    │
│                                                                        │
│  Tablas Catastrales (Compartidas — public):                            │
│  ├── public.nomenclatura_domiciliaria (518k+ predios, EPSG:4326)      │
│  ├── public.eje_de_nomenclatura (42k+ ejes viales, EPSG:4326)         │
│  ├── public.empresas (Tenants & Ciudades asignadas)                    │
│  └── public.datasets_ciudades (Registro de GPKGs importados)           │
│                                                                        │
│  Tablas por Tenant (RLS):                                              │
│  ├── zonas_personalizadas, rangos_logicos                              │
│  ├── pedidos, inventario                                               │
│  ├── personal_conductores, conciliaciones, liquidaciones               │
│  └── usuarios (acceso web)                                             │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Integración de `geocoding-medellin` como Módulo Interno
- El código de `geocoding-medellin` (`modules/normalizer.py`, `modules/geocoder.py`, `modules/db.py`) se copia/integra directamente como un paquete Python dentro del backend de GeoFull V4.
- **No** es un microservicio HTTP aparte. Se invoca por `import` directo (`from geocoding_medellin.geocoder import geocode`).
- Comparte la **misma instancia PostgreSQL** que GeoFull V4: las tablas catastrales `nomenclatura_domiciliaria` y `eje_de_nomenclatura` residen en el esquema `public` junto a las tablas del SaaS.

---

## 2. Flujo de Datos de Sectorización Multizona Simultánea

```
[Usuario] ──(Sube Excel de Pedidos)──► [Frontend React]
                                              │
                                              ▼
                                   [Backend Único FastAPI]
                                              │
     ┌────────────────────────────────────────┴────────────────────────────────────────┐
     │ 1. NORMALIZACIÓN SINTÁCTICA (geocoding_medellin.normalizer)                     │
     │    Convierte variantes de texto a formato catastral: vía='CL 39', placa='35-03' │
     └────────────────────────────────────────┬────────────────────────────────────────┘
                                              │
     ┌────────────────────────────────────────┴────────────────────────────────────────┐
     │ 2. GEOCODIFICACIÓN CATASTRAL LOCAL (geocoding_medellin.geocoder)                │
     │    7 niveles de precisión: EXACT_MATCH(±2m), PLACA_APROX(±50m),                │
     │    INTERSECTION_MATCH(±30m), VIA_APENDICE(±80m), LOTE(±80m),                   │
     │    VIA_ONLY(±200m), FALLBACK(±100m)                                             │
     └────────────────────────────────────────┬────────────────────────────────────────┘
                                              │
          ┌───────────────────────────────────┴───────────────────────────────────┐
          │ (Coordenadas encontradas)                                            │ (No encontrada)
          ▼                                                                      ▼
┌──────────────────────────────────────────┐               ┌──────────────────────────────────┐
│ 3. SECTORIZACIÓN MULTIZONA SIMULTÁNEA    │               │ MARCAR COMO 'REQUIERE_REVISIÓN'  │
│    Cruce PostGIS ST_Contains contra      │               │ (Opción de recalculo con Google)  │
│    TODAS las zonas_personalizadas activas│               └──────────────────────────────────┘
│    del tenant                            │
└─────────────────┬────────────────────────┘
                  │
     ┌────────────┴────────────┐
     │ (Cae en zona)           │ (No cae en ninguna zona)
     ▼                         ▼
[Zona Asignada]         [Estado: FUERA_DE_ZONA]
     │
     ▼
┌─────────────────────────────────────┐
│ 4. VALIDACIÓN DE RANGOS LÓGICOS    │
│    Comprueba que la placa pertenezca│
│    al rango vianumerado de esa zona│
└─────────────────┬───────────────────┘
                  │
                  ▼
     [Guardar Pedido Sectorizado]
```

---

## 3. Simplificaciones Respecto a GeoFull V3

- **Sin bodegas**: En V4 no existe el concepto de múltiples bodegas por empresa. Cada empresa es una sola unidad operativa.
- **Sin Agente Aprendiz**: El motor de aprendizaje automático de correcciones fue eliminado. Las correcciones se aplican manualmente.
- **Sin Casos Ambiguos ni Auditoría Visual**: Ambos componentes se eliminaron y su información se consolida en **Historial / Rastreo**.

---

## 4. Delimitación de Acceso: Gestión del Equipo vs. Personal

- **Gestión del Equipo (en Módulo 6 Configuración)**: Control de acceso para usuarios que inician sesión en la aplicación web GeoFull (`admin_empresa`, `operario`).
- **Personal (Módulo 4)**: Registro operativo de conductores domiciliarios, tarifas por paquete y solicitudes de vales/adelantos de nómina.

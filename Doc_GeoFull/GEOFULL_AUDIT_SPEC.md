# GeoFull V3 — Auditoría Arquitectónica y Especificación Inversa (V2.0 Blueprint)

> **Documento Maestro**: `GEOFULL_AUDIT_SPEC.md`  
> **Fecha de Auditoría**: Septiembre 2026  
> **Rol de Ejecución**: Principal Systems Architect & Lead Security Auditor  
> **Repositorio Evaluado**: `GeoFull-V3`  

---

## 1. Resumen Ejecutivo y Core Domain

### Propósito del Negocio
GeoFull V3 es un sistema de inteligencia logística y gestión operativa multi-inquilino (*SaaS Multi-Tenant*) diseñado para resolver la fricción crítica en la última milla del comercio electrónico y servicios de mensajería en Colombia. El sistema aborda tres dolores operativos fundamentales: (1) la ambigüedad, errores tipográficos e incoherencias de las direcciones colombianas (ej: "Calle 39 # 39-21", nomenclaturas informales, dobles abreviaturas), (2) la ineficiencia e imprecisión en la asignación de paquetes a zonas, barrios y conductores, y (3) la falta de control en el flujo de inventario de bodega, la conciliación de entregas en campo y el cálculo de nómina de transportadores.

La plataforma recibe paquetes de forma masiva (vía Excel/JSON) o individual, normaliza y limpia la dirección utilizando una arquitectura de agentes de Inteligencia Artificial y reglas estandarizadas, geocodifica la ubicación mediante APIs espaciales, cruza las coordenadas e hilos de nomenclaturas con polígonos GeoJSON (PostGIS) y rangos lógicos de calles/carreras, y asigna de manera automatizada el sector correspondiente.

Finalmente, el flujo de valor se extiende hasta la operación física: control de inventario en bodega por escaneo QR, asignación a domiciliarios a través de una PWA Móvil, verificación de entregas por proximidad GPS y cálculo automático de nómina y conciliación de liquidaciones por paquete entregado o devuelto.

```
[Importación Masiva (Excel/JSON)] 
       │
       ▼
[Pipeline 7+ Agentes (Python/FastAPI)] ──(Limpieza/Geocodificación)──► [PostGIS GeoJSON + Rangos Lógicos]
       │                                                                        │
       ▼                                                                        ▼
[Asignación Automatizada de Sector] ◄───────────────────────────────────────────┘
       │
       ▼
[Recepción Bodega (Escaneo QR / PWA)] ──► [Despacho a Domiciliario (PWA Móvil)] ──► [Verificación GPS & Nómina]
```

### Flujos de Usuario Principales
1. **Importación y Procesamiento de Pedidos en Lote**:
   - El administrador de empresa sube un archivo Excel (`.xlsx`) con cientos de pedidos.
   - El backend Express recibe el payload, crea registros en estado `importado` dentro del esquema del inquilino (`tenant_<id>`).
   - El pipeline en FastAPI procesa las direcciones mediante los agentes (A1 Parser, A5 Validador, A6 Geocodificador, A9 Validador de Sector, A7 Auditor).
   - Las direcciones ambiguas se registran en la mesa de control de `casos_ambiguos` para resolución humana o aprendizaje automático (Agente Aprendiz).

2. **Sectorización Espacial e Inventario de Bodega**:
   - Cada paquete procesado se clasifica en `sector_barrio`, `sector_codigo_postal`, `sector_zona` o sectores personalizados (`custom1`, `custom2`).
   - Al llegar a bodega, los operarios usan la PWA Móvil (`mobileBodega.js`) para escanear el código QR/barras del paquete, cambiando el estado a `en_bodega`.

3. **Despacho y Ruta del Domiciliario**:
   - El supervisor o la PWA asigna lotes de paquetes a un domiciliario específico.
   - El domiciliario visualiza su lista de entregas en la PWA Móvil (`mobileDomiciliario.js`), navega con mapas integrados y registra la entrega con foto/firma y coordenadas GPS reales.

4. **Conciliación de Entregas y Auditoría de Distancia**:
   - El sistema calcula la distancia euclidiana/haversine (`ST_Distance`) entre el punto geocodificado de destino y las coordenadas reales donde el repartidor marcó la entrega.
   - Si la distancia supera el umbral configurado, la entrega se marca como `dudosa`, requiriendo aprobación del supervisor (`ControlConciliacion.jsx`).

5. **Liquidación y Nómina de Transportadores**:
   - El módulo de nómina (`nomina.js` / `PersonalNomina.jsx`) calcula los pagos diarios/semanales basados en paquetes entregados, devueltos, novedades registradas, préstamos de herramientas y deducciones.

6. **Administración Multi-Tenant (SaaS Console)**:
   - El Super Admin administra la creación de tenants (`empresas`), asignación de cuotas (`max_usuarios`), planes de suscripción, módulos activos (*feature flags*) y consulta logs de auditoría global (`auditoria_saas`).

### Límites de Dominio ("Qué es" vs. "Qué NO es")

| Ámbito | Qué ES GeoFull V3 | Qué NO ES (Out of Scope / Parches Satélite) |
| :--- | :--- | :--- |
| **Core Domain** | Normalizador y geocodificador multi-agente de direcciones colombianas. | ERP de contabilidad general o facturación electrónica Dian. |
| **Logística** | Sectorizador espacial (GeoJSON MultiPolygon PostGIS + Rangos lógicos). | Rutificador dinámico complejo VRP (Vehicle Routing Problem con restricciones de tiempo en tiempo real). |
| **Operación** | Control de inventario en bodega por QR y trazabilidad de paquete (`importado` $\rightarrow$ `en_bodega` $\rightarrow$ `en_ruta` $\rightarrow$ `entregado`). | Sistema de telemetría vehicular OBD-II o rastreo en tiempo real segundo a segundo estilo Uber. |
| **Nómina** | Liquidación de entregas, novedades y préstamos operativos por transportador. | Sistema de nómina electrónica corporativa con aportes a seguridad social / PILA. |
| **SaaS** | Aislamiento multi-inquilino a nivel de esquema DB (`tenant_<id>`) con control RBAC. | Pasarela de cobro recurrente integrada (Stripe/Wompi) con cobros automáticos de tarjeta de crédito. |

---

## 2. Radiografía del Stack y la Infraestructura Actual

### Mapa de Dependencias

#### Backend Node.js / Express (`api/package.json`)
- **Críticos**: [`express`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L12) (servidor HTTP), [`pg`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L18) (driver PostgreSQL/PostGIS), [`jsonwebtoken`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L13) (autenticación JWT), [`cors`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L11).
- **Reemplazables**: [`xlsx`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L19) (procesamiento en memoria de hojas de cálculo; propenso a saturación de memoria en archivos > 50MB, reemplazar por worker streams), [`passport`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L16) / [`passport-google-oauth20`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L17) (sobrecarga para OAuth simple).
- **Obsoletos / Innecesarios**: [`multer`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/package.json#L15) si las subidas masivas se migran a almacenamiento S3/presigned URLs.

#### Backend Python / FastAPI (`backend/requirements.txt`)
- **Críticos**: [`fastapi`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L1), [`uvicorn`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L2), [`pydantic`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L6), [`httpx`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L7) (cliente HTTP asíncrono para Google Maps/OpenAI), [`psycopg2-binary`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L11).
- **Reemplazables**: [`pandas`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L3) / [`openpyxl`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/requirements.txt#L4) (utilizados solo para scripts de evaluación puntuales en lugar de procesamiento reactivo).
- **Obsoletos / Innecesarios**: Fragmentación de drivers SQLite dentro de agentes (reemplazar por persistencia PostgreSQL unificada).

#### Frontend React (`frontend/package.json`)
- **Críticos**: [`react`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L16), [`react-dom`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L17), [`react-router-dom`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L19), [`leaflet`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L13) / [`react-leaflet`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L18), [`zustand`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L20).
- **Reemplazables**: [`tailwindcss`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/package.json#L26) v3 (migrar a v4 o CSS modules tipados), `qrcode.react`.

### Modelo de Despliegue Actual
- **Contenedores Docker** ([`docker-compose.yml`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/docker-compose.yml)):
  - `geofull-db`: PostgreSQL 15 + PostGIS 3.4 (`postgis/postgis:15-3.4`). Base de datos interna sin exposición de puertos al host.
  - `geofull-pipeline`: FastAPI Python en puerto `8001:8001`.
  - `geofull-api`: Express Node.js en puerto interno `3001` (comunicación inter-contenedor).
  - `geofull-frontend`: Build estático de React servido por un Nginx interno expuesto en `5173:80`.
- **Proxy Inverso**: Nginx a nivel de host VPS ([`geofull-v3.conf`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/geofull-v3.conf)) enrutando dominios `dx.geofull.space` (Frontend) y `api.dx.geofull.space` (FastAPI Pipeline). Existe también un directorio [`traefik/`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/traefik) en el repositorio como configuración alternativa.
- **Pipeline CI/CD**: GitHub Actions en [`.github/workflows/deploy.yml`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/.github/workflows/deploy.yml). Disparado automáticamente en `push` a `main`. Conecta por SSH al VPS, ejecuta `git reset --hard`, corre scripts de migración SQL ([`run-migrations.sh`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/scripts/run-migrations.sh)), recarga Nginx, ejecuta `docker compose build` y `up -d`, e invoca verificaciones de salud (*healthchecks*).

```
   [ Client Browser / PWA ]
              │
              ▼
   [ Host Nginx Proxy ] (dx.geofull.space / api.dx.geofull.space)
        │           │
        │           └────────────────────────┐
        ▼ (:5173)                            ▼ (:8001)
┌─────────────────────────┐      ┌─────────────────────────┐
│ geofull-frontend        │      │ geofull-pipeline        │
│ (Nginx internal / React)│      │ (FastAPI Python)        │
└─────────────────────────┘      └───────────┬─────────────┘
                                             │ HTTP Inter-container (:3001)
                                             ▼
                                 ┌─────────────────────────┐
                                 │ geofull-api             │
                                 │ (Express Node.js)       │
                                 └───────────┬─────────────┘
                                             │ SQL / PostGIS
                                             ▼
                                 ┌─────────────────────────┐
                                 │ geofull-db              │
                                 │ (PostgreSQL 15 + PostGIS)│
                                 └─────────────────────────┘
```

### Servicios Externos y Conexiones
1. **Google Maps Platform API**: Integrada en [Agent 6](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_6_geocodificador.py). Utiliza Geocoding API y Places API para resolver coordenadas, `place_id`, `location_type` (`ROOFTOP`, `RANGE_INTERPOLATED`) y componentes de dirección.
2. **OpenAI API**: Utilizada en [Agent 8 (Sugeridor)](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_8_sugeridor.py) y [Agent Aprendiz](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_aprendiz.py) para analizar casos de baja confianza o direcciones con errores estructurales severos.
3. **Telegram Bot API**: Integrada en [telegramBot.js](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/services/telegramBot.js) y [telegram.js](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/routes/telegram.js) para notificar alertas de entregas dudosas y eventos críticos de inventario.
4. **SQLite Base de Conocimiento Local**: Archivo `backend/knowledge/learned_rules.db` manejado directamente por el Agente Aprendiz en Python para almacenar patrones corregidos.

---

## 3. Esquema de Datos y Modelo de Información

### Entidades Nucleares y Arquitectura Multi-Tenant

GeoFull V3 utiliza una arquitectura híbrida de base de datos en PostgreSQL 15:
- **Esquema `public` (SaaS Control Global)**: Almacena las entidades globales de administración de inquilinos, usuarios globales y auditoría general.
- **Esquema `tenant_<empresa_id>` (Tenant Isolation)**: Cada empresa registrada posee su propio esquema aislado con tablas independientes creadas dinámicamente vía la función SQL `create_tenant_schema(empresa_id)`.

```mermaid
erDiagram
    public_empresas ||--o{ public_usuarios : "posee"
    public_empresas ||--o{ public_auditoria_saas : "registra"
    
    tenant_pedidos }|--|| tenant_bodegas : "pertenece a"
    tenant_pedidos ||--o{ tenant_historial_sectorizaciones : "audita"
    tenant_nomina_conductores ||--o{ tenant_novedades_nomina : "acumula"
    tenant_sector_rangos_logicos }|--|| tenant_sectores : "valida contra"
```

#### Tablas en Esquema Global (`public`)
1. [`empresas`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/004_saas_multi_tenant.sql#L5-L15): Contiene `id`, `nombre`, `nit`, `activo`, `plan` (`basico`, `pro`, `enterprise`, `super`), `max_usuarios`, y `flags` (JSONB con permisos de módulos).
2. [`usuarios`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/004_saas_multi_tenant.sql#L26-L40): Contiene `id`, `email`, `nombre`, `rol` (`super_admin`, `admin_empresa`, `admin_bodega`, `operario`), `empresa_id`, `bodega_id`, `activo`, `google_id`.
3. `auditoria_saas`: Registro de auditoría global de acciones SaaS.
4. `_migrations`: Registro de ejecución de scripts SQL.

#### Tablas en Esquema Inquilino (`tenant_<empresa_id>`)
1. [`pedidos`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/006_schema_per_tenant.sql#L62-L95): Tabla central de paquetes. Campos clave: `numero_pedido`, `cliente_nombre`, `direccion_declarada`, `direccion_limpia`, `coordenadas` (`GEOGRAPHY(POINT, 4326)`), `sector_barrio`, `sector_codigo_postal`, `sector_zona`, `sector_custom1`, `sector_custom2`, `es_sectorizado`, `estado` (`importado`, `en_bodega`, `en_ruta`, `devuelto`, `extraviado`, `entregado`), `coordenadas_entrega`, `estado_verificacion`, `distancia_verificacion_mts`, `domiciliario_actual`, `bodega_id`.
2. [`sectores`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/006_schema_per_tenant.sql#L25-L35): Almacena polígonos GeoJSON. Campos: `tipo` (`barrios`, `codigos_postales`, `zonas`, `custom1`, `custom2`), `nombre`, `geometria` (`GEOGRAPHY(MULTIPOLYGON, 4326)`), `metadata` (JSONB).
3. [`sector_rangos_logicos`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/006_schema_per_tenant.sql#L40-L57): Definición de rangos numéricos de calles/carreras. Campos: `tipo_sector`, `nombre_sector`, `numero_sector`, `nombre_zona`, `calle_desde`, `calle_hasta`, `carrera_desde`, `carrera_hasta`, `codigo_voz`.
4. [`bodegas`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/006_schema_per_tenant.sql#L14-L22): Unidades físicas de almacenamiento.
5. [`domiciliarios`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/migrations/009_tenant_schema_isolation_nomina.sql) y `supervisores`: Personal operativo.
6. `historial_sectorizaciones`: Auditoría detallada de cada sectorización aplicada a un pedido.
7. `casos_ambiguos`: Registro de direcciones cuyo procesamiento por el pipeline obtuvo un nivel de confianza inferior al umbral o presentó inconsistencias.
8. `inventario` e `inventario_escaneos`: Control físico de existencias y movimientos de entrada/salida por lector QR.
9. `nomina_conductores`, `novedades_nomina`, `configuracion_nomina`: Módulo financiero de compensación a repartidores.
10. `prestamos_herramientas`: Control de activos asignados a personal en campo (chaquetas, impresoras térmicas, datáfonos).

### Lógica de Dominio Geoespacial y Logística
- **Indexación y Tipos Espaciales**:
  - Las geometrías se almacenan utilizando el tipo PostGIS `GEOGRAPHY(MULTIPOLYGON, 4326)` para sectores y `GEOGRAPHY(POINT, 4326)` para ubicaciones exactas y coordenadas de entrega.
  - Se utilizan índices espaciales **GiST** en `sectores(geometria)` y `pedidos(coordenadas)`.
- **Intersección Espacial**:
  - Para determinar el sector de un paquete con coordenadas $(lat, lng)$, se ejecuta la consulta espacial:
    ```sql
    SELECT nombre, tipo FROM tenant_X.sectores 
    WHERE ST_Contains(geometria::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326));
    ```
- **Validación Lógica por Rangos Numéricos**:
  - Cuando una dirección colombiana se parsea en calle/carrera (ej: Calle 45 # 12-34 $\rightarrow$ calle 45, carrera 12), el sistema consulta `sector_rangos_logicos` para verificar si la combinación de números cae dentro de los límites `calle_desde..calle_hasta` y `carrera_desde..carrera_hasta`.
- **Verificación de Entrega por Proximidad GPS**:
  - Al marcar un paquete como entregado en la PWA, se calcula la distancia geométrica real:
    ```sql
    SELECT ST_Distance(coordenadas, coordenadas_entrega) AS distancia_metros 
    FROM tenant_X.pedidos WHERE id = $1;
    ```
  - Si `distancia_metros > 150.0`, el estado de verificación se clasifica automáticamente como `dudosa`.

### Integridad de Datos
- **Fortalezas**: Restricciones `CHECK` en estados de pedidos, roles de usuarios y tipos de sectores; claves foráneas `ON DELETE CASCADE` entre pedidos e historial; índices GiST para acelerar consultas geoespaciales.
- **Debilidades Definitorias**:
  - Ausencia de un ORM con validación de esquema en tiempo de ejecución (se ejecutan strings SQL crudos con la librería `pg`).
  - Duplicidad de datos entre `direccion_declarada`, `direccion_limpia` y campos desnormalizados.
  - Las migraciones dinámicas de esquemas inquilinos usan interpolación directa de cadenas SQL (`quote_ident(v_schema)`), lo que requiere extremo cuidado para evitar fallos estructurales si el nombre de esquema se corrompe.

---

## 4. Catálogo de Capacidades Nucleares (System Skills)

Desglose funcional del sistema en 6 módulos principales:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CATÁLOGO DE MÓDULOS                                      │
├──────────────────────────────┬──────────────────────────────┬──────────────────────────┤
│ 1. Pipeline Multi-Agente     │ 2. Sectorización Espacial    │ 3. Máquina de Estados    │
│    (Python / FastAPI)        │    (PostGIS + Rangos)        │    & Inventario Bodega   │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────┤
│ 4. PWA Móvil Operativa       │ 5. Conciliación & Nómina     │ 6. Admin SaaS Multi-Tenant│
│    (Bodega / Domiciliarios)  │    (Liquidación Conductores) │    (Control & Auditoría) │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────┘
```

### Módulo 1: Parser & Normalizador Multi-Agente (Pipeline Python)
- **Entradas**: `direccion_original` (cadena de texto sucia), `contexto_extra` (ID de pedido, empresa).
- **Lógica de Negocio**:
  1. [**A1 Parser**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_1_parser.py): Separa la dirección en tipo de vía (Calle, Carrera, Transversal, Diagonal), número principal, prefijo/letra, número secundario, complemento (apto, piso), y extrae la "cuadra/bloque".
  2. [**A5 Validador**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_5_validador.py): Verifica coherencia de sintaxis colombiana.
  3. [**A6 Geocodificador**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_6_geocodificador.py): Consulta Google Maps API con caché local (`geocache.py`).
  4. [**A9 Validador Sector**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_9_validador_sector.py): Cruza coordenadas y números con los polígonos/rangos.
  5. [**A7 Auditor**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_7_auditor.py): Analiza la trazabilidad completa de A1 a A9, calcula la confianza global (0.0 a 1.0) y emite la decisión: `GUARDAR`, `REVISAR`, `AMBIGUO`, `CORREGIR` o `RECHAZAR`.
  6. [**A8 Sugeridor** / **Agente Aprendiz**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/agents/agent_aprendiz.py): Genera correcciones con LLM OpenAI para casos con fallos de formato y aplica reglas aprendidas históricas.
- **Salidas**: Objeto JSON estructurado con `direccion_limpia`, `lat`, `lng`, `precision`, `confianza`, `decision`, `alertas`, `sugerencias`.

### Módulo 2: Sectorización Geoespacial & Validaciones Lógicas
- **Entradas**: `coordenadas` (lat, lng), componentes numéricos de la dirección, `empresa_id`.
- **Lógica de Negocio**: Ejecuta intersección PostGIS contra `sectores` (barrios, zonas, códigos postales) y filtrado en `sector_rangos_logicos`. Si el punto espacial cae en una zona distinta al rango numérico, activa la marca `alerta_sector_logico = true`.
- **Salidas**: Asignación de campos `sector_barrio`, `sector_codigo_postal`, `sector_zona`, `sector_custom1`, `sector_custom2` y estado de alerta lógica.

### Módulo 3: Máquina de Estados de Pedidos & Gestión de Bodega
- **Entradas**: ID de pedido, escaneo de código de barras/QR, ID de bodega, ID de repartidor.
- **Lógica de Negocio**: Transición estricta de estados:
  $$\text{importado} \longrightarrow \text{en\_bodega} \longrightarrow \text{en\_ruta} \longrightarrow \begin{cases} \text{entregado} \\ \text{devuelto} \\ \text{extraviado} \end{cases}$$
  Registra estampas de tiempo (`fecha_sectorizacion`, `ultimo_escaneo`, `fecha_entrega`) y acumula `dias_en_bodega`.
- **Salidas**: Estado del pedido actualizado, inserción en `historial_sectorizaciones` y registro en `inventario_escaneos`.

### Módulo 4: PWA Móvil para Operarios y Domiciliarios
- **Entradas**: Credenciales de repartidor/operario, escaneo de cámara PWA, coordenadas GPS del dispositivo.
- **Lógica de Negocio**: Enrutamiento optimizado en cliente, confirmación de paquete en mano, captura de foto de prueba de entrega, validación de geofence de entrega ($\le 150m$).
- **Salidas**: Transición a `entregado`/`devuelto`, actualización de `coordenadas_entrega`, `distancia_verificacion_mts`, `estado_verificacion`.

### Módulo 5: Conciliación, Novedades y Nómina de Conductores
- **Entradas**: Rango de fechas, ID de domiciliario, tarifas por paquete, registros de novedades.
- **Lógica de Negocio**: Agrupa paquetes entregados/devueltos por repartidor, aplica deducciones por préstamos de herramientas o pérdidas, calcula total a pagar y genera resumen de eficiencia.
- **Salidas**: Liquidación consolidada en `nomina_conductores` y reportes en Excel/PDF.

### Módulo 6: Administración Multi-Inquilino SaaS & Auditoría
- **Entradas**: Solicitudes HTTP con header `x-empresa-id` o token JWT de Super Admin.
- **Lógica de Negocio**: Aislamiento dinámico de consultas mediante `SET search_path TO tenant_<id>, public`, gestión de ciclo de vida de empresas, asignación de límites y registro de actividad en `auditoria_saas`.
- **Salidas**: Configuración de inquilino actualizada, esquema de DB aprovisionado.

---

## 5. Auditoría de Deuda Técnica, Seguridad y Puntos de Dolor

### "God Files" / Archivos Monstruo (Monolitos Inmantenibles)

La inspección del código fuente revela una concentración crítica de lógica en un grupo reducido de archivos gigantescos ("God Files") que violan el Principio de Responsabilidad Única (SRP):

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          ARCHIVOS MONSTRUO (GOD FILES)                    │
├──────────────────────────────────────────┬─────────────┬──────────────────┤
│ Archivo                                  │ Tamaño (KB) │ Líneas aprox.    │
├──────────────────────────────────────────┼─────────────┼──────────────────┤
│ frontend/src/components/PersonalNomina.jsx│ 133.9 KB    │ ~3,100 líneas    │
│ api/src/routes/pedidos.js                │  78.8 KB    │ ~2,100 líneas    │
│ frontend/src/components/Inventario.jsx    │  79.5 KB    │ ~1,950 líneas    │
│ frontend/src/components/AdminConductores.jsx│69.5 KB    │ ~1,700 líneas    │
│ frontend/src/components/SaaSConsole.jsx  │  67.6 KB    │ ~1,600 líneas    │
│ frontend/src/components/MobileAppSuite.jsx│ 51.8 KB    │ ~1,300 líneas    │
│ backend/api/store.py                     │  46.8 KB    │ ~1,200 líneas    │
│ frontend/src/components/ControlConciliacion.jsx│45.0 KB │ ~1,100 líneas    │
│ api/src/routes/nomina.js                 │  37.8 KB    │ ~950 líneas      │
└──────────────────────────────────────────┴─────────────┴──────────────────┘
```

- [**`PersonalNomina.jsx`**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/frontend/src/components/PersonalNomina.jsx) (133.9 KB): Contiene toda la UI, lógica de cálculo, modal de préstamos, gestión de novedades, renderizado de tablas y exportación en un solo componente de React.
- [**`pedidos.js`**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/routes/pedidos.js) (78.8 KB): Concentra la importación masiva de Excel, sectorización automatizada, cambio de estados, búsquedas avanzadas y lógica de reportes en un solo archivo de rutas de Express.
- [**`store.py`**](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/api/store.py) (46.8 KB): Monolito de persistencia en Python que mezcla consultas SQL directas con `psycopg2`, manejo de transacciones y formateo de respuestas.

### Vulnerabilidades de Seguridad y Manejo de Secretos

1. **Riesgo de Bypass de Autenticación (`DEV_AUTO_LOGIN`)**:
   - En [`api/src/middleware/auth.js`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/middleware/auth.js#L15-L27), si la variable de entorno `DEV_AUTO_LOGIN` está activa, cualquier petición HTTP sin encabezado Authorization es autenticada automáticamente como `Super Admin Local` (`jchorestrepo@gmail.com`). Un error de configuración en el `.env` de producción expondría el sistema completo.
2. **Inyección Dinámica de Cadenas SQL en Conmutación de Esquema**:
   - En [`api/src/config/database.js`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/config/database.js#L54), la conmutación del esquema del inquilino se realiza mediante interpolación de cadenas:
     ```javascript
     await client.query(`SET search_path TO ${schema}, public`);
     ```
     Aunque `schema` se construye con `tenant_${empresaId}`, si `empresaId` no se valida como entero estricto antes de llegar a este punto, existe riesgo de inyección de comandos SQL a nivel de sesión PostgreSQL.
3. **Manejo Laxo de Secretos en `.env.example` y Fallbacks Hardcodados**:
   - Múltiples módulos contienen fallbacks por defecto para llaves de cifrado y contraseñas de DB (ej: `'geofull_jwt_secret_dev_123'`, `'postgresql://geofull:geofull_dev@localhost:5432/geofull'`).
4. **Falta de Rate Limiting en Endpoints Sensibles**:
   - La API Express no cuenta con *rate limiter* (ej. `express-rate-limit`) en rutas críticas como `/api/auth/login`, `/api/pedidos/sectorizar-lote` o `/api/telegram/webhook`.

### Puntos Únicos de Falla (SPOF - Single Points of Failure)

1. **Dependencia Sincronía Bloqueante de Google Maps API**:
   - El pipeline en FastAPI enruta las peticiones de geocodificación directamente a Google Maps de forma sincrónica durante el procesamiento en lote. Si la API de Google alcanza cuotas, sufre latencia o falla la red, todo el lote de importación se detiene abruptamente.
2. **Divergencia y Cadenas de Persistencia Duplicadas (SQLite vs. PostgreSQL)**:
   - El Agente Aprendiz utiliza una base de datos SQLite independiente ([`learned_rules.db`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/knowledge/geocache.py)), mientras que el resto de la aplicación utiliza PostgreSQL. Esto impide la sincronización en tiempo real de reglas aprendidas entre múltiples réplicas del contenedor `pipeline`.
3. **Contenedor PostgreSQL Único sin Réplica**:
   - La arquitectura desplegada en Docker Compose depende de un solo nodo de base de datos `geofull-db` con volumen local `pgdata`, sin respaldo automatizado en tiempo real o réplica de lectura.

### Bloqueos de Rendimiento (Performance Bottlenecks)

1. **Overhead Extremo en Conexiones Multi-Tenant (`queryTenant`)**:
   - En [`database.js`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/config/database.js#L47-L66), cada consulta individual a un inquilino solicita un cliente del pool, ejecuta `SET search_path TO tenant_X, public`, realiza la consulta, resetea el `search_path` a `public` y libera el cliente. Para operaciones en lote de 1,000 pedidos, esto genera 3,000 ida y vuelta (*roundtrips*) de comandos SQL de configuración adicionales a la BD.
2. **Carga y Parsing de Excel de 200MB en Memoria**:
   - En [`server.js`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/api/src/server.js#L28-L29), el servidor configura `express.json({ limit: '200mb' })` y lee los archivos subidos mediante `xlsx.read` de forma sincrónica bloqueando el hilo de eventos (*Event Loop*) de Node.js.
3. **Ejecución Secuencial del Pipeline por Dirección**:
   - El orquestador de Python ([`orchestrator.py`](file:///run/media/pc/Datos1/Codigo/GeoFull-V3/backend/orchestrator.py#L100-L140)) procesa las direcciones de un lote una por una pasando secuencialmente por A1 $\rightarrow$ A5 $\rightarrow$ A6 $\rightarrow$ A9 $\rightarrow$ A7, en lugar de paralelizar llamadas de red o utilizar una cola de tareas asíncronas (*worker pool*).

---

## 6. Especificación para la Versión 2.0 (Rebuild Blueprint)

### Contratos de Datos No Negociables (API Contracts)

Para garantizar la compatibilidad con clientes existentes, PWA móvil e integraciones externas, la versión 2.0 **DEBE mantener intactos** los siguientes contratos de interfaz de datos:

#### 1. Formato JSON Estándar de Respuesta de Geocodificación y Sectorización
```json
{
  "exitoso": true,
  "decision": "GUARDAR",
  "direccion": "CARRERA 43A # 18-101",
  "direccion_original": "cra 43 a #18-101 piso 2",
  "direccion_cuadra": "CARRERA 43A # 18-00",
  "coordenadas": {
    "lat": 6.208912,
    "lng": -75.567841
  },
  "precision": "ROOFTOP",
  "confianza": 0.98,
  "sectores": {
    "barrio": "El Poblado",
    "codigo_postal": "050021",
    "zona": "Zona Sur",
    "custom1": "Ruta 4",
    "custom2": null
  },
  "alertas": [],
  "sugerencias": []
}
```

#### 2. Transiciones Validadas en Máquina de Estados de Pedidos
$$\text{importado} \xrightarrow{\text{Escaneo Bodega}} \text{en\_bodega} \xrightarrow{\text{Asignación Ruta}} \text{en\_ruta} \xrightarrow{\text{Confirmación PWA}} \begin{cases} \text{entregado} \\ \text{devuelto} \\ \text{extraviado} \end{cases}$$

#### 3. Formato GeoJSON Estándar para Capas de Sectores Espaciales
El backend debe aceptar e importar polígonos bajo el estándar WGS84 (EPSG:4326):
```json
{
  "type": "Feature",
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [...]
  },
  "properties": {
    "nombre": "Zona Industrial Norte",
    "tipo": "zonas"
  }
}
```

### Elementos y Código a Eliminar

1. **Scripts Sueltos y Legacy en la Raíz del Proyecto**:
   - Eliminar `analisis_zonas.py`, `analisis_fuera_zona.py`, `exportar_alertas.py`, `check_data.py`, `clean_data.py`, `detect_format.py`, `inspect_excel.py`, `sincronizar_db.py`, `test_*.py`.
2. **Archivos de Configuración Duplicados**:
   - Consolidar la configuración de reverse proxy eliminando el directorio `traefik/` y estandarizando en Nginx de producción.
3. **Persistencia Híbrida en SQLite**:
   - Eliminar la dependencia de `sqlite3` y `learned_rules.db` en el backend Python. Todas las reglas aprendidas deben residir en la base de datos PostgreSQL principal (`public.reglas_aprendidas` o `tenant_X.reglas_aprendidas`).
4. **Librerías de Parsing Sincrónico en Node.js**:
   - Reemplazar `xlsx` por un parser por streams o delegar el procesamiento de hojas masivas a un worker secundario en Python/Rust.

### Recomendación de Arquitectura Limpia (V2.0 Core Architecture)

La reconstrucción del sistema debe guiarse por una **Arquitectura Limpia Modular Basada en Capacidades (Feature-Sliced Architecture)** con separación estricta de responsabilidades:

```
src/
├── core/                       # Kernel de Dominio (Pure Business Logic)
│   ├── domain/                 # Entidades, Value Objects, Interfaces
│   └── use-cases/              # Casos de Uso puros (Normalizar, Sectorizar, Liquidar)
├── modules/                    # Módulos Funcionales
│   ├── address-normalizer/     # Pipeline de Agentes A1-A9
│   ├── spatial-sectorizer/     # Consultas PostGIS + Rangos Lógicos
│   ├── package-lifecycle/      # Máquina de estados + Inventario Bodega
│   ├── driver-settlement/      # Nómina, Novedades y Liquidación
│   └── saas-admin/             # Tenants, RBAC y Auditoría
├── infrastructure/             # Adaptadores de Entrada/Salida
│   ├── database/               # ORM (Prisma/Drizzle), Pool de Postgres, Migraciones
│   ├── external-apis/          # Clientes HTTP (Google Maps, OpenAI, Telegram)
│   └── http/                   # Controllers, Route Handlers, Middlewares (Fastify / NestJS)
└── shared/                     # DTOs, Schemas (Zod / Pydantic V2), Logger, Utils
```

#### Principios Clave para GeoFull V2.0:
1. **Unificación del Backend**:
   - Migrar la API Node.js/Express a **TypeScript con Fastify o NestJS**, utilizando **Drizzle ORM** o **Prisma** con soporte nativo de PostGIS y multi-esquema.
   - Mantener el microservicio de Python exclusivamente como un **Worker de IA de Alto Rendimiento (FastAPI)** enfocado únicamente en la ejecución del pipeline A1-A9 paralelizado con `asyncio` y `httpx`.
2. **Validación Estricta en Frontera (Zero Trust Payload)**:
   - Implementar validación de entradas HTTP con **Zod** (en TypeScript) y **Pydantic V2** (en Python) antes de que cualquier dato ingrese a la capa de aplicación o base de datos.
3. **Optimización Multi-Tenant por Pool de Esquemas**:
   - Reemplazar el `SET search_path` dinámico por consulta con un middleware de resolución de tenant que gestione pools de conexiones dedicados por esquema o utilice **Row-Level Security (RLS)** nativo de PostgreSQL para aislamiento garantizado con costo cero de reconexión.
4. **Procesamiento de Lotes Asíncrono Basado en Eventos**:
   - Implementar una cola de tareas asíncronas con **Redis + BullMQ** (Node.js) o **Celery / ARQ** (Python). La subida de un Excel de 10,000 paquetes responderá inmediatamente un `Job ID` `202 Accepted`, procesando la geocodificación en segundo plano y notificando el progreso vía WebSockets / Server-Sent Events (SSE).

---

## 3 Hallazgos Más Críticos Detectados en la Auditoría

> [!CAUTION]
> **1. bypass Potencial de Seguridad por Autenticación Dev (`DEV_AUTO_LOGIN`)**:  
> La presencia de la bandera `DEV_AUTO_LOGIN` en el middleware de autenticación (`api/src/middleware/auth.js`) permite la suplantación de la cuenta de `Super Admin` en peticiones sin token si la variable de entorno se habilita inadvertidamente en producción. Es imperativo eliminar este mecanismo en favor de tokens JWT de prueba o ambientes de testing aislados.

> [!WARNING]
> **2. Cuello de Botella y Sobrecarga en la Conmutación de Inquilinos (`queryTenant`)**:  
> La implementación actual de multi-tenancy (`api/src/config/database.js`) ejecuta `SET search_path TO tenant_X, public` y su posterior reseteo en cada consulta SQL a la base de datos. Esto triplica los ida y vuelta (*roundtrips*) a PostgreSQL por cada operación, generando una degradación severa del rendimiento y latencia bajo cargas concurrentes o procesamiento masivo de paquetes.

> [!IMPORTANT]
> **3. Deuda Técnica por Archivos Monstruo ("God Files") y Falta de Capa de Dominio**:  
> Componentes como `PersonalNomina.jsx` (~134 KB / ~3,100 líneas) en el frontend y `pedidos.js` (~78.8 KB) en el backend acumulan UI, lógica de negocio, validaciones y acceso a datos en un solo bloque. La ausencia de interfaces tipadas, validación de esquemas en frontera y separación de capas dificulta la mantenibilidad, extensibilidad y ejecución de pruebas unitarias automatizadas.

---
*Fin del Documento Maestro de Auditoría y Especificación Inversa.*

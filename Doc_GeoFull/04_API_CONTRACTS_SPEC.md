# GeoFull V4 — 04. Especificación de Contratos API REST

> **Propósito**: Definir los contratos HTTP/REST del backend único FastAPI de GeoFull V4, incluyendo autenticación, la API SaaS Admin, los endpoints operativos del día a día (pedidos, sectorización, conciliación, nómina), la geocodificación local y la API utilitaria móvil.

---

## 1. Convenciones Globales

- **Formato**: JSON (`Content-Type: application/json`).
- **Autenticación**: Bearer Token JWT en header `Authorization: Bearer <token>`.
- **Tenant Resolution**: El `tenant_id` se extrae del JWT. Todas las queries aplican RLS automáticamente.

---

## 2. Autenticación (`/api/auth`)

#### `POST /api/auth/login`
```json
// Request
{ "email": "usuario@empresa.com", "password": "Password123!" }
// Response 200
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": { "id": "u-123", "nombre": "Juan", "email": "...", "rol": "admin_empresa", "empresa_id": "emp_99a8b1" }
}
```

---

## 3. API SaaS Admin (Solo `super_admin`)

#### `GET /api/saas/empresas` — Lista todos los tenants
#### `POST /api/saas/empresas` — Registra nueva empresa

#### `GET /api/saas/datasets-ciudades` — Lista datasets catastrales instalados
```json
[{ "id": "ds_medellin", "ciudad": "MEDELLIN", "total_predios": 518116, "total_ejes": 42696, "activo": true }]
```

#### `POST /api/saas/datasets-ciudades/subir` — Sube GPKG de nueva ciudad
- **Content-Type**: `multipart/form-data` (`file`, `ciudad`, `departamento`).
- El backend ejecuta `ogr2ogr` con `-t_srs EPSG:4326` para reprojectar y cargar en PostGIS.

#### `PUT /api/saas/empresas/:id/cobertura` — Asigna ciudades habilitadas a un tenant
```json
{ "ciudades_habilitadas": ["MEDELLIN", "RIONEGRO"] }
```

#### `GET /api/saas/metricas-globales` — Métricas de consumo de la plataforma

---

## 4. Endpoints Operativos (Tenant — JWT Required)

### 4.1 Pedidos

#### `POST /api/pedidos/importar` — Importa masivamente pedidos desde Excel/CSV
- **Content-Type**: `multipart/form-data` (`file`).
- Procesa cada dirección a través del pipeline de 3 etapas (normalización → geocodificación local → sectorización).

#### `GET /api/pedidos` — Lista pedidos del tenant
- **Query Params**: `estado`, `zona_id`, `fecha_desde`, `fecha_hasta`, `limit`, `offset`.

#### `GET /api/pedidos/:id` — Detalle de un pedido (incluye línea de tiempo de procesamiento)

#### `PUT /api/pedidos/:id/recalcular-google` — Recalcula coordenadas con Google Maps API
- Invoca la API de Google Maps para obtener nuevas coordenadas y re-sectoriza el pedido.

### 4.2 Zonas Personalizadas

#### `POST /api/zonas/importar` — Sube GeoJSON de zonas personalizadas
- Valida que los polígonos no se sobrepongan con los existentes del tenant (`ST_Intersects` excluyendo `ST_Touches`).

#### `GET /api/zonas` — Lista zonas activas del tenant

### 4.3 Sectorización

#### `POST /api/sectorizar` — Ejecuta la sectorización de un lote de pedidos
- Cruza las coordenadas de los pedidos pendientes contra todas las zonas activas del tenant.
- Aplica validación de rangos lógicos.
- Marca pedidos sin zona como `FUERA_DE_ZONA`.

### 4.4 Conciliación de Entregas (Control Diario)

#### `POST /api/conciliacion/subir-entregas` — Sube archivo diario de entregas
- Recibe un Excel/CSV con las guías entregadas en el día por cada domiciliario.
- Compara contra los pedidos asignados en el sistema.
- Cambia el estado de los pedidos a `ENTREGADO` y los retira del inventario.
- Genera el registro de `conciliaciones_diarias`.

#### `GET /api/conciliacion/resumen-dia?fecha=2026-09-15` — Resumen de un día

### 4.5 Liquidación de Nómina (Quincenal o Período Personalizado)

#### `POST /api/nomina/liquidar` — Genera liquidación para un período
```json
{ "fecha_inicio": "2026-09-01", "fecha_fin": "2026-09-15" }
```
- Consolida todas las conciliaciones diarias del período para cada domiciliario.
- Calcula `monto_bruto` = `total_paquetes × tarifa_paquete`.
- Descuenta `adelantos_prestamos` aprobados pendientes de descontar.
- El usuario puede re-subir el documento completo de la quincena para detectar discrepancias acumuladas.

#### `GET /api/nomina/liquidaciones` — Lista liquidaciones del tenant

### 4.6 Inventario QR

#### `POST /api/inventario/escanear` — Registra escaneo de código QR
```json
{ "codigo_qr": "G-100234", "accion": "RECIBIDO" }
```

### 4.7 Historial / Rastreo

#### `GET /api/historial/guia/:numero_guia` — Trazabilidad completa de una guía
- Retorna la línea de tiempo: dirección original → normalización → nivel de geocodificación → zona asignada → escaneos QR → estado de entrega.

---

## 5. API Utilitaria Móvil para Domiciliarios (`/api/mobile`)

> **⚠️ NO es una app de entregas ni ruteador**. Es utilidad administrativa y de verificación física.

#### `GET /api/mobile/domiciliario/resumen-dia` — Paquetes asignados del día
#### `POST /api/mobile/domiciliario/reportar-discrepancia` — Notifica conteo diferente
#### `POST /api/mobile/domiciliario/subir-documento` — Sube foto/comprobante

---

## 6. Geocodificación Local (`/api/geocode`)

#### `POST /api/geocode` — Geocodifica una dirección
```json
// Request
{ "direccion": "calle 39 # 35-3", "ciudad": "MEDELLIN" }
// Response 200
{
  "exito": true,
  "status": "EXACT_MATCH",
  "precision_metros": "2",
  "score": 100,
  "latitud": 6.234512,
  "longitud": -75.567812,
  "direccion_normalizada": "CL 39 35-03"
}
```

#### `POST /api/geocode/batch` — Geocodifica un lote de direcciones
#### `POST /api/geocode/flexible` — Búsqueda relajada de candidatos cercanos

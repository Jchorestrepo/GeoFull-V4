# GeoFull V4 — 06. Especificación de DevOps, Docker y Despliegue CI/CD

> **Propósito**: Especificar la configuración de contenedores Docker para la **arquitectura simplificada de GeoFull V4** (3 servicios: db, backend, frontend), GitHub Actions CI/CD y migraciones SQL automatizadas.

---

## 1. Orquestación de Contenedores Docker Compose (V4 — 3 Servicios)

GeoFull V4 elimina la separación de backends y el servicio Redis. El `docker-compose.yml` se reduce a **3 servicios**:

```yaml
version: '3.8'

services:
  db:
    image: postgis/postgis:16-3.4
    container_name: geofull-db
    environment:
      POSTGRES_DB: geofull
      POSTGRES_USER: geofull
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    container_name: geofull-backend
    ports:
      - "8001:8001"
    depends_on:
      - db
    environment:
      DATABASE_HOST: db
      DATABASE_PORT: 5432
      DATABASE_NAME: geofull
      DATABASE_USER: geofull
      DATABASE_PASSWORD: ${DB_PASSWORD}

  frontend:
    build: ./frontend
    container_name: geofull-frontend
    ports:
      - "5173:80"

volumes:
  postgres_data:
```

### Cambios vs. GeoFull V3:
| Aspecto | V3 (5 servicios) | V4 (3 servicios) |
|---|---|---|
| Backend Node.js Express (:3001) | ✅ Servicio separado `api` | ❌ **Eliminado** |
| Backend Python FastAPI (:8001) | ✅ Servicio separado `pipeline` | ✅ **Backend Único** (incluye API + geocodificación) |
| Redis | ✅ Servicio separado | ❌ **Eliminado** |
| PostgreSQL + PostGIS | ✅ `postgis/postgis:15-3.3` | ✅ `postgis/postgis:16-3.4` |
| Frontend React | ✅ Nginx :5173 | ✅ Nginx :5173 |

---

## 2. Pipeline de Despliegue Automático (GitHub Actions)

El archivo `.github/workflows/deploy.yml` ejecuta el despliegue ante cada `git push` a `main`:

```
[git push origin main]
         │
         ▼
[GitHub Actions Job: deploy]
         │
         ├─► 1. SSH al VPS mediante appleboy/ssh-action
         ├─► 2. Sincronización de código (git fetch + git reset --hard)
         ├─► 3. MIGRACIONES SQL AUTOMÁTICAS (bash scripts/run-migrations.sh)
         ├─► 4. Recarga de Nginx (nginx -t && nginx -s reload)
         ├─► 5. Reconstrucción de imágenes Docker (docker compose build)
         ├─► 6. Reinicio de servicios (docker compose up -d)
         ├─► 7. Importación de datos GPKG si tablas vacías (ogr2ogr con -t_srs EPSG:4326)
         └─► 8. Health Checks (GET /health en :8001, GET / en :5173)
```

---

## 3. Gestión de Migraciones SQL

Prohibido ejecutar comandos manuales en la VPS. Todo cambio DDL se maneja con scripts SQL idempotentes numerados:

```
backend/migrations/
├── 001_initial_schema.sql
├── 002_create_nomenclatura_indexes.sql
├── 003_create_tenant_tables_rls.sql
├── 004_conciliacion_nomina_tables.sql
└── ...
```

El ejecutor de migraciones (`scripts/run-migrations.sh`) aplica cada script pendiente dentro de una transacción y lo registra en `public.schema_migrations`.

---

## 4. Importación de Datos Catastrales GPKG

La carga de los archivos GPKG se realiza con `ogr2ogr` (incluido en la imagen PostGIS Docker):

```bash
# Importar nomenclatura domiciliaria reproyectando a WGS84
ogr2ogr -f PostgreSQL \
  "PG:host=db port=5432 dbname=geofull user=geofull password=$DB_PASSWORD" \
  /data/gpkg/nomenclatura_domiciliaria.gpkg \
  -t_srs EPSG:4326 \
  -nln nomenclatura_domiciliaria \
  -overwrite

# Importar ejes de nomenclatura
ogr2ogr -f PostgreSQL \
  "PG:host=db port=5432 dbname=geofull user=geofull password=$DB_PASSWORD" \
  /data/gpkg/eje_de_nomenclatura.gpkg \
  -t_srs EPSG:4326 \
  -nln eje_de_nomenclatura \
  -overwrite
```

---

## 5. Reverse Proxy Nginx & SSL

- `https://dx.geofull.space` → Frontend React (:5173 / :80)
- `https://api.dx.geofull.space` → Backend Único FastAPI (:8001)

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import admin_engine
from app.api import tenants, zones, orders, reconciliation, team, maintenance, auth, datasets, tracking, station


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ejecuta migraciones SQL automáticas al arrancar la aplicación usando admin_engine (superuser)."""
    migrations_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "migrations"))
    if os.path.exists(migrations_dir):
        sql_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".sql")])
        for sql_file in sql_files:
            file_path = os.path.join(migrations_dir, sql_file)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    sql_content = f.read()
                if not sql_content.strip():
                    continue
                # Cada archivo en su propia transacción usando admin_engine: un fallo no aborta los siguientes.
                async with admin_engine.connect() as conn:
                    raw = await conn.get_raw_connection()
                    asyncpg_conn = raw.driver_connection
                    async with asyncpg_conn.transaction():
                        await asyncpg_conn.execute(sql_content)
                print(f"Migración verificada/aplicada: {sql_file}")
            except Exception as e:
                print(f"Aviso al aplicar migración {sql_file}: {e}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    lifespan=lifespan
)

# Orígenes CORS permitidos para la aplicación
cors_origins = [
    "http://localhost:8080",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:5173",
    f"https://{settings.PUBLIC_DOMAIN}",
    f"http://{settings.PUBLIC_DOMAIN}",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if not settings.is_development else ["*"],
    allow_credentials=True if not settings.is_development else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar Routers API
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(tenants.router, prefix=settings.API_V1_STR)
app.include_router(datasets.router, prefix=settings.API_V1_STR)
app.include_router(zones.router, prefix=settings.API_V1_STR)
app.include_router(orders.router, prefix=settings.API_V1_STR)
app.include_router(station.router, prefix=settings.API_V1_STR)
app.include_router(reconciliation.router, prefix=settings.API_V1_STR)
app.include_router(tracking.router, prefix=settings.API_V1_STR)
app.include_router(team.router, prefix=settings.API_V1_STR)
app.include_router(maintenance.router, prefix=settings.API_V1_STR)




@app.get("/health", tags=["Health Check"])
async def health_check():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "database": "PostgreSQL + PostGIS (RLS Enabled)"
    }

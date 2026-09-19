import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine
from app.api import tenants, zones, orders, reconciliation, team, maintenance, auth, datasets


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ejecuta migraciones SQL automáticas al arrancar la aplicación."""
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
                # Cada archivo en su propia transacción: un fallo no aborta los siguientes.
                # Se usa la conexión asyncpg cruda porque text() crea un prepared statement,
                # que no admite varios comandos en un mismo archivo.
                async with engine.connect() as conn:
                    raw = await conn.get_raw_connection()
                    asyncpg_conn = raw.driver_connection
                    async with asyncpg_conn.transaction():
                        await asyncpg_conn.execute(sql_content)
                print(f"Migración aplicada: {sql_file}")
            except Exception as e:
                print(f"Aviso al aplicar migración {sql_file}: {e}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    lifespan=lifespan
)

# Middleware CORS para comunicación con el Frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar Routers API
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(tenants.router, prefix=settings.API_V1_STR)
app.include_router(datasets.router, prefix=settings.API_V1_STR)
app.include_router(zones.router, prefix=settings.API_V1_STR)
app.include_router(orders.router, prefix=settings.API_V1_STR)
app.include_router(reconciliation.router, prefix=settings.API_V1_STR)
app.include_router(team.router, prefix=settings.API_V1_STR)
app.include_router(maintenance.router, prefix=settings.API_V1_STR)




@app.get("/health", tags=["Health Check"])
async def health_check():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "database": "PostgreSQL + PostGIS (RLS Enabled)"
    }

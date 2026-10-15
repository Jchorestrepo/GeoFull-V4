from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.sql import text
from app.core.config import settings

# Engine principal para la aplicación (usuario geofull_app con RLS estricto)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_size=20,
    max_overflow=10
)

# Engine administrativo para migraciones DDL (usuario postgres superuser)
admin_engine = create_async_engine(
    settings.ADMIN_DATABASE_URL,
    echo=False,
    future=True,
    pool_size=5,
    max_overflow=5
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)


async def get_db_session(tenant_id: Optional[str] = None) -> AsyncGenerator[AsyncSession, None]:
    """
    Proporciona una sesión asíncrona de PostgreSQL/PostGIS.
    Si se especifica tenant_id, establece la variable RLS `app.current_tenant_id`
    con limpieza garantizada al retornar la conexión al pool.
    """
    async with AsyncSessionLocal() as session:
        if tenant_id:
            await session.execute(
                text("SELECT set_config('app.current_tenant_id', :tenant_id, false)"),
                {"tenant_id": tenant_id}
            )
        try:
            yield session
        finally:
            if tenant_id:
                try:
                    await session.execute(text("SELECT set_config('app.current_tenant_id', '', false)"))
                except Exception:
                    pass
            await session.close()


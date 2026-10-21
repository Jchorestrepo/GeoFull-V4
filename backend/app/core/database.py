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
    Siempre fija `app.current_tenant_id` (vacío si no hay tenant) para que la
    conexión del pool no herede el contexto RLS de una request anterior.
    Al terminar, limpia la variable y confirma el reset (un reset sin commit
    se revierte al cerrar la sesión y el valor queda pegado en el pool).
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, false)"),
            {"tenant_id": tenant_id or ""}
        )
        try:
            yield session
        finally:
            try:
                await session.rollback()
                await session.execute(text("SELECT set_config('app.current_tenant_id', '', false)"))
                await session.commit()
            except Exception:
                pass
            await session.close()


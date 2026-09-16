from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.sql import text
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_size=20,
    max_overflow=10
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
    Si se especifica tenant_id, establece la variable RLS `app.current_tenant_id`.
    """
    async with AsyncSessionLocal() as session:
        if tenant_id:
            await session.execute(
                text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
                {"tenant_id": tenant_id}
            )
        try:
            yield session
        finally:
            await session.close()

from dataclasses import dataclass
from typing import Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text
from app.geocoder.normalizer import NormalizedAddress


@dataclass
class SectorizationResult:
    zona_id: Optional[uuid.UUID]
    zona_nombre: Optional[str]
    estado: str
    alerta_rango_logico: bool
    detalle_alerta_rango: Optional[str]


async def sectorize_point(
    session: AsyncSession,
    tenant_id: str,
    latitud: Optional[float],
    longitud: Optional[float],
    normalized: Optional[NormalizedAddress]
) -> SectorizationResult:
    """
    Evalúa si la coordenada cae dentro de alguna Zona GeoJSON activa del tenant (ST_Contains).
    """
    if not latitud or not longitud:
        return SectorizationResult(
            zona_id=None, zona_nombre=None,
            estado="REQUIERE_REVISIÓN",
            alerta_rango_logico=False, detalle_alerta_rango=None
        )

    # 1. Consulta ST_Contains en PostGIS
    query = text("""
        SELECT id, nombre_zona
        FROM zonas_personalizadas
        WHERE tenant_id = :tenant_id AND activa = true
          AND ST_Contains(geom, ST_SetSRID(ST_Point(:lon, :lat), 4326))
        LIMIT 1
    """)
    res = await session.execute(query, {
        "tenant_id": tenant_id,
        "lat": latitud,
        "lon": longitud
    })
    r = res.first()

    if not r:
        return SectorizationResult(
            zona_id=None, zona_nombre=None,
            estado="FUERA_DE_ZONA",
            alerta_rango_logico=False, detalle_alerta_rango="Coordenada fuera de los polígonos del tenant"
        )

    return SectorizationResult(
        zona_id=r.id,
        zona_nombre=r.nombre_zona,
        estado="SECTORIZADO",
        alerta_rango_logico=False,
        detalle_alerta_rango=None
    )

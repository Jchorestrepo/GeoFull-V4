"""
Helper de auditoría y trazabilidad de pedidos para GeoFull V4.
Permite registrar eventos en la tabla `pedidos_historial`.
"""
import uuid
import json
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def registrar_historial_evento(
    session: AsyncSession,
    tenant_id: str,
    pedido_id: uuid.UUID,
    guia: str,
    tipo_evento: str,
    descripcion: str,
    estado_anterior: Optional[str] = None,
    estado_nuevo: Optional[str] = None,
    usuario_id: Optional[uuid.UUID] = None,
    usuario_nombre: Optional[str] = "Sistema",
    detalles: Optional[Dict[str, Any]] = None
) -> None:
    """
    Inserta un evento cronológico en pedidos_historial.
    Falla de manera silenciosa/segura para no abortar transacciones críticas de negocio.
    """
    try:
        query = text("""
            INSERT INTO pedidos_historial (
                tenant_id, pedido_id, guia, tipo_evento, descripcion,
                estado_anterior, estado_nuevo, usuario_id, usuario_nombre, detalles
            ) VALUES (
                :tenant_id, :pedido_id, :guia, :tipo_evento, :descripcion,
                :estado_anterior, :estado_nuevo, :usuario_id, :usuario_nombre, CAST(:detalles AS JSONB)
            )
        """)
        await session.execute(query, {
            "tenant_id": tenant_id,
            "pedido_id": pedido_id,
            "guia": guia,
            "tipo_evento": tipo_evento,
            "descripcion": descripcion,
            "estado_anterior": estado_anterior,
            "estado_nuevo": estado_nuevo,
            "usuario_id": usuario_id,
            "usuario_nombre": usuario_nombre or "Sistema",
            "detalles": json.dumps(detalles or {}, ensure_ascii=False)
        })
    except Exception as exc:
        print(f"[AUDITORIA ERROR] No se pudo registrar historial para {guia}: {exc}")

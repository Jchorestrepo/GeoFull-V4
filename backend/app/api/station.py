from typing import Optional
import uuid
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from app.core.dependencies import get_current_user, get_tenant_id
from app.core.database import get_db_session
from app.core.audit import registrar_historial_evento

router = APIRouter(prefix="/orders", tags=["Pedidos & Geocodificación Operativa"])


class ScanStationRequest(BaseModel):
    guia: str


@router.post("/scan-station")
async def scan_package_station(
    req: ScanStationRequest,
    current_user: dict = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id)
):
    """
    Registra el evento físico de escaneo en la estación de Sectorización (pantalla Sectorización).
    Indica qué operario tomó el paquete físicamente, consultó la zona y lo clasificó.
    """
    guia_clean = req.guia.strip().upper()
    if not guia_clean:
        raise HTTPException(status_code=400, detail="Número de guía inválido")

    async for session in get_db_session(tenant_id=tenant_id):
        # 1. Buscar pedido
        q = text("""
            SELECT id, guia, cliente, direccion_original, direccion_limpia, 
                   zona_id, zona_nombre, estado, nivel_precision
            FROM pedidos
            WHERE tenant_id = :tenant_id AND (guia = :guia OR LOWER(guia) = LOWER(:guia))
            LIMIT 1
        """)
        res = await session.execute(q, {"tenant_id": tenant_id, "guia": guia_clean})
        pedido = res.first()

        if not pedido:
            raise HTTPException(status_code=404, detail=f"La guía '{guia_clean}' no existe en el sistema.")

        user_name = current_user.get("nombre") or current_user.get("email") or "Operador de Sectorización"
        zona_text = pedido.zona_nombre or "Fuera de Zona"

        # 2. Registrar evento físico de escaneo en estación de sectorización
        descripcion = f"【Escaneo Sectorización】 Paquete manipulado y clasificado en 【{zona_text}】 por operador 【{user_name}】."
        await registrar_historial_evento(
            session=session,
            tenant_id=tenant_id,
            pedido_id=pedido.id,
            guia=pedido.guia,
            tipo_evento="SECTORIZACION_ESCANEO",
            descripcion=descripcion,
            estado_anterior=pedido.estado,
            estado_nuevo=pedido.estado,
            usuario_id=current_user.get("id") if current_user.get("id") else None,
            usuario_nombre=user_name,
            detalles={
                "zona_nombre": pedido.zona_nombre,
                "direccion": pedido.direccion_original,
                "estacion": "Pantalla Sectorización / Escáner Código de Barras"
            }
        )
        await session.commit()

        return {
            "status": "ok",
            "pedido_id": pedido.id,
            "guia": pedido.guia,
            "zona_nombre": pedido.zona_nombre,
            "cliente": pedido.cliente,
            "operador": user_name,
            "mensaje": f"Escaneo registrado para {pedido.guia} por {user_name}"
        }

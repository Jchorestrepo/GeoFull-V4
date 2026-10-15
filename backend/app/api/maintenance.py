from typing import Optional
from fastapi import APIRouter, HTTPException, Header, status, Depends
from pydantic import BaseModel
from sqlalchemy import text
from app.core.database import get_db_session
from app.core.dependencies import get_current_user, get_tenant_id

router = APIRouter(prefix="/maintenance", tags=["Mantenimiento y Purga de Datos"])


def require_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    rol = current_user.get("rol", "")
    if rol not in ("admin_empresa", "super_admin") and not current_user.get("is_impersonating"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido. Se requieren permisos de Administrador de Empresa o Super Admin para realizar purgas."
        )
    return current_user


class PurgeConfirmRequest(BaseModel):
    confirmation: str  # Debe ser exactamente "ELIMINAR TODO" o "ELIMINAR TODO"


@router.post("/purge-orders")
async def purge_orders(
    admin_user: dict = Depends(require_admin_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Elimina únicamente la totalidad de los pedidos cargados en la empresa (Requiere rol Admin)."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM pedidos WHERE tenant_id = :tenant_id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        await session.commit()
        return {
            "status": "ok",
            "mensaje": f"Se han eliminado {res.rowcount} pedidos de la empresa ({x_tenant_id}).",
            "eliminados": res.rowcount
        }


@router.post("/purge-zones")
async def purge_zones(
    admin_user: dict = Depends(require_admin_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Elimina únicamente todas las zonas personalizadas de la empresa (Requiere rol Admin)."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM zonas_personalizadas WHERE tenant_id = :tenant_id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        await session.commit()
        return {
            "status": "ok",
            "mensaje": f"Se han eliminado {res.rowcount} zonas GeoJSON de la empresa ({x_tenant_id}).",
            "eliminados": res.rowcount
        }


@router.post("/purge-drivers")
async def purge_drivers(
    admin_user: dict = Depends(require_admin_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Elimina únicamente la nómina de conductores de la empresa (Requiere rol Admin)."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM personal_conductores WHERE tenant_id = :tenant_id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        await session.commit()
        return {
            "status": "ok",
            "mensaje": f"Se han eliminado {res.rowcount} registros de conductores de la empresa ({x_tenant_id}).",
            "eliminados": res.rowcount
        }


@router.post("/purge-all")
async def purge_all_data(
    req: PurgeConfirmRequest,
    admin_user: dict = Depends(require_admin_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Acción destructiva: Purga al 100% todos los datos operacionales de la empresa activa."""
    if req.confirmation.strip().upper() not in ("ELIMINAR TODO", "CONFIRMAR"):
        raise HTTPException(
            status_code=400,
            detail="Frase de confirmación incorrecta. Debe escribir exactamente 'ELIMINAR TODO' para confirmar."
        )

    async for session in get_db_session(tenant_id=x_tenant_id):
        try:
            p_res = await session.execute(text("DELETE FROM pedidos WHERE tenant_id = :t"), {"t": x_tenant_id})
            z_res = await session.execute(text("DELETE FROM zonas_personalizadas WHERE tenant_id = :t"), {"t": x_tenant_id})
            d_res = await session.execute(text("DELETE FROM personal_conductores WHERE tenant_id = :t"), {"t": x_tenant_id})
            c_res = await session.execute(text("DELETE FROM conciliaciones_diarias WHERE tenant_id = :t"), {"t": x_tenant_id})
            l_res = await session.execute(text("DELETE FROM liquidaciones WHERE tenant_id = :t"), {"t": x_tenant_id})
            a_res = await session.execute(text("DELETE FROM adelantos_prestamos WHERE tenant_id = :t"), {"t": x_tenant_id})

            await session.commit()

            total_eliminados = p_res.rowcount + z_res.rowcount + d_res.rowcount + c_res.rowcount + l_res.rowcount + a_res.rowcount

            return {
                "status": "ok",
                "mensaje": f"Ambiente de la empresa ({x_tenant_id}) limpiado exitosamente.",
                "detalles": {
                    "pedidos_eliminados": p_res.rowcount,
                    "zonas_eliminadas": z_res.rowcount,
                    "conductores_eliminados": d_res.rowcount,
                    "conciliaciones_eliminadas": c_res.rowcount,
                    "liquidaciones_eliminadas": l_res.rowcount,
                    "prestamos_eliminados": a_res.rowcount,
                    "total": total_eliminados
                }
            }
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Error durante la purga del ambiente: {str(e)}"
            )

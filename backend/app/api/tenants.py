from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Header, status, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from app.core.database import get_db_session
from app.core.security import decode_access_token

router = APIRouter(prefix="/tenants", tags=["Empresas / Tenants SaaS"])


def require_super_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "user" not in payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    user = payload["user"]
    if user.get("rol") != "super_admin" and not user.get("is_impersonating"):
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado. Se requieren permisos de Super Admin Global para esta acción."
        )
    return user


class TenantCreate(BaseModel):
    id: Optional[str] = None
    nombre: str
    nit: str
    email_contacto: EmailStr
    telefono: Optional[str] = None
    cuota_pedidos_mes: int = 10000


class TenantUpdate(BaseModel):
    nombre: Optional[str] = None
    nit: Optional[str] = None
    email_contacto: Optional[EmailStr] = None
    telefono: Optional[str] = None
    cuota_pedidos_mes: Optional[int] = None
    activo: Optional[bool] = None


class TenantResponse(BaseModel):
    id: str
    nombre: str
    nit: str
    email_contacto: str
    telefono: Optional[str] = None
    cuota_pedidos_mes: int
    pedidos_mes_actual: int = 0
    porcentaje_consumo: float = 0.0
    activo: bool


@router.get("/saas-stats")
async def get_saas_stats(admin: dict = Depends(require_super_admin)):
    """Obtiene métricas y KPIs globales para la Consola SaaS Admin."""
    async for session in get_db_session():
        # Total empresas y activas
        emp_res = await session.execute(text("""
            SELECT
                COUNT(*)::int as total_empresas,
                COUNT(CASE WHEN activo = true THEN 1 END)::int as empresas_activas,
                SUM(cuota_pedidos_mes)::int as cuota_total_plataforma
            FROM public.empresas
            WHERE id != 'global'
        """))
        emp_row = emp_res.first()

        # Total predios y ejes catastrales
        predios_res = await session.execute(text("SELECT COUNT(*)::int FROM public.nomenclatura_domiciliaria"))
        total_predios = predios_res.scalar() or 0

        ejes_res = await session.execute(text("SELECT COUNT(*)::int FROM public.eje_de_nomenclatura"))
        total_ejes = ejes_res.scalar() or 0

        # Total pedidos mes actual en plataforma
        pedidos_res = await session.execute(text("SELECT COUNT(*)::int FROM pedidos"))
        total_pedidos = pedidos_res.scalar() or 0

        return {
            "total_empresas": emp_row.total_empresas if emp_row else 0,
            "empresas_activas": emp_row.empresas_activas if emp_row else 0,
            "cuota_total_plataforma": emp_row.cuota_total_plataforma if emp_row else 0,
            "total_predios_catastrales": total_predios,
            "total_ejes_viales": total_ejes,
            "total_pedidos_procesados": total_pedidos,
            "salud_sistema": "ÓPTIMA",
            "base_datos": "PostgreSQL 16 + PostGIS 3.4 (RLS Active)"
        }


@router.get("/", response_model=List[TenantResponse])
async def list_tenants(admin: dict = Depends(require_super_admin)):
    """Lista empresas registradas con métricas de consumo de cuota (Consola SaaS Admin)."""
    async for session in get_db_session():
        query = text("""
            SELECT e.id, e.nombre, e.nit, e.email_contacto, e.telefono, e.cuota_pedidos_mes, e.activo,
                   COALESCE(p.cnt, 0)::int as pedidos_mes_actual
            FROM public.empresas e
            LEFT JOIN (
                SELECT tenant_id, COUNT(*) as cnt
                FROM pedidos
                GROUP BY tenant_id
            ) p ON e.id = p.tenant_id
            ORDER BY e.fecha_creacion DESC
        """)
        res = await session.execute(query)
        rows = res.fetchall()

        result = []
        for r in rows:
            cuota = r.cuota_pedidos_mes or 10000
            pedidos = r.pedidos_mes_actual or 0
            porcentaje = round((pedidos / cuota) * 100, 1) if cuota > 0 else 0.0
            result.append(TenantResponse(
                id=r.id,
                nombre=r.nombre,
                nit=r.nit,
                email_contacto=r.email_contacto,
                telefono=r.telefono,
                cuota_pedidos_mes=cuota,
                pedidos_mes_actual=pedidos,
                porcentaje_consumo=porcentaje,
                activo=r.activo
            ))
        return result


@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(req: TenantCreate, admin: dict = Depends(require_super_admin)):
    """Crea una nueva empresa en la plataforma SaaS."""
    import uuid
    tenant_id = (req.id or "").strip().lower()
    if not tenant_id:
        tenant_id = f"emp_{uuid.uuid4().hex[:8]}"

    async for session in get_db_session():
        check_query = text("SELECT id FROM public.empresas WHERE id = :id OR nit = :nit LIMIT 1")
        res_check = await session.execute(check_query, {"id": tenant_id, "nit": req.nit})
        if res_check.first():
            raise HTTPException(status_code=400, detail="El ID o NIT ya se encuentra registrado")

        insert_query = text("""
            INSERT INTO public.empresas (id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes)
            VALUES (:id, :nombre, :nit, :email_contacto, :telefono, :cuota)
            RETURNING id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes, activo
        """)
        res = await session.execute(insert_query, {
            "id": tenant_id,
            "nombre": req.nombre,
            "nit": req.nit,
            "email_contacto": req.email_contacto,
            "telefono": req.telefono,
            "cuota": req.cuota_pedidos_mes
        })
        await session.commit()
        r = res.first()
        return TenantResponse(
            id=r.id, nombre=r.nombre, nit=r.nit,
            email_contacto=r.email_contacto, telefono=r.telefono,
            cuota_pedidos_mes=r.cuota_pedidos_mes, activo=r.activo,
            pedidos_mes_actual=0, porcentaje_consumo=0.0
        )


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(tenant_id: str, req: TenantUpdate, admin: dict = Depends(require_super_admin)):
    """Actualiza la información comercial o cuota de envíos de una empresa."""
    async for session in get_db_session():
        get_sql = text("SELECT id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes, activo FROM public.empresas WHERE id = :id")
        res = await session.execute(get_sql, {"id": tenant_id})
        row = res.first()
        if not row:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")

        nombre = req.nombre if req.nombre is not None else row.nombre
        nit = req.nit if req.nit is not None else row.nit
        email = req.email_contacto if req.email_contacto is not None else row.email_contacto
        telefono = req.telefono if req.telefono is not None else row.telefono
        cuota = req.cuota_pedidos_mes if req.cuota_pedidos_mes is not None else row.cuota_pedidos_mes
        activo = req.activo if req.activo is not None else row.activo

        update_sql = text("""
            UPDATE public.empresas
            SET nombre = :nombre, nit = :nit, email_contacto = :email,
                telefono = :telefono, cuota_pedidos_mes = :cuota, activo = :activo
            WHERE id = :id
            RETURNING id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes, activo
        """)
        up_res = await session.execute(update_sql, {
            "id": tenant_id, "nombre": nombre, "nit": nit,
            "email": email, "telefono": telefono, "cuota": cuota, "activo": activo
        })
        await session.commit()
        r = up_res.first()
        return TenantResponse(
            id=r.id, nombre=r.nombre, nit=r.nit,
            email_contacto=r.email_contacto, telefono=r.telefono,
            cuota_pedidos_mes=r.cuota_pedidos_mes, activo=r.activo
        )


@router.patch("/{tenant_id}/status")
async def toggle_tenant_status(tenant_id: str, activo: bool, admin: dict = Depends(require_super_admin)):
    """Activa o desactiva el acceso a la plataforma para una empresa."""
    async for session in get_db_session():
        query = text("UPDATE public.empresas SET activo = :activo WHERE id = :id RETURNING id, nombre, activo")
        res = await session.execute(query, {"id": tenant_id, "activo": activo})
        await session.commit()
        r = res.first()
        if not r:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        return {"status": "ok", "id": r.id, "nombre": r.nombre, "activo": r.activo}


DEFAULT_COLUMN_MAPPING = {
    "plantillas_sectorizacion": [
        {
            "id": "std_sectorizacion_es",
            "nombre": "iMile / Estándar Sectorización (Español)",
            "guia": "Guía",
            "direccion_original": "Dirección",
            "cliente": "Cliente",
            "telefono_cliente": "Teléfono"
        },
        {
            "id": "std_sectorizacion_en",
            "nombre": "iMile / Standard Sectorization (English)",
            "guia": "Waybill No.",
            "direccion_original": "Destination Address",
            "cliente": "Customer Name",
            "telefono_cliente": "Phone"
        }
    ],
    "plantillas_conciliacion": [
        {
            "id": "std_conciliacion_es",
            "nombre": "Rutas iMile / Conciliación Estándar",
            "route_guia": "Waybill No.",
            "route_da": "DA Name",
            "route_time": "Delivered time"
        }
    ]
}


class ColumnMappingVariant(BaseModel):
    id: str
    nombre: str
    guia: Optional[str] = None
    direccion_original: Optional[str] = None
    cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None
    route_guia: Optional[str] = None
    route_da: Optional[str] = None
    route_time: Optional[str] = None


class MultiColumnMappingRequest(BaseModel):
    plantillas_sectorizacion: Optional[List[Dict[str, Any]]] = None
    plantillas_conciliacion: Optional[List[Dict[str, Any]]] = None
    # Soporte retrocompatible para envío plano
    guia: Optional[str] = None
    direccion_original: Optional[str] = None
    cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None
    route_guia: Optional[str] = None
    route_da: Optional[str] = None
    route_time: Optional[str] = None


@router.get("/global/column-mapping")
@router.get("/{tenant_id}/column-mapping")
async def get_column_mapping(tenant_id: str):
    """Obtiene las plantillas de mapeo de columnas globales que aplican a todas las empresas."""
    async for session in get_db_session():
        query = text("SELECT mapeo_columnas FROM public.empresas WHERE id = 'global' LIMIT 1")
        res = await session.execute(query)
        row = res.first()

        saved = row.mapeo_columnas if (row and row.mapeo_columnas) else {}
        if not isinstance(saved, dict):
            saved = {}

        # Normalizar a estructura multi-plantilla
        sect_templates = saved.get("plantillas_sectorizacion")
        concil_templates = saved.get("plantillas_conciliacion")

        if not sect_templates or not isinstance(sect_templates, list):
            sect_templates = list(DEFAULT_COLUMN_MAPPING["plantillas_sectorizacion"])
            if saved.get("guia") and saved.get("direccion_original"):
                legacy_var = {
                    "id": "legacy_custom",
                    "nombre": "Configuración Anterior Guardada",
                    "guia": saved["guia"],
                    "direccion_original": saved["direccion_original"],
                    "cliente": saved.get("cliente", ""),
                    "telefono_cliente": saved.get("telefono_cliente", "")
                }
                sect_templates.insert(0, legacy_var)

        if not concil_templates or not isinstance(concil_templates, list):
            concil_templates = list(DEFAULT_COLUMN_MAPPING["plantillas_conciliacion"])
            if saved.get("route_guia") and saved.get("route_da"):
                legacy_concil = {
                    "id": "legacy_concil_custom",
                    "nombre": "Rutas Anterior Guardado",
                    "route_guia": saved["route_guia"],
                    "route_da": saved["route_da"],
                    "route_time": saved.get("route_time", "")
                }
                concil_templates.insert(0, legacy_concil)

        return {
            "plantillas_sectorizacion": sect_templates,
            "plantillas_conciliacion": concil_templates
        }


@router.post("/global/column-mapping")
@router.post("/{tenant_id}/column-mapping")
async def save_column_mapping(tenant_id: str, mapping: MultiColumnMappingRequest):
    """Guarda o actualiza las plantillas de mapeo de columnas a nivel global."""
    import json
    target_id = "global"
    async for session in get_db_session():
        check_sql = text("SELECT id, mapeo_columnas FROM public.empresas WHERE id = :id LIMIT 1")
        res_check = await session.execute(check_sql, {"id": target_id})
        row = res_check.first()

        # Si no existe en BD el registro 'global', insertarlo automáticamente
        if not row:
            await session.execute(text("""
                INSERT INTO public.empresas (id, nombre, nit, email_contacto, cuota_pedidos_mes)
                VALUES ('global', 'Configuración Global SaaS', '000000000-0', 'admin@geofull.com', 99999999)
                ON CONFLICT (id) DO NOTHING
            """))
            await session.commit()
            res_check = await session.execute(check_sql, {"id": target_id})
            row = res_check.first()

        curr_data = row.mapeo_columnas if (row and row.mapeo_columnas) else {}
        if not isinstance(curr_data, dict):
            curr_data = {}

        req_dict = mapping.model_dump(exclude_unset=True)

        if "plantillas_sectorizacion" in req_dict and req_dict["plantillas_sectorizacion"] is not None:
            curr_data["plantillas_sectorizacion"] = req_dict["plantillas_sectorizacion"]

        if "plantillas_conciliacion" in req_dict and req_dict["plantillas_conciliacion"] is not None:
            curr_data["plantillas_conciliacion"] = req_dict["plantillas_conciliacion"]

        # Si vienen campos legacy
        if req_dict.get("guia"):
            curr_data["guia"] = req_dict["guia"]
        if req_dict.get("direccion_original"):
            curr_data["direccion_original"] = req_dict["direccion_original"]
        if req_dict.get("cliente") is not None:
            curr_data["cliente"] = req_dict["cliente"]
        if req_dict.get("telefono_cliente") is not None:
            curr_data["telefono_cliente"] = req_dict["telefono_cliente"]

        update_sql = text("""
            UPDATE public.empresas
            SET mapeo_columnas = CAST(:mapping AS JSONB)
            WHERE id = :id
            RETURNING id, mapeo_columnas
        """)
        res_up = await session.execute(update_sql, {
            "id": target_id,
            "mapping": json.dumps(curr_data, ensure_ascii=False)
        })
        await session.commit()
        up_row = res_up.first()
        return {"status": "ok", "mapeo_columnas": up_row.mapeo_columnas if up_row else curr_data}



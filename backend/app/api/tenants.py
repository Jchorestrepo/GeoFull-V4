from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from app.core.database import get_db_session

router = APIRouter(prefix="/tenants", tags=["Empresas / Tenants SaaS"])


class TenantCreate(BaseModel):
    id: str
    nombre: str
    nit: str
    email_contacto: EmailStr
    telefono: Optional[str] = None
    cuota_pedidos_mes: int = 10000


class TenantResponse(BaseModel):
    id: str
    nombre: str
    nit: str
    email_contacto: str
    telefono: Optional[str] = None
    cuota_pedidos_mes: int
    activo: bool


@router.get("/", response_model=List[TenantResponse])
async def list_tenants():
    """Lista empresas registradas (Consola SaaS Admin)."""
    async for session in get_db_session():
        query = text("""
            SELECT id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes, activo
            FROM public.empresas
            ORDER BY fecha_creacion DESC
        """)
        res = await session.execute(query)
        rows = res.fetchall()
        return [
            TenantResponse(
                id=r.id, nombre=r.nombre, nit=r.nit,
                email_contacto=r.email_contacto, telefono=r.telefono,
                cuota_pedidos_mes=r.cuota_pedidos_mes, activo=r.activo
            )
            for r in rows
        ]


@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(req: TenantCreate):
    """Crea una nueva empresa en la plataforma SaaS."""
    async for session in get_db_session():
        check_query = text("SELECT id FROM public.empresas WHERE id = :id OR nit = :nit LIMIT 1")
        res_check = await session.execute(check_query, {"id": req.id, "nit": req.nit})
        if res_check.first():
            raise HTTPException(status_code=400, detail="El ID o NIT ya se encuentra registrado")

        insert_query = text("""
            INSERT INTO public.empresas (id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes)
            VALUES (:id, :nombre, :nit, :email_contacto, :telefono, :cuota)
            RETURNING id, nombre, nit, email_contacto, telefono, cuota_pedidos_mes, activo
        """)
        res = await session.execute(insert_query, {
            "id": req.id.lower().strip(),
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
            cuota_pedidos_mes=r.cuota_pedidos_mes, activo=r.activo
        )


class ColumnMappingRequest(BaseModel):
    guia: str
    direccion_original: str
    cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None


@router.get("/{tenant_id}/column-mapping")
async def get_column_mapping(tenant_id: str):
    """Obtiene la configuración de mapeo de columnas previamente guardada para la empresa."""
    async for session in get_db_session():
        query = text("SELECT mapeo_columnas FROM public.empresas WHERE id = :id LIMIT 1")
        res = await session.execute(query, {"id": tenant_id})
        row = res.first()
        if not row:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        return row.mapeo_columnas or {}


@router.post("/{tenant_id}/column-mapping")
async def save_column_mapping(tenant_id: str, mapping: ColumnMappingRequest):
    """Guarda o actualiza la configuración de mapeo de columnas para una empresa."""
    import json
    async for session in get_db_session():
        query = text("""
            UPDATE public.empresas
            SET mapeo_columnas = :mapping
            WHERE id = :id
            RETURNING id, mapeo_columnas
        """)
        res = await session.execute(query, {
            "id": tenant_id,
            "mapping": json.dumps(mapping.model_dump())
        })
        await session.commit()
        row = res.first()
        if not row:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        return {"status": "ok", "mapeo_columnas": row.mapeo_columnas}

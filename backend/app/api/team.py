from typing import List, Optional
import uuid
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from app.core.database import get_db_session

router = APIRouter(prefix="/team", tags=["Gestión de Equipo / Supervisores"])


class TeamMemberCreate(BaseModel):
    nombre_completo: str
    email: str
    rol: str = "supervisor"
    telefono: Optional[str] = None
    activo: bool = True


class TeamMemberResponse(BaseModel):
    id: uuid.UUID
    nombre_completo: str
    email: str
    rol: str
    telefono: Optional[str] = None
    activo: bool


@router.get("/", response_model=List[TeamMemberResponse])
async def list_team_members(x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")):
    """Lista integrantes del equipo (supervisores, jefes de zona, operarios) de la empresa."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("""
            SELECT id, nombre_completo, email, rol, activo
            FROM usuarios
            WHERE tenant_id = :tenant_id
            ORDER BY nombre_completo ASC
        """)
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        rows = res.fetchall()

        return [
            TeamMemberResponse(
                id=r.id,
                nombre_completo=r.nombre_completo or r.email.split("@")[0],
                email=r.email,
                rol=r.rol or "operario",
                telefono="",
                activo=r.activo if r.activo is not None else True
            )
            for r in rows
        ]


@router.post("/", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def create_team_member(
    req: TeamMemberCreate,
    x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")
):
    """Registra un nuevo integrante en el equipo de la empresa."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        # Verificar duplicado de email en la empresa
        check_sql = text("SELECT id FROM usuarios WHERE email = :email AND tenant_id = :tenant_id LIMIT 1")
        check_res = await session.execute(check_sql, {"email": req.email.strip().lower(), "tenant_id": x_tenant_id})
        if check_res.first():
            raise HTTPException(status_code=400, detail="Ya existe un usuario registrado con este correo en la empresa")

        new_id = uuid.uuid4()
        insert_sql = text("""
            INSERT INTO usuarios (id, tenant_id, email, password_hash, nombre_completo, rol, activo)
            VALUES (:id, :tenant_id, :email, 'GOOGLE_AUTH', :nombre_completo, :rol, :activo)
            RETURNING id, nombre_completo, email, rol, activo
        """)
        res = await session.execute(insert_sql, {
            "id": new_id,
            "tenant_id": x_tenant_id,
            "email": req.email.strip().lower(),
            "nombre_completo": req.nombre_completo.strip(),
            "rol": req.rol.strip().lower(),
            "activo": req.activo
        })
        await session.commit()
        r = res.first()
        return TeamMemberResponse(
            id=r.id,
            nombre_completo=r.nombre_completo,
            email=r.email,
            rol=r.rol,
            telefono=req.telefono,
            activo=r.activo
        )


@router.put("/{member_id}", response_model=TeamMemberResponse)
async def update_team_member(
    member_id: uuid.UUID,
    req: TeamMemberCreate,
    x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")
):
    """Actualiza la información de un integrante del equipo."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        update_sql = text("""
            UPDATE usuarios
            SET nombre_completo = :nombre_completo,
                email = :email,
                rol = :rol,
                activo = :activo
            WHERE id = :id AND tenant_id = :tenant_id
            RETURNING id, nombre_completo, email, rol, activo
        """)
        res = await session.execute(update_sql, {
            "id": member_id,
            "tenant_id": x_tenant_id,
            "nombre_completo": req.nombre_completo.strip(),
            "email": req.email.strip().lower(),
            "rol": req.rol.strip().lower(),
            "activo": req.activo
        })
        await session.commit()
        r = res.first()
        if not r:
            raise HTTPException(status_code=404, detail="Integrante del equipo no encontrado")
        return TeamMemberResponse(
            id=r.id,
            nombre_completo=r.nombre_completo,
            email=r.email,
            rol=r.rol,
            telefono=req.telefono,
            activo=r.activo
        )


@router.delete("/{member_id}")
async def delete_team_member(
    member_id: uuid.UUID,
    x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")
):
    """Elimina o revoca el acceso a un integrante del equipo."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM usuarios WHERE id = :id AND tenant_id = :tenant_id")
        res = await session.execute(sql, {"id": member_id, "tenant_id": x_tenant_id})
        await session.commit()
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Integrante del equipo no encontrado")
        return {"status": "ok", "message": "Acceso revocado exitosamente"}

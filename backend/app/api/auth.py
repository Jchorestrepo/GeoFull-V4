from typing import Optional
import uuid
from fastapi import APIRouter, HTTPException, Header, status, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from app.core.database import get_db_session
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token

router = APIRouter(prefix="/auth", tags=["Autenticación & Sesiones"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserRegisterRequest(BaseModel):
    email: str
    nombre_completo: str
    password: str
    rol: str = "admin_empresa"
    tenant_id: str = "empresa_demo"


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Inicio de sesión de usuarios con correo y contraseña."""
    email_clean = req.email.strip().lower()

    async for session in get_db_session():
        # Consultar usuario en la base de datos
        sql = text("""
            SELECT u.id, u.email, u.password_hash, u.nombre_completo, u.rol, u.tenant_id, u.activo,
                   e.nombre as empresa_nombre
            FROM usuarios u
            LEFT JOIN public.empresas e ON u.tenant_id = e.id
            WHERE LOWER(u.email) = :email
            LIMIT 1
        """)
        res = await session.execute(sql, {"email": email_clean})
        user_row = res.first()

        # Si no existe usuario en la BD, auto-crear usuarios y empresas demo para pruebas iniciales
        if not user_row:
            if email_clean == "admin@geofull.app":
                # Super Admin Global - Asegurar que el tenant 'global' exista en public.empresas
                await session.execute(text("""
                    INSERT INTO public.empresas (id, nombre, nit, email_contacto, cuota_pedidos_mes, activo)
                    VALUES ('global', 'SaaS Global Super Admin', '000000000-0', 'admin@geofull.app', 9999999, true)
                    ON CONFLICT (id) DO NOTHING
                """))
                await session.commit()

                new_id = uuid.uuid4()
                pwd_hash = hash_password(req.password or "admin123")
                ins_sql = text("""
                    INSERT INTO usuarios (id, tenant_id, email, password_hash, nombre_completo, rol, activo)
                    VALUES (:id, 'global', 'admin@geofull.app', :pwd, 'Super Admin Global', 'super_admin', true)
                    RETURNING id, email, password_hash, nombre_completo, rol, tenant_id, activo
                """)
                ins_res = await session.execute(ins_sql, {"id": new_id, "pwd": pwd_hash})
                await session.commit()
                
                # Re-consultar con JOIN a empresas
                refetch = await session.execute(sql, {"email": email_clean})
                user_row = refetch.first()

            elif email_clean in ("demo@empresa.com", "coordinadora@empresa.com", "operario@geofull.app"):
                t_id = "coordinadora" if "coordinadora" in email_clean else "empresa_demo"
                emp_name = "Coordinadora Express S.A.S." if t_id == "coordinadora" else "Empresa Demo Logística S.A.S."

                # Asegurar que la empresa exista en public.empresas
                emp_check = await session.execute(text("SELECT id FROM public.empresas WHERE id = :id LIMIT 1"), {"id": t_id})
                if not emp_check.first():
                    await session.execute(text("""
                        INSERT INTO public.empresas (id, nombre, nit, email_contacto, cuota_pedidos_mes, activo)
                        VALUES (:id, :nombre, :nit, :email, 10000, true)
                        ON CONFLICT (id) DO NOTHING
                    """), {
                        "id": t_id,
                        "nombre": emp_name,
                        "nit": "900999888-1" if t_id == "coordinadora" else "900123456-1",
                        "email": email_clean
                    })
                    await session.commit()

                new_id = uuid.uuid4()
                pwd_hash = hash_password(req.password or "demo123")
                ins_sql = text("""
                    INSERT INTO usuarios (id, tenant_id, email, password_hash, nombre_completo, rol, activo)
                    VALUES (:id, :t_id, :email, :pwd, :nombre, 'admin_empresa', true)
                    RETURNING id, email, password_hash, nombre_completo, rol, tenant_id, activo
                """)
                ins_res = await session.execute(ins_sql, {
                    "id": new_id, "t_id": t_id, "email": email_clean,
                    "pwd": pwd_hash, "nombre": f"Admin {t_id.capitalize()}"
                })
                await session.commit()

                # Re-consultar con JOIN a empresas
                refetch = await session.execute(sql, {"email": email_clean})
                user_row = refetch.first()
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciales incorrectas o usuario no registrado."
                )

        # Verificar si el usuario está inactivo
        if user_row.activo is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El acceso de este usuario se encuentra inactivo."
            )

        # Validar contraseña
        if user_row.password_hash and not verify_password(req.password, user_row.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Contraseña incorrecta."
            )

        # Generar token JWT
        user_dict = {
            "id": str(user_row.id),
            "email": user_row.email,
            "nombre_completo": user_row.nombre_completo or user_row.email,
            "rol": user_row.rol or "operario",
            "tenant_id": user_row.tenant_id or "empresa_demo",
            "empresa_nombre": getattr(user_row, "empresa_nombre", None) or "Empresa Demo"
        }

        token = create_access_token(data={"sub": user_dict["id"], "user": user_dict})

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            user=user_dict
        )


@router.get("/me")
async def get_current_user_profile(authorization: Optional[str] = Header(None)):
    """Obtiene la información del usuario autenticado desde el token JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "user" not in payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    return payload["user"]


@router.post("/impersonate")
async def impersonate_tenant(
    target_tenant_id: str,
    authorization: Optional[str] = Header(None)
):
    """Permite al Super Admin suplantar la sesión de un ambiente de empresa."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or payload.get("user", {}).get("rol") != "super_admin":
        raise HTTPException(status_code=403, detail="Solo el Super Admin puede suplantar empresas")

    async for session in get_db_session():
        emp_res = await session.execute(
            text("SELECT id, nombre FROM public.empresas WHERE id = :id LIMIT 1"),
            {"id": target_tenant_id}
        )
        emp = emp_res.first()
        if not emp:
            raise HTTPException(status_code=404, detail="Empresa destino no encontrada")

        user_dict = {
            "id": str(uuid.uuid4()),
            "email": f"admin_{emp.id}@geofull.internal",
            "nombre_completo": f"Modo Soporte ({emp.nombre})",
            "rol": "admin_empresa",
            "tenant_id": emp.id,
            "empresa_nombre": emp.nombre,
            "is_impersonating": True
        }

        token = create_access_token(data={"sub": user_dict["id"], "user": user_dict})
        return {
            "access_token": token,
            "user": user_dict
        }

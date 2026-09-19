import httpx
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


class GoogleAuthRequest(BaseModel):
    credential: str


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


@router.post("/google", response_model=LoginResponse)
async def google_login(req: GoogleAuthRequest):
    """Inicio de sesión con Google OAuth 2.0 (Google Identity Services)."""
    credential = req.credential.strip()
    if not credential:
        raise HTTPException(status_code=400, detail="Credential o token de Google no proporcionado")

    # Verificar token llamando a Google Tokeninfo API
    email = None
    name = None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}")
            if resp.status_code == 200:
                data = resp.json()
                email = data.get("email", "").strip().lower()
                name = data.get("name") or data.get("given_name") or email
    except Exception as e:
        print(f"Aviso al verificar token con Google API: {e}")

    # Fallback si el token es JWT simulado o parseable localmente
    if not email:
        try:
            import json, base64
            parts = credential.split(".")
            if len(parts) == 3:
                payload_b64 = parts[1] + "=="
                decoded_bytes = base64.urlsafe_b64decode(payload_b64)
                payload_json = json.loads(decoded_bytes)
                email = payload_json.get("email", "").strip().lower()
                name = payload_json.get("name") or email
        except Exception:
            pass

    if not email:
        raise HTTPException(status_code=401, detail="Token de Google no válido o no fue posible obtener el correo.")

    # Regla Especial Super Admin: jchorestrepo@gmail.com
    is_super_admin = (email == "jchorestrepo@gmail.com")

    async for session in get_db_session():
        sql = text("""
            SELECT u.id, u.email, u.nombre_completo, u.rol, u.tenant_id, u.activo,
                   e.nombre as empresa_nombre
            FROM usuarios u
            LEFT JOIN public.empresas e ON u.tenant_id = e.id
            WHERE LOWER(u.email) = :email
            LIMIT 1
        """)
        res = await session.execute(sql, {"email": email})
        user_row = res.first()

        if is_super_admin:
            # Asegurar que la empresa 'global' exista
            await session.execute(text("""
                INSERT INTO public.empresas (id, nombre, nit, email_contacto, cuota_pedidos_mes, activo)
                VALUES ('global', 'SaaS Global Super Admin', '000000000-0', 'jchorestrepo@gmail.com', 9999999, true)
                ON CONFLICT (id) DO UPDATE SET activo = true
            """))
            await session.commit()

            if not user_row:
                new_id = uuid.uuid4()
                ins_sql = text("""
                    INSERT INTO usuarios (id, tenant_id, email, password_hash, nombre_completo, rol, activo)
                    VALUES (:id, 'global', :email, 'GOOGLE_AUTH', :nombre, 'super_admin', true)
                """)
                await session.execute(ins_sql, {"id": new_id, "email": email, "nombre": name or "JChorestrepo (Super Admin)"})
                await session.commit()
            else:
                await session.execute(text("""
                    UPDATE usuarios SET rol = 'super_admin', tenant_id = 'global', activo = true WHERE id = :id
                """), {"id": user_row.id})
                await session.commit()

            refetch = await session.execute(sql, {"email": email})
            user_row = refetch.first()

        elif not user_row:
            # Buscar si existe una empresa registrada en public.empresas con este email de contacto
            emp_match = await session.execute(
                text("SELECT id, nombre, activo FROM public.empresas WHERE LOWER(email_contacto) = :email LIMIT 1"),
                {"email": email}
            )
            emp = emp_match.first()
            if not emp:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Acceso denegado. La cuenta de Google '{email}' no se encuentra registrada ni autorizada en ninguna empresa de GeoFull V4."
                )
            if emp.activo is False:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Acceso denegado. La empresa asociada a '{email}' se encuentra suspendida o inactiva."
                )

            new_id = uuid.uuid4()
            ins_sql = text("""
                INSERT INTO usuarios (id, tenant_id, email, password_hash, nombre_completo, rol, activo)
                VALUES (:id, :t_id, :email, 'GOOGLE_AUTH', :nombre, 'admin_empresa', true)
            """)
            await session.execute(ins_sql, {"id": new_id, "t_id": emp.id, "email": email, "nombre": name or email})
            await session.commit()

            refetch = await session.execute(sql, {"email": email})
            user_row = refetch.first()
        else:
            # Si el usuario ya existe pero su email de contacto coincide con una empresa registrada, sincronizar su tenant_id
            emp_match = await session.execute(
                text("SELECT id, nombre FROM public.empresas WHERE LOWER(email_contacto) = :email LIMIT 1"),
                {"email": email}
            )
            emp = emp_match.first()
            if emp and user_row.tenant_id != emp.id:
                await session.execute(
                    text("UPDATE usuarios SET tenant_id = :t_id WHERE id = :id"),
                    {"t_id": emp.id, "id": user_row.id}
                )
                await session.commit()
                refetch = await session.execute(sql, {"email": email})
                user_row = refetch.first()

        if user_row.activo is False:
            raise HTTPException(status_code=403, detail="El acceso de esta cuenta de Google se encuentra inactivo.")

        user_dict = {
            "id": str(user_row.id),
            "email": user_row.email,
            "nombre_completo": user_row.nombre_completo or name or user_row.email,
            "rol": user_row.rol or ("super_admin" if is_super_admin else "admin_empresa"),
            "tenant_id": user_row.tenant_id or ("global" if is_super_admin else "coordinadora"),
            "empresa_nombre": getattr(user_row, "empresa_nombre", None) or ("SaaS Global Super Admin" if is_super_admin else "Coordinadora Express S.A.S.")
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

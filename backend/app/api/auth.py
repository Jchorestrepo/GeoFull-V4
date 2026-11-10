import httpx
import time
from collections import defaultdict
from typing import Optional
import uuid
from fastapi import APIRouter, HTTPException, Header, Request, status, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from app.core.database import get_db_session
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["Autenticación & Sesiones"])

# Rate limiter en memoria contra fuerza bruta en /auth/login (máx. 10 intentos fallidos cada 5 min por IP/correo)
_LOGIN_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW_SEC = 300
_RATE_LIMIT_MAX_FAILURES = 10


def _check_login_rate_limit(key: str) -> None:
    now = time.time()
    recent = [ts for ts in _LOGIN_ATTEMPTS.get(key, []) if now - ts < _RATE_LIMIT_WINDOW_SEC]
    _LOGIN_ATTEMPTS[key] = recent
    if len(recent) >= _RATE_LIMIT_MAX_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos de inicio de sesión fallidos. Intente nuevamente en 5 minutos."
        )


def _record_login_failure(key: str) -> None:
    _LOGIN_ATTEMPTS[key].append(time.time())


def _clear_login_failures(key: str) -> None:
    _LOGIN_ATTEMPTS.pop(key, None)


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
async def login(req: LoginRequest, request: Request):
    """Inicio de sesión de usuarios con correo y contraseña."""
    email_clean = req.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{email_clean}"

    _check_login_rate_limit(rate_key)

    async for session in get_db_session(tenant_id="global"):
        # Consultar usuario en la base de datos
        sql = text("""
            SELECT u.id, u.email, u.password_hash, u.nombre_completo, u.rol, u.tenant_id, u.activo,
                   e.nombre as empresa_nombre, e.activo as empresa_activa
            FROM usuarios u
            LEFT JOIN public.empresas e ON u.tenant_id = e.id
            WHERE LOWER(u.email) = :email
            LIMIT 1
        """)
        res = await session.execute(sql, {"email": email_clean})
        user_row = res.first()

        # Autocreación de usuarios demo ÚNICAMENTE permitida en entorno de desarrollo (ENVIRONMENT=development)
        if not user_row:
            if settings.is_development and email_clean in ("demo@empresa.com", "admin@dexpress.com.co", "coordinadora@empresa.com", "operario@geofull.app"):
                t_id = "emp_default_01" if ("dexpress" in email_clean or "coordinadora" in email_clean) else "empresa_demo"
                emp_name = "DeXpress Colombia SAS" if t_id == "emp_default_01" else "Empresa Demo Logística S.A.S."

                emp_check = await session.execute(text("SELECT id FROM public.empresas WHERE id = :id LIMIT 1"), {"id": t_id})
                if not emp_check.first():
                    await session.execute(text("""
                        INSERT INTO public.empresas (id, nombre, nit, email_contacto, cuota_pedidos_mes, activo)
                        VALUES (:id, :nombre, :nit, :email, 10000, true)
                        ON CONFLICT (id) DO NOTHING
                    """), {
                        "id": t_id,
                        "nombre": emp_name,
                        "nit": "900999888-1" if t_id == "emp_default_01" else "900123456-1",
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
                await session.execute(ins_sql, {
                    "id": new_id, "t_id": t_id, "email": email_clean,
                    "pwd": pwd_hash, "nombre": f"Admin {t_id.capitalize()}"
                })
                await session.commit()

                refetch = await session.execute(sql, {"email": email_clean})
                user_row = refetch.first()
            else:
                _record_login_failure(rate_key)
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

        # Verificar si la empresa asociada está suspendida/inactiva (salvo super_admin global)
        if user_row.rol != "super_admin" and getattr(user_row, "empresa_activa", True) is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="La empresa asociada a esta cuenta se encuentra suspendida o inactiva."
            )

        # Validar contraseña obligatoriamente
        if not user_row.password_hash or not verify_password(req.password, user_row.password_hash):
            _record_login_failure(rate_key)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Contraseña incorrecta."
            )

        _clear_login_failures(rate_key)

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
            resp = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential})
            if resp.status_code == 200:
                data = resp.json()
                # Validar que el token fue emitido para esta app y por Google
                if data.get("aud") != settings.GOOGLE_CLIENT_ID:
                    print(f"Token de Google rechazado: aud no coincide con GOOGLE_CLIENT_ID")
                elif data.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
                    print(f"Token de Google rechazado: iss no válido")
                elif data.get("email_verified") not in (True, "true"):
                    print(f"Token de Google rechazado: email no verificado")
                else:
                    email = (data.get("email") or "").strip().lower()
                    name = data.get("name") or data.get("given_name") or email
    except Exception as e:
        print(f"Aviso al verificar token con Google API: {e}")

    if not email:
        raise HTTPException(status_code=401, detail="Token de Google no válido o no fue posible obtener el correo.")

    # Regla Especial Super Admin: verificar contra lista de super admins configurados
    is_super_admin = (email.lower() in settings.super_admin_emails_list)

    async for session in get_db_session(tenant_id="global"):
        sql = text("""
            SELECT u.id, u.email, u.nombre_completo, u.rol, u.tenant_id, u.activo,
                   e.nombre as empresa_nombre, e.activo as empresa_activa
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
            # Usuario sin empresa asignada: asociarlo a la empresa cuyo email de contacto coincide
            emp_match = await session.execute(
                text("SELECT id, nombre FROM public.empresas WHERE LOWER(email_contacto) = :email LIMIT 1"),
                {"email": email}
            )
            emp = emp_match.first()
            if emp and user_row.tenant_id is None:
                await session.execute(
                    text("UPDATE usuarios SET tenant_id = :t_id WHERE id = :id"),
                    {"t_id": emp.id, "id": user_row.id}
                )
                await session.commit()
                refetch = await session.execute(sql, {"email": email})
                user_row = refetch.first()

        if user_row.activo is False:
            raise HTTPException(status_code=403, detail="El acceso de esta cuenta de Google se encuentra inactivo.")

        if not is_super_admin:
            # Usuario normal: debe estar asociado a una empresa activa, nunca al tenant global ni con rol super_admin
            if user_row.rol == "super_admin" or user_row.tenant_id in (None, "", "global"):
                raise HTTPException(status_code=403, detail="Acceso denegado. La cuenta no está asociada a una empresa.")
            if user_row.empresa_activa is not True:
                raise HTTPException(status_code=403, detail="Acceso denegado. La empresa asociada se encuentra suspendida o inactiva.")

        user_dict = {
            "id": str(user_row.id),
            "email": user_row.email,
            "nombre_completo": user_row.nombre_completo or name or user_row.email,
            "rol": user_row.rol,
            "tenant_id": user_row.tenant_id,
            "empresa_nombre": user_row.empresa_nombre
        }

        token = create_access_token(data={"sub": user_dict["id"], "user": user_dict})

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            user=user_dict
        )


@router.get("/me")
async def get_current_user_profile(authorization: Optional[str] = Header(None)):
    """Obtiene la información del usuario autenticado desde el token JWT y verifica su vigencia en BD."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload or "user" not in payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    user = payload["user"]
    if not user.get("is_impersonating") and user.get("id"):
        async for session in get_db_session(tenant_id="global"):
            try:
                res = await session.execute(text("""
                    SELECT u.activo, u.rol, u.tenant_id, e.activo as empresa_activa
                    FROM usuarios u
                    LEFT JOIN public.empresas e ON u.tenant_id = e.id
                    WHERE u.id = CAST(:uid AS UUID)
                    LIMIT 1
                """), {"uid": user["id"]})
                row = res.first()
                if row:
                    if row.activo is False:
                        raise HTTPException(status_code=401, detail="Cuenta de usuario desactivada")
                    if row.rol != "super_admin" and row.empresa_activa is False:
                        raise HTTPException(status_code=401, detail="Empresa suspendida o inactiva")
            except HTTPException:
                raise
            except Exception:
                pass

    return user


@router.post("/impersonate")
async def impersonate_tenant(
    target_tenant_id: str,
    authorization: Optional[str] = Header(None)
):
    """Permite al Super Admin suplantar la sesión de un ambiente de empresa."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload or payload.get("user", {}).get("rol") != "super_admin":
        raise HTTPException(status_code=403, detail="Solo el Super Admin puede suplantar empresas")

    async for session in get_db_session(tenant_id="global"):
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


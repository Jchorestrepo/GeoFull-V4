"""
Dependencias de seguridad centralizadas para FastAPI — GeoFull V4.

Provee `get_current_user` y `get_tenant_id` como dependencies inyectables
que garantizan que el tenant_id SIEMPRE provenga del JWT firmado,
impidiendo manipulación desde el cliente.
"""
from typing import Optional
from fastapi import Header, HTTPException, Depends
from app.core.security import decode_access_token


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Extrae y valida el usuario del token JWT firmado.
    Requerido en TODOS los endpoints operativos.
    Rechaza con 401 si el token es inválido, expirado o no proporcionado.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autenticación requerido")
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload or "user" not in payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return payload["user"]


def get_tenant_id(
    current_user: dict = Depends(get_current_user)
) -> str:
    """
    Determina el tenant_id SEGURO para la petición:
    El tenant_id SIEMPRE se extrae del JWT firmado (inmutable).
    - Para usuarios normales: es el ID de su empresa.
    - Para Super Admin: es 'global' (o el ID de la empresa suplantada en Modo Soporte).
    """
    jwt_tenant = current_user.get("tenant_id")
    if not jwt_tenant:
        raise HTTPException(
            status_code=403,
            detail="El usuario autenticado no tiene un tenant_id asignado."
        )
    return jwt_tenant


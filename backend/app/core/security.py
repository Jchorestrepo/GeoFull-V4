import os
import hmac
import hashlib
import json
import base64
import time
from typing import Optional, Dict, Any
from app.core.config import settings


def hash_password(password: str) -> str:
    """Genera un hash SHA-256 con salt seguro para contraseñas."""
    salt = os.urandom(16).hex()
    pwd_bytes = (password + salt).encode('utf-8')
    key = hashlib.sha256(pwd_bytes).hexdigest()
    return f"{salt}${key}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si la contraseña coincide con el hash almacenado."""
    if not hashed_password or '$' not in hashed_password:
        return False
    try:
        salt, key = hashed_password.split('$', 1)
        pwd_bytes = (plain_password + salt).encode('utf-8')
        calc_key = hashlib.sha256(pwd_bytes).hexdigest()
        return hmac.compare_digest(calc_key, key)
    except Exception:
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def _b64url_decode(data: str) -> bytes:
    padding = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode('utf-8'))


def create_access_token(data: Dict[str, Any], expires_minutes: Optional[int] = None) -> str:
    """Crea un token JWT (HS256) nativo sin dependencias externas."""
    header = {"alg": "HS256", "typ": "JWT"}
    header_json = json.dumps(header, separators=(',', ':')).encode('utf-8')
    header_b64 = _b64url_encode(header_json)

    mins = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    exp_time = int(time.time()) + (mins * 60)

    payload = data.copy()
    payload["exp"] = exp_time
    payload_json = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    payload_b64 = _b64url_encode(payload_json)

    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        signing_input,
        hashlib.sha256
    ).digest()
    signature_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodifica y verifica la firma HMAC-SHA256 y expiración de un token JWT."""
    if not token or token.count('.') != 2:
        return None
    try:
        parts = token.split('.')
        header_b64, payload_b64, signature_b64 = parts[0], parts[1], parts[2]

        signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_sig = hmac.new(
            settings.SECRET_KEY.encode('utf-8'),
            signing_input,
            hashlib.sha256
        ).digest()
        calc_sig_b64 = _b64url_encode(expected_sig)

        if not hmac.compare_digest(calc_sig_b64, signature_b64):
            return None

        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))

        if "exp" in payload and payload["exp"] < time.time():
            return None

        return payload
    except Exception:
        return None

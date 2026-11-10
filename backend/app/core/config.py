import os
import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRET = "geofull_v4_secret_key_change_in_production_2026"


def _resolve_secret_key(configured_key: str) -> str:
    """
    Evita que el backend firme JWTs con una clave pública del repositorio.
    Si SECRET_KEY no fue personalizada en el entorno, genera y persiste localmente
    una clave criptográfica de 256 bits en `backend/data/.jwt_secret`.
    """
    env_key = os.getenv("SECRET_KEY", "").strip()
    candidate = env_key or (configured_key or "").strip()
    if candidate and candidate != _INSECURE_DEFAULT_SECRET:
        return candidate

    secret_file = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", ".jwt_secret")
    )
    try:
        os.makedirs(os.path.dirname(secret_file), exist_ok=True)
        if os.path.exists(secret_file):
            with open(secret_file, "r", encoding="utf-8") as f:
                saved = f.read().strip()
                if len(saved) >= 32:
                    return saved
        generated = secrets.token_hex(32)
        with open(secret_file, "w", encoding="utf-8") as f:
            f.write(generated)
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
        return generated
    except Exception:
        return secrets.token_hex(32)


class Settings(BaseSettings):
    """Configuración central de GeoFull V4-Clean backend."""

    PROJECT_NAME: str = "GeoFull V4 API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 1  # 24 horas por defecto (antes 7 días)

    # Configuración PostgreSQL / PostGIS (Admin / Migraciones)
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgis_secure_pass_2026")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5433")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "geofull_v4")

    # Usuario de Aplicación (No-Superuser para Aislamiento RLS Estricto)
    POSTGRES_APP_USER: str = os.getenv("POSTGRES_APP_USER", "geofull_app")
    POSTGRES_APP_PASSWORD: str = os.getenv("POSTGRES_APP_PASSWORD", "geofull_app_secure_pass_2026")

    # Configuración Google OAuth 2.0 & Dominio
    # Sin valor, el login con Google rechaza todos los tokens (aud no coincide)
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "jchorestrepo@gmail.com")
    SUPER_ADMIN_EMAILS: str = os.getenv("SUPER_ADMIN_EMAILS", "jchorestrepo@gmail.com,jchorestrepo611@gmail.com,mateoyaleja88@gmail.com")
    PUBLIC_DOMAIN: str = os.getenv("PUBLIC_DOMAIN", "sur.geofull.space")

    # Entorno de ejecución: "development" habilita atajos de prueba
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    ENABLE_DOCS: bool = os.getenv("ENABLE_DOCS", "false").strip().lower() == "true"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "development"

    @property
    def super_admin_emails_list(self) -> list:
        # Permite configurar múltiples correos separados por comas
        raw = f"{self.SUPER_ADMIN_EMAIL},{self.SUPER_ADMIN_EMAILS}"
        return list({e.strip().lower() for e in raw.split(",") if e.strip()})

    @property
    def ADMIN_DATABASE_URL(self) -> str:
        """URL de conexión administrativa con superusuario para migraciones DDL."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DATABASE_URL(self) -> str:
        """URL de conexión de la aplicación (usuario geofull_app con RLS estricto)."""
        user = self.POSTGRES_APP_USER or self.POSTGRES_USER
        password = self.POSTGRES_APP_PASSWORD or self.POSTGRES_PASSWORD
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
settings.SECRET_KEY = _resolve_secret_key(settings.SECRET_KEY)


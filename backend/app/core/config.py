import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración central de GeoFull V4-Clean backend."""

    PROJECT_NAME: str = "GeoFull V4 API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "geofull_v4_secret_key_change_in_production_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Configuración PostgreSQL / PostGIS
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgis_secure_pass_2026")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5433")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "geofull_v4")

    # Configuración Google OAuth 2.0 & Dominio
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "1047648392019-demo.apps.googleusercontent.com")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "jchorestrepo@gmail.com")
    SUPER_ADMIN_EMAILS: str = os.getenv("SUPER_ADMIN_EMAILS", "jchorestrepo@gmail.com")
    PUBLIC_DOMAIN: str = os.getenv("PUBLIC_DOMAIN", "dx.geofull.space")

    @property
    def super_admin_emails_list(self) -> list:
        # Permite configurar múltiples correos separados por comas
        raw = f"{self.SUPER_ADMIN_EMAIL},{self.SUPER_ADMIN_EMAILS}"
        return list({e.strip().lower() for e in raw.split(",") if e.strip()})

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

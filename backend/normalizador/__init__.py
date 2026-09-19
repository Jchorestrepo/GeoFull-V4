"""Motor de normalización de direcciones urbanas del Valle de Aburrá."""

VERSION_MOTOR = "1.0.0"

from normalizador.motor import normalizar, normalizar_lote  # noqa: E402

__all__ = ["VERSION_MOTOR", "normalizar", "normalizar_lote"]

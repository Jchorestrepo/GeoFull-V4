"""Configuración del motor, leída de variables de entorno."""

import os
from dataclasses import dataclass
from pathlib import Path

PAQUETE = Path(__file__).parent


@dataclass(frozen=True)
class Config:
    tipo_carrera: str = "CR"
    umbral_ok: float = 0.85
    ruta_alias: Path = PAQUETE / "datos" / "alias_medellin.yaml"
    ruta_modelo_crf: Path = PAQUETE / "modelos" / "crf.crfsuite"


def cargar_config() -> Config:
    tipo = os.environ.get("NORMALIZADOR_TIPO_CARRERA", "CR").upper()
    if tipo not in ("CR", "KR"):
        raise ValueError(f"NORMALIZADOR_TIPO_CARRERA debe ser CR o KR, no {tipo!r}")
    base = Config()
    return Config(
        tipo_carrera=tipo,
        umbral_ok=float(os.environ.get("NORMALIZADOR_UMBRAL_OK", base.umbral_ok)),
        ruta_alias=Path(os.environ.get("NORMALIZADOR_ALIAS", base.ruta_alias)),
        ruta_modelo_crf=Path(os.environ.get("NORMALIZADOR_MODELO_CRF", base.ruta_modelo_crf)),
    )

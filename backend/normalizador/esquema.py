"""Esquema de salida del motor."""

from enum import StrEnum

from pydantic import BaseModel, Field


class Estado(StrEnum):
    OK = "OK"
    PARCIAL = "PARCIAL"
    FALLO = "FALLO"


class Motivo(StrEnum):
    RURAL = "RURAL"
    SIN_NOMENCLATURA = "SIN_NOMENCLATURA"
    VACIA = "VACIA"


class Componentes(BaseModel):
    via_tipo: str | None = None
    via_numero: int | None = None
    via_letra: str | None = None
    via_bis: bool = False
    via_cuadrante: str | None = None
    cruce_tipo: str | None = None
    cruce_numero: int | None = None
    cruce_letra: str | None = None
    cruce_bis: bool = False
    cruce_cuadrante: str | None = None
    placa: str | None = None


class Resultado(BaseModel):
    entrada: str
    direccion: str | None = None
    clave: str | None = None
    componentes: Componentes = Field(default_factory=Componentes)
    estado: Estado
    motivo: Motivo | None = None
    confianza: float = 0.0
    metodo: str | None = None
    advertencias: list[str] = Field(default_factory=list)
    version_motor: str

    @property
    def requiere_revision(self) -> bool:
        return self.estado == Estado.PARCIAL or self.motivo == Motivo.SIN_NOMENCLATURA

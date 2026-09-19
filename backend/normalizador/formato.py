"""Texto legible y clave de deduplicación a partir de los componentes."""

import re

from normalizador.esquema import Componentes


def _tipo(tipo: str | None, tipo_carrera: str) -> str:
    if tipo == "CR":
        return tipo_carrera
    return tipo or ""


def _eje(numero: int | None, letra: str | None, bis: bool, cuadrante: str | None) -> str:
    partes = [f"{numero}{letra or ''}"]
    if bis:
        partes.append("BIS")
    if cuadrante:
        partes.append(cuadrante)
    return " ".join(partes)


def legible(c: Componentes, tipo_carrera: str = "CR") -> str | None:
    """`CL 20B SUR # 38 - 06`, `CL 10 X CR 43`."""
    if not c.via_tipo or c.via_numero is None:
        return None
    via = f"{_tipo(c.via_tipo, tipo_carrera)} {_eje(c.via_numero, c.via_letra, c.via_bis, c.via_cuadrante)}"
    if c.cruce_numero is None:
        return via
    cruce = _eje(c.cruce_numero, c.cruce_letra, c.cruce_bis, c.cruce_cuadrante)
    if c.placa is not None:
        return f"{via} # {cruce} - {c.placa}"
    if c.cruce_tipo:
        return f"{via} X {_tipo(c.cruce_tipo, tipo_carrera)} {cruce}"
    return f"{via} # {cruce}"


def clave(c: Componentes, tipo_carrera: str = "CR") -> str | None:
    """`CL20BSUR3806`: el texto legible sin espacios ni símbolos."""
    texto = legible(c, tipo_carrera)
    return re.sub(r"[\s#\-]", "", texto) if texto else None

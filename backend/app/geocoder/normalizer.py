from dataclasses import dataclass
from typing import Optional

from normalizador.esquema import Componentes, Estado, Resultado


@dataclass
class NormalizedAddress:
    """Estructura estandarizada compatible 100% con PostGIS Nomenclatura Domiciliaria."""
    codigo_via: Optional[str] = None       # 'CL', 'CR', 'TV', 'DG', 'CQ'
    numero_via: Optional[int] = None
    apendice_via: str = ""                # 'A', 'B', 'AA', etc.
    orientacion_via: Optional[str] = None  # 'SUR', 'ESTE'
    via_generadora: Optional[int] = None
    apendice_generadora: str = ""         # 'A', 'B', 'D', etc.
    numero_casa: Optional[int] = None
    via_db: Optional[str] = None           # 'CL 104B' (Formato PostGIS)
    placa_db: Optional[str] = None         # '46A-32' (Formato PostGIS)
    direccion_db: Optional[str] = None     # 'CL 104B 46A-32'
    raw_input: str = ""


def _eje(numero: int, letra: Optional[str], bis: bool, cuadrante: Optional[str]) -> str:
    partes = [f"{numero}{letra or ''}"]
    if bis:
        partes.append("BIS")
    if cuadrante:
        partes.append(cuadrante)
    return " ".join(partes)


def desde_resultado(resultado: Resultado) -> Optional[NormalizedAddress]:
    """
    Adapta la salida del motor `normalizador` al formato de búsqueda del catastro PostGIS
    (via = 'CL 20B SUR', placa = '38-06' o '18AA SUR-160').
    """
    if resultado.estado == Estado.FALLO:
        return None
    c: Componentes = resultado.componentes
    if not c.via_tipo or c.via_numero is None:
        return None

    via_db = f"{c.via_tipo} {_eje(c.via_numero, c.via_letra, c.via_bis, c.via_cuadrante)}"
    placa_db = None
    numero_casa = None
    if c.cruce_numero is not None and c.placa is not None:
        placa_db = f"{_eje(c.cruce_numero, c.cruce_letra, c.cruce_bis, c.cruce_cuadrante)}-{c.placa}"
        digitos = "".join(ch for ch in c.placa if ch.isdigit())
        numero_casa = int(digitos) if digitos else None

    return NormalizedAddress(
        codigo_via=c.via_tipo,
        numero_via=c.via_numero,
        apendice_via=c.via_letra or "",
        orientacion_via=c.via_cuadrante,
        via_generadora=c.cruce_numero,
        apendice_generadora=c.cruce_letra or "",
        numero_casa=numero_casa,
        via_db=via_db,
        placa_db=placa_db,
        direccion_db=f"{via_db} {placa_db}" if placa_db else via_db,
        raw_input=resultado.entrada,
    )

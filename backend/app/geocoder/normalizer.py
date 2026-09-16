import re
from dataclasses import dataclass
from typing import Optional


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


SINONIMOS_VIA = {
    "CALLE": "CL", "CLL": "CL", "CL": "CL", "C": "CL", "KALLE": "CL", "CALL": "CL", "CLLE": "CL",
    "CARRERA": "CR", "CRA": "CR", "CR": "CR", "KR": "CR", "KRA": "CR", "K": "CR", "KARRERA": "CR", "CRR": "CR",
    "TRANSVERSAL": "TV", "TRANSV": "TV", "TRANS": "TV", "TV": "TV", "TR": "TV",
    "DIAGONAL": "DG", "DIAG": "DG", "DG": "DG",
    "CIRCULAR": "CQ", "CIRC": "CQ", "CQ": "CQ",
    "AVENIDA": "AV", "AV": "AV"
}

# Regex Estándar con letras en vía y en generadora
# Ejemplos: "CALLE 104B # 46A-32", "CARRERA 24B # 98-21", "CALLE 69 # 51D-27"
RE_ESTANDAR = re.compile(
    r'(?i)^\s*(?P<tipo>CALLE|CARRERA|CRA|CR|KR|KRA|K|CL|CLL|TRANSVERSAL|TV|TR|DIAGONAL|DG|CIRCULAR|CQ)\.?\s*'
    r'(?P<num_via>\d+)\s*'
    r'(?P<ap_via>[A-Za-z]{1,2})?\s*'
    r'(?P<ori_via>SUR|ESTE|OESTE)?\s*'
    r'(?:#|nro|no|num|con|esquina)?\s*'
    r'(?P<gen>\d+)\s*'
    r'(?P<ap_gen>[A-Za-z]{1,2})?\s*'
    r'(?P<ori_gen>SUR|ESTE|OESTE)?\s*'
    r'[-_\s/]?\s*'
    r'(?P<casa>\d+)\b'
)

# Regex Esquina / Intersección ("Carrera 43A con Calle 10")
RE_ESQUINA = re.compile(
    r'(?i)^\s*(?P<tipo>CALLE|CARRERA|CRA|CR|KR|KRA|K|CL|CLL|TRANSVERSAL|TV|TR|DIAGONAL|DG|CIRCULAR|CQ)\.?\s*'
    r'(?P<num_via>\d+)\s*'
    r'(?P<ap_via>[A-Za-z]{1,2})?\s*'
    r'(?:con|esquina)\s+'
    r'(?:(?P<tipo_cruce>CALLE|CARRERA|CRA|CR|KR|KRA|K|CL|CLL|TRANSVERSAL|TV|TR|DIAGONAL|DG|CIRCULAR|CQ)\s+)?'
    r'(?P<gen>\d+)\s*'
    r'(?P<ap_gen>[A-Za-z]{1,2})?\b'
)


def normalize_address(raw_text: str) -> Optional[NormalizedAddress]:
    """
    Convierte la dirección limpia al formato exacto para búsquedas PostGIS.
    """
    if not raw_text or not raw_text.strip():
        return None

    texto = raw_text.upper().strip()

    # 1. Intento con Expresión Regular Estándar
    match = RE_ESTANDAR.search(texto)
    if match:
        tipo_raw = match.group("tipo").upper()
        codigo_via = SINONIMOS_VIA.get(tipo_raw, "CL")
        num_via = int(match.group("num_via"))
        ap_via = (match.group("ap_via") or "").upper()
        ori_via = (match.group("ori_via") or "").upper()

        gen = int(match.group("gen"))
        ap_gen = (match.group("ap_gen") or "").upper()
        casa = int(match.group("casa"))

        via_db = f"{codigo_via} {num_via}{ap_via}".strip()
        if ori_via:
            via_db += f" {ori_via}"

        placa_db = f"{gen}{ap_gen}-{casa}".strip()
        direccion_db = f"{via_db} {placa_db}"

        return NormalizedAddress(
            codigo_via=codigo_via,
            numero_via=num_via,
            apendice_via=ap_via,
            orientacion_via=ori_via or None,
            via_generadora=gen,
            apendice_generadora=ap_gen,
            numero_casa=casa,
            via_db=via_db,
            placa_db=placa_db,
            direccion_db=direccion_db,
            raw_input=raw_text
        )

    # 2. Intento de Esquina / Intersección
    match_esq = RE_ESQUINA.search(texto)
    if match_esq:
        tipo_raw = match_esq.group("tipo").upper()
        codigo_via = SINONIMOS_VIA.get(tipo_raw, "CL")
        num_via = int(match_esq.group("num_via"))
        ap_via = (match_esq.group("ap_via") or "").upper()

        gen = int(match_esq.group("gen"))
        ap_gen = (match_esq.group("ap_gen") or "").upper()

        via_db = f"{codigo_via} {num_via}{ap_via}".strip()
        placa_db = f"{gen}{ap_gen}-01".strip()
        direccion_db = f"{via_db} {placa_db}"

        return NormalizedAddress(
            codigo_via=codigo_via,
            numero_via=num_via,
            apendice_via=ap_via,
            via_generadora=gen,
            apendice_generadora=ap_gen,
            numero_casa=1,
            via_db=via_db,
            placa_db=placa_db,
            direccion_db=direccion_db,
            raw_input=raw_text
        )

    # 3. Fallback Flexible: Extracción de los 3 primeros números si fallan expresiones complejas
    numbers = re.findall(r"\d+", texto)
    if len(numbers) >= 2:
        num_via = int(numbers[0])
        gen = int(numbers[1])
        casa = int(numbers[2]) if len(numbers) >= 3 else 1
        words = texto.split()
        tipo_raw = words[0].upper() if words else "CL"
        codigo_via = SINONIMOS_VIA.get(tipo_raw, "CL")

        via_db = f"{codigo_via} {num_via}"
        placa_db = f"{gen}-{casa}"
        direccion_db = f"{via_db} {placa_db}"

        return NormalizedAddress(
            codigo_via=codigo_via,
            numero_via=num_via,
            via_generadora=gen,
            numero_casa=casa,
            via_db=via_db,
            placa_db=placa_db,
            direccion_db=direccion_db,
            raw_input=raw_text
        )

    return None

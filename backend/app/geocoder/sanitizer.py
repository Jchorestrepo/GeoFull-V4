import re
from dataclasses import dataclass
from typing import Tuple


@dataclass
class SanitizedAddress:
    """Resultado del pre-limpiador de direcciones (Etapa 1A - Algoritmo V3)."""
    direccion_original: str
    direccion_nucleo: str
    observaciones_entrega: str


MAPA_VIAS_SINONIMOS = {
    "karrera": "CARRERA", "carerra": "CARRERA", "crrera": "CARRERA", "carrrera": "CARRERA",
    "carre": "CARRERA", "carra": "CARRERA", "carrera": "CARRERA",
    "carr": "CARRERA", "cra": "CARRERA", "crr": "CARRERA",
    "kra": "CARRERA", "krr": "CARRERA", "kr": "CARRERA", "cr": "CARRERA",
    "kalle": "CALLE", "callé": "CALLE", "calle": "CALLE", "call": "CALLE",
    "clle": "CALLE", "ecll": "CALLE", "cll": "CALLE", "kll": "CALLE", "cl": "CALLE",
    "avenida": "AVENIDA", "avda": "AVENIDA", "ave": "AVENIDA", "av": "AVENIDA",
    "transversal": "TRANSVERSAL", "transv": "TRANSVERSAL", "trans": "TRANSVERSAL", "tv": "TRANSVERSAL",
    "diagonal": "DIAGONAL", "diag": "DIAGONAL", "dg": "DIAGONAL",
    "circular": "CIRCULAR", "circ": "CIRCULAR", "cq": "CIRCULAR",
    "autopista": "AUTOPISTA", "via": "VIA", "vía": "VIA"
}

CITY_NOISE = r'(?i)\b(colombia|antioquia|medellin|bello|envigado|itagui|itagüí|sabaneta|la estrella|caldas|rionegro)\b'
OBSERVATION_PATTERNS = [
    r'\bcel(?:ular)?\b\s*\d*', r'\bapto?\b\.?\s*\w+', r'\bpiso\b\s*\d+', r'\btorre\b\s*\w+',
    r'\bbloque\b\s*\w+', r'\bint(?:erior)?\s*\(?\d+\)?', r'\blocal\b\s*\d+',
    r'\bof(?:icina)?\b\s*\d+', r'\bbarrio\b\s+[\w\s]+', r'\burbanizaci[oó]n\b\s+[\w\s]+',
    r'\bconjunto\b\s+[\w\s]+', r'\bedificio\b\s+[\w\s]+', r'\bcasa\s+de\s+\d+\s+pisos\b',
    r'\bcasa\b\s*\d+', r'\bsegundo\s+piso\b', r'\bprimer\s+piso\b', r'\btercer\s+piso\b'
]
PHONE_PATTERN = r'\b3\d{9}\b'


def clean_address_text(raw_text: str) -> Tuple[str, str]:
    """
    Algoritmo de Sanitización Avanzado V3 Refinado:
    Limpia ruido de ciudad, duplicados de vía, tipografía errónea, puntos en placas y
    separa las observaciones de entrega del núcleo de la dirección.
    """
    if not raw_text or not raw_text.strip():
        return "", ""

    texto = str(raw_text).strip()
    observaciones = []

    # 1. Extraer teléfonos (celulares 3xx...)
    phones = re.findall(PHONE_PATTERN, texto)
    if phones:
        for p in phones:
            observaciones.append(f"Tel: {p}")
            texto = texto.replace(p, "")

    # 2. Separar patrones int(116) o int116 pegados a la dirección (ej: 32-100int(116))
    texto = re.sub(r'(?i)(\d+)\s*(int(?:erior)?\s*\(?\d+\)?)', r'\1 \2', texto)

    # 3. Extraer observaciones estructuradas (apto, interior, piso, barrio, cel)
    for pat in OBSERVATION_PATTERNS:
        matches = re.findall(pat, texto, flags=re.IGNORECASE)
        for m in matches:
            obs_clean = m.strip()
            if obs_clean and obs_clean.lower() != 'cel':
                observaciones.append(obs_clean)
            texto = re.sub(re.escape(m), "", texto, flags=re.IGNORECASE)

    # 4. Remover ruido de ciudades / departamentos
    texto = re.sub(CITY_NOISE, "", texto)

    # 5. Limpieza de puntuación y signos pegados
    texto = re.sub(r'°', '', texto)
    texto = re.sub(r'[:,]', ' ', texto)

    # 6. Normalizar nombres de vía y corregir duplicados ("Calle Calle", "Carrera carrera")
    via_pattern = '|'.join(MAPA_VIAS_SINONIMOS.keys())
    texto = re.sub(r'(?i)\b(' + via_pattern + r')\s+(' + via_pattern + r')\b', r'\1', texto)
    texto = re.sub(r'(?i)\b(' + via_pattern + r')\s+(\d+\s*[a-z]{0,2})\s+(?:\1\s+\2\b)+', r'\1 \2', texto)

    # 7. Despejar letras pegadas a tipos de vía ("cll71" -> "cll 71", "Calle99." -> "Calle 99")
    texto = re.sub(r'(?i)\b(' + via_pattern + r')\s*(\d+)\.?', r'\1 \2', texto)

    # 8. Corregir errores típicos de caracteres (#ll0 -> #110, 5o -> 50)
    texto = re.sub(r'#\s*[lL]{2}(\d+)', r'# 11\1', texto)
    texto = re.sub(r'#\s*[lL](\d+)', r'# 1\1', texto)
    texto = re.sub(r'(\d+)[oO]\b', r'\g<1>0', texto)

    # 9. Reemplazar 'nro', 'no', 'num', '#' pegados por espacios limpios
    texto = re.sub(r'\b(n|nr|nro|no|num)\.?\s*(\d+)', r'# \2', texto, flags=re.IGNORECASE)
    texto = re.sub(r'#', ' # ', texto)

    # 10. Puntos en placas (#98.21 -> #98-21, 51d.-68 -> 51D-68)
    texto = re.sub(r'#\s*(\d+[a-zA-Z]{0,2})\.(\d+)', r'# \1-\2', texto)
    texto = re.sub(r'(\d+[a-zA-Z]{1,2})\.\s*(-|\#|\s*\d+)', r'\1 \2', texto)

    # 11. Despejar guiones y espacios entre número, letra y casa
    texto = re.sub(r'(\d+)\s*-\s*([a-zA-Z]{1,2})\s*(\d+)', r'\1\2-\3', texto)
    texto = re.sub(r'\b(\d+)([a-zA-Z]{1,2})(\d{1,3})\b', r'\1\2-\3', texto)

    # 12. Limpieza de espacios finales y caracteres huérfanos
    texto = re.sub(r'\s+', ' ', texto).strip()
    texto = re.sub(r'^[^\w]+|[^\w]+$', '', texto)

    obs_str = " | ".join(observaciones)
    return texto, obs_str


def sanitize_address(raw_address: str) -> SanitizedAddress:
    """
    Punto de entrada principal para Etapa 1A (Sanitizer).
    """
    nucleo, obs = clean_address_text(raw_address)
    return SanitizedAddress(
        direccion_original=raw_address or "",
        direccion_nucleo=nucleo or raw_address or "",
        observaciones_entrega=obs or ""
    )

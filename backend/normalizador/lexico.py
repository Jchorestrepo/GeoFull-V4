"""Léxico: sinónimos de tipos de vía, marcadores, cuadrantes y palabras rurales."""

import re
from functools import lru_cache

TIPOS_VIA: dict[str, str] = {
    # Calle
    "calle": "CL", "calles": "CL", "cll": "CL", "cl": "CL", "cal": "CL", "call": "CL", "clle": "CL",
    "cale": "CL", "calel": "CL", "clll": "CL", "cle": "CL", "caller": "CL",
    # Carrera
    "carrera": "CR", "carreras": "CR", "k": "CR", "cra": "CR", "cr": "CR", "kr": "CR", "kra": "CR", "krr": "CR",
    "crr": "CR", "crra": "CR", "carr": "CR", "carra": "CR", "cara": "CR", "crar": "CR",
    "kar": "CR", "car": "CR", "cta": "CR", "karrera": "CR", "cre": "CR", "carerra": "CR", "carera": "CR",
    # Transversal, diagonal, circular
    "transversal": "TV", "tv": "TV", "trans": "TV", "transv": "TV", "tr": "TV", "trv": "TV", "tranv": "TV",
    "tranversal": "TV", "diagonal": "DG", "dg": "DG", "diag": "DG", "dig": "DG", "dgl": "DG",
    "circular": "CQ", "cq": "CQ", "circ": "CQ", "cir": "CQ", "cqr": "CQ",
    # Avenidas y autopistas: se resuelven a CL/CR cuando van acompañadas
    "avenida": "AV", "av": "AV", "avda": "AV", "ave": "AV", "avd": "AV",
    "ak": "AK", "ac": "AC",
    "autopista": "AU", "au": "AU", "aut": "AU",
}

FORMAS_LARGAS = {"calle": "CL", "carrera": "CR", "transversal": "TV", "diagonal": "DG", "circular": "CQ", "avenida": "AV", "autopista": "AU"}

TIPOS_FINALES = {"CL", "CR", "TV", "DG", "CQ"}

MARCADORES_NUMERO = {"#", "no", "nro", "nr", "num", "numero", "nu", "n", "numeral", "nmr", "nmro", "numer", "nume", "numro", "nro", "nor"}
CONECTORES_CRUCE = {"x", "con", "por", "entre", "esquina", "esq", "cruce"}
CUADRANTES = {"sur": "SUR", "su": "SUR", "este": "ESTE", "est": "ESTE"}
BIS = {"bis"}

PALABRAS_RURALES = {"km", "kilometro", "kilometros", "vereda", "vda", "corregimiento", "corr", "finca", "parcela", "parcelacion", "hacienda"}

# Indican que el número no es la placa exacta: "cerca al 41-20". "FRENTE 41-20" sí se acepta (revisión del set real).
PALABRAS_REFERENCIA = {"cerca", "lado", "detras", "aprox", "aproximadamente", "diagonal", "despues", "antes", "arriba", "abajo"}
# Cuadrantes que no existen en la nomenclatura del Valle de Aburrá (sí en Cali o Bogotá).
CUADRANTES_AJENOS = {"norte", "oeste", "occidente", "oriente"}

PALABRAS_PISO = {"piso", "pisos", "p", "er", "do", "ro", "to", "nivel", "planta"}

RE_LETRA = re.compile(r"^[a-hs]{1,3}$")


def damerau(a: str, b: str) -> int:
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        d[i][0] = i
    for j in range(len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            costo = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


@lru_cache(maxsize=4096)
def tipo_via(palabra: str) -> tuple[str, bool] | None:
    """Código del tipo de vía y si se reconoció por similitud (typo)."""
    if palabra in TIPOS_VIA:
        return TIPOS_VIA[palabra], False
    if len(palabra) >= 5 and palabra.isalpha():
        for forma, codigo in FORMAS_LARGAS.items():
            limite = 1 if len(forma) <= 6 else 2
            if abs(len(forma) - len(palabra)) <= limite and damerau(palabra, forma) <= limite:
                return codigo, True
    return None


def es_letra(palabra: str) -> bool:
    return bool(RE_LETRA.match(palabra))


def es_rural(palabras: list[str]) -> bool:
    return any(p in PALABRAS_RURALES for p in palabras)


def partir_letra_pegada(palabra: str) -> tuple[str, str] | None:
    """"bcra" -> ("b", "cra"), "asur" -> ("a", "sur"): letra de un eje pegada a la palabra siguiente."""
    for corte in range(1, min(3, len(palabra) - 2) + 1):
        letra, resto = palabra[:corte], palabra[corte:]
        if es_letra(letra) and len(resto) >= 2 and (resto in TIPOS_VIA or resto in ("sur", "este")):
            return letra, resto
    return None

"""Limpieza previa del texto libre: unicode, basura de formularios, correos, teléfonos."""

import re
import unicodedata

RE_TILDES_FORMULARIO = re.compile(r"~+")
RE_CORREO = re.compile(r"\S+@\S+")
RE_URL = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
RE_TELEFONO = re.compile(r"(?:\+?57[\s-]?)?\b(?:3\d{2}[\s-]?\d{3}[\s-]?\d{4}|60\d[\s-]?\d{3}[\s-]?\d{4})\b")
RE_PARENTESIS = re.compile(r"\(([^)]*)\)?")
RE_NUMERAL = re.compile(r"\bn\s*[°º]|[°º]", re.IGNORECASE)
RE_ESPACIOS = re.compile(r"\s+")
RE_O_POR_CERO = re.compile(r"(?<=[\d#-])o(?=\d)|(?<=-)o(?=\d)|(?<=- )o(?=\d)")
RE_CL_PARTIDO = re.compile(r"\bc\s*-\s*l\b")
RE_GUIONES = re.compile(r"-(?:\s*-)+")
RE_VACIA = re.compile(
    r"^(sin (registro|direccion|dato|informacion)|no (aplica|tiene|registra)|n/?a|null|none|ninguna?|nan|-+|\.+)$"
)


def quitar_tildes(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")


def limpiar(texto: str | None) -> tuple[str, list[str]]:
    """Devuelve el texto limpio en minúsculas sin tildes y la lista de fragmentos descartados."""
    descartes: list[str] = []
    t = unicodedata.normalize("NFKC", texto or "")

    # Formularios que concatenan "Antioquia~~~Medellin~~~~~~<dirección>": solo sirve el último tramo.
    if "~" in t:
        tramos = [p for p in RE_TILDES_FORMULARIO.split(t) if p.strip()]
        if tramos:
            t = tramos[-1]

    for patron in (RE_CORREO, RE_URL, RE_TELEFONO):
        for m in patron.finditer(t):
            descartes.append(m.group(0).strip())
        t = patron.sub(" ", t)

    for m in RE_PARENTESIS.finditer(t):
        if m.group(0).strip("() "):
            descartes.append(m.group(0).strip())
    t = RE_PARENTESIS.sub(" ", t)

    t = RE_NUMERAL.sub(" # ", t)
    t = quitar_tildes(t).lower()
    t = RE_O_POR_CERO.sub("0", t)
    t = RE_CL_PARTIDO.sub("cl", t)
    t = RE_GUIONES.sub("-", t)
    t = RE_ESPACIOS.sub(" ", t).strip()
    return t, descartes


def es_vacia(texto_limpio: str) -> bool:
    sin_signos = texto_limpio.strip(" .,;:-_")
    return not re.search(r"[a-z0-9]", sin_signos) or bool(RE_VACIA.match(sin_signos))

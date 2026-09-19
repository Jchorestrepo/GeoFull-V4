"""Diccionario de alias de vías (p. ej. "la 80" -> CR 80)."""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

from normalizador.limpieza import quitar_tildes

PREFIJOS_NOMBRE = ["avenida", "av", "avda", "ave", "calle", "cl", "cll", "carrera", "cr", "cra", "kr", "la"]
PENALIZACION_NO_VALIDADO = 0.05


@dataclass(frozen=True)
class Alias:
    patron: tuple[str, ...]
    tipo: str | None
    numero: int | None
    letra: str | None
    ambiguo: bool
    validado: bool
    nota: str | None


@lru_cache(maxsize=4)
def cargar_alias(ruta: Path) -> tuple[Alias, ...]:
    if not ruta.exists():
        return ()
    entradas = yaml.safe_load(ruta.read_text(encoding="utf-8")) or []
    alias: list[Alias] = []
    for e in entradas:
        via = e.get("via") or {}
        for prefijo in e.get("prefijos", PREFIJOS_NOMBRE):
            for nombre in e["nombres"]:
                patron = tuple(quitar_tildes(f"{prefijo} {nombre}").lower().split())
                alias.append(Alias(
                    patron=patron,
                    tipo=via.get("tipo"),
                    numero=via.get("numero"),
                    letra=via.get("letra"),
                    ambiguo=bool(e.get("ambiguo", False)),
                    validado=bool(e.get("validado", False)),
                    nota=e.get("nota"),
                ))
    # Patrones más largos primero para preferir "avenida el poblado" sobre "avenida poblado".
    return tuple(sorted(alias, key=lambda a: -len(a.patron)))


def buscar_alias(palabras: list[str], inicio: int, ruta: Path) -> Alias | None:
    for a in cargar_alias(ruta):
        fin = inicio + len(a.patron)
        if fin <= len(palabras) and tuple(palabras[inicio:fin]) == a.patron:
            return a
    return None


def buscar_alias_por_texto(texto: str, ruta: Path) -> Alias | None:
    patron = tuple(texto.split())
    for a in cargar_alias(ruta):
        if a.patron == patron:
            return a
    return None

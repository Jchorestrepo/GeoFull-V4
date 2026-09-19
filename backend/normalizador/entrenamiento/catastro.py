"""Carga el catastro de Medellín (GeoPackage) y lo convierte en componentes limpios.

Solo se usan filas con patrón estricto o cruces `X`. Se quitan interiores `(0102)`, `LOTE`, `LT`, `MJ`
y los tipos rurales `SR`/`Vda`. División train/val/test por comuna (`cbml[:2]`) para medir
generalización a comunas no vistas.
"""

import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

from normalizador.esquema import Componentes
from normalizador.formato import clave

RE_DIRECCION = re.compile(
    r"^(CL|CR|TV|DG|CQ) (\d+)([A-Z]{0,3})(?: (SUR|ESTE))? (\d+)([A-Z]{0,3})(?: (SUR|ESTE))?-(\d+)(?: \(\d+\))?(?: LOTE)?$"
)
RE_CRUCE = re.compile(
    r"^(CL|CR|TV|DG|CQ) (\d+)([A-Z]{0,3})(?: (SUR|ESTE))? X (CL|CR|TV|DG|CQ) (\d+)([A-Z]{0,3})(?: (SUR|ESTE))?\s+LT\b.*$"
)

COMUNAS_VALIDACION = {"09", "60"}
COMUNAS_PRUEBA = {"05", "14", "80"}


def parsear_catastro(direccion: str) -> Componentes | None:
    d = re.sub(r"\s+", " ", direccion.strip())
    if m := RE_DIRECCION.match(d):
        tipo, vn, vl, vc, cn, cl, cc, placa = m.groups()
        return Componentes(
            via_tipo=tipo, via_numero=int(vn), via_letra=vl or None, via_cuadrante=vc,
            cruce_numero=int(cn), cruce_letra=cl or None, cruce_cuadrante=cc, placa=placa,
        )
    if m := RE_CRUCE.match(direccion.strip()):
        tipo, vn, vl, vc, ct, cn, cl, cc = m.groups()
        return Componentes(
            via_tipo=tipo, via_numero=int(vn), via_letra=vl or None, via_cuadrante=vc,
            cruce_tipo=ct, cruce_numero=int(cn), cruce_letra=cl or None, cruce_cuadrante=cc,
        )
    return None


def particion(cbml: str | None) -> str:
    comuna = (cbml or "")[:2]
    if comuna in COMUNAS_PRUEBA:
        return "prueba"
    if comuna in COMUNAS_VALIDACION:
        return "validacion"
    return "entrenamiento"


def exportar(gpkg: Path, salida: Path) -> Counter:
    """Escribe un JSONL por partición en `salida/` y devuelve conteos."""
    salida.mkdir(parents=True, exist_ok=True)
    conexion = sqlite3.connect(gpkg)
    vistas: set[str] = set()
    conteo: Counter = Counter()
    archivos = {p: (salida / f"catastro_{p}.jsonl").open("w", encoding="utf-8") for p in ("entrenamiento", "validacion", "prueba")}
    try:
        for direccion, cbml in conexion.execute("SELECT direccion, cbml FROM nomenclatura_domiciliaria"):
            if not direccion:
                conteo["vacia"] += 1
                continue
            componentes = parsear_catastro(direccion)
            if componentes is None:
                conteo["descartada"] += 1
                continue
            k = clave(componentes)
            if k in vistas:
                conteo["duplicada"] += 1
                continue
            vistas.add(k)
            p = particion(cbml)
            conteo[p] += 1
            archivos[p].write(json.dumps(componentes.model_dump(exclude_defaults=True), ensure_ascii=False) + "\n")
    finally:
        for f in archivos.values():
            f.close()
        conexion.close()
    return conteo


def leer(ruta: Path) -> list[Componentes]:
    with ruta.open(encoding="utf-8") as f:
        return [Componentes(**json.loads(linea)) for linea in f]

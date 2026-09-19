"""Lectura tolerante de archivos de muestras reales."""

import csv
from pathlib import Path


def leer_columna(ruta: Path, columna: str | int = 0) -> list[str]:
    """Lee una columna de un CSV. Si las filas traen comas sin comillas, une las celdas sobrantes."""
    with ruta.open(encoding="utf-8-sig", newline="") as f:
        filas = list(csv.reader(f))
    if not filas:
        return []
    encabezado, datos = filas[0], filas[1:]
    if isinstance(columna, str) and not columna.isdigit():
        indice = encabezado.index(columna)
        return [fila[indice] if indice < len(fila) else "" for fila in datos]
    indice = int(columna)
    if len(encabezado) == 1:
        return [", ".join(c.strip() for c in fila) for fila in datos if fila]
    return [fila[indice] if indice < len(fila) else "" for fila in datos]

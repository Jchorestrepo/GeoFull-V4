"""CLI del normalizador."""

import csv
import json
import random
from pathlib import Path

import typer

from normalizador.config import cargar_config
from normalizador.entrenamiento.muestras import leer_columna
from normalizador.esquema import Componentes, Estado, Resultado
from normalizador.motor import normalizar

app = typer.Typer(help="Normalizador de direcciones urbanas del Valle de Aburrá.", no_args_is_help=True)

CAMPOS_SALIDA = ["entrada", "direccion", "clave", "estado", "motivo", "confianza", "metodo", "advertencias", "version_motor", *Componentes.model_fields]
CAMPOS_GOLDEN = ["entrada", "fuente", "motor_direccion", "motor_estado", "motor_confianza", "motor_advertencias", "direccion_esperada", "revisado", "notas"]


def _fila(r: Resultado) -> dict[str, object]:
    fila = r.model_dump(mode="json", exclude={"componentes"})
    fila["advertencias"] = " | ".join(r.advertencias)
    fila.update(r.componentes.model_dump())
    return fila


@app.command()
def texto(direccion: str) -> None:
    """Normaliza una dirección y la imprime como JSON."""
    typer.echo(json.dumps(normalizar(direccion).model_dump(mode="json"), ensure_ascii=False, indent=2))


@app.command("normalizar")
def normalizar_archivo(
    archivo: Path = typer.Argument(..., exists=True, help="CSV de entrada"),
    columna: str = typer.Option("0", help="Nombre o índice de la columna con la dirección"),
    salida: Path = typer.Option(Path("salidas"), help="Carpeta de salida"),
) -> None:
    """Genera `salida.csv` con todos los resultados y `revision.csv` con los que requieren revisión humana."""
    cfg = cargar_config()
    textos = leer_columna(archivo, columna)
    salida.mkdir(parents=True, exist_ok=True)
    conteo: dict[str, int] = {}
    with (salida / "salida.csv").open("w", encoding="utf-8", newline="") as fs, (salida / "revision.csv").open("w", encoding="utf-8", newline="") as fr:
        todos = csv.DictWriter(fs, CAMPOS_SALIDA)
        revision = csv.DictWriter(fr, [*CAMPOS_SALIDA, "direccion_corregida"])
        todos.writeheader()
        revision.writeheader()
        for t in textos:
            r = normalizar(t, cfg)
            conteo[r.estado.value] = conteo.get(r.estado.value, 0) + 1
            todos.writerow(_fila(r))
            if r.requiere_revision:
                revision.writerow({**_fila(r), "direccion_corregida": ""})
    typer.echo(f"{len(textos)} direcciones: {conteo}. Resultados en {salida}/salida.csv y {salida}/revision.csv")


@app.command("importar-correcciones")
def importar_correcciones(
    revision: Path = typer.Argument(..., exists=True, help="revision.csv con la columna direccion_corregida llena"),
    golden: Path = typer.Option(Path("samples/golden_real.csv")),
) -> None:
    """Agrega las filas corregidas a mano al set de prueba real. `direccion_corregida` = `-` si no es dirección completa."""
    existentes = set()
    if golden.exists():
        with golden.open(encoding="utf-8", newline="") as f:
            existentes = {fila["entrada"] for fila in csv.DictReader(f)}
    nuevas = 0
    with revision.open(encoding="utf-8", newline="") as f, golden.open("a", encoding="utf-8", newline="") as g:
        escritor = csv.DictWriter(g, CAMPOS_GOLDEN)
        if not existentes:
            escritor.writeheader()
        for fila in csv.DictReader(f):
            corregida = (fila.get("direccion_corregida") or "").strip()
            if not corregida or fila["entrada"] in existentes:
                continue
            escritor.writerow({
                "entrada": fila["entrada"], "fuente": revision.name,
                "motor_direccion": fila["direccion"], "motor_estado": fila["estado"], "motor_confianza": fila["confianza"],
                "motor_advertencias": fila["advertencias"],
                "direccion_esperada": "" if corregida == "-" else corregida, "revisado": "si", "notas": "",
            })
            existentes.add(fila["entrada"])
            nuevas += 1
    typer.echo(f"{nuevas} correcciones agregadas a {golden}")


@app.command("preparar-golden")
def preparar_golden(
    salida: Path = typer.Option(Path("samples/golden_real.csv")),
    n_raw: int = typer.Option(300),
    n_abiertos: int = typer.Option(200),
    semilla: int = typer.Option(42),
) -> None:
    """Pre-etiqueta un set de prueba real para revisión manual (todas las no OK de raw.csv + muestra estratificada)."""
    if salida.exists():
        raise typer.BadParameter(f"{salida} ya existe; no se sobrescribe un set revisado a mano")
    cfg = cargar_config()
    rng = random.Random(semilla)
    filas: list[dict[str, object]] = []

    raw = [(t, normalizar(t, cfg)) for t in dict.fromkeys(leer_columna(Path("samples/raw.csv"), 0))]
    no_ok = [x for x in raw if x[1].estado != Estado.OK]
    ok = [x for x in raw if x[1].estado == Estado.OK]
    elegidas = no_ok + rng.sample(ok, max(0, n_raw - len(no_ok)))
    filas += [_fila_golden(t, "raw.csv", r) for t, r in elegidas]

    with Path("samples/valle_aburra_datos_abiertos.csv").open(encoding="utf-8", newline="") as f:
        por_fuente: dict[str, list[str]] = {}
        for fila in csv.DictReader(f):
            por_fuente.setdefault(fila["fuente"], []).append(fila["entrada"])
    total = sum(len(v) for v in por_fuente.values())
    for fuente, textos in por_fuente.items():
        k = max(5, round(n_abiertos * len(textos) / total))
        filas += [_fila_golden(t, fuente, normalizar(t, cfg)) for t in rng.sample(textos, min(k, len(textos)))]

    rng.shuffle(filas)
    with salida.open("w", encoding="utf-8", newline="") as f:
        escritor = csv.DictWriter(f, CAMPOS_GOLDEN)
        escritor.writeheader()
        escritor.writerows(filas)
    typer.echo(f"{len(filas)} filas en {salida}. Revise `direccion_esperada` y marque `revisado`=si.")


def _fila_golden(texto_entrada: str, fuente: str, r: Resultado) -> dict[str, object]:
    return {
        "entrada": texto_entrada, "fuente": fuente, "motor_direccion": r.direccion or "", "motor_estado": r.estado.value,
        "motor_confianza": r.confianza, "motor_advertencias": " | ".join(r.advertencias),
        "direccion_esperada": r.direccion if r.estado == Estado.OK else "", "revisado": "", "notas": "",
    }


@app.command("preparar-catastro")
def preparar_catastro(
    gpkg: Path = typer.Option(Path("data/nomenclatura_domiciliaria.gpkg"), exists=True),
    salida: Path = typer.Option(Path("data/preparado")),
) -> None:
    """Limpia el catastro y lo divide por comuna en entrenamiento/validación/prueba."""
    from normalizador.entrenamiento.catastro import exportar

    typer.echo(dict(exportar(gpkg, salida)))


@app.command()
def entrenar(
    datos: Path = typer.Option(Path("data/preparado")),
    modelo: Path = typer.Option(Path("normalizador/modelos/crf.crfsuite")),
    muestras: int = typer.Option(80_000),
) -> None:
    """Entrena el CRF de respaldo con direcciones sintéticas."""
    from normalizador.entrenamiento.entrenar_crf import entrenar as _entrenar

    typer.echo(_entrenar(datos, modelo, muestras))


@app.command()
def evaluar(
    golden: Path = typer.Option(Path("samples/golden_real.csv")),
    datos: Path = typer.Option(Path("data/preparado")),
    muestras: int = typer.Option(5000),
) -> None:
    """Precisión de OK y cobertura sobre el set real revisado y sobre sintéticos de comunas no vistas."""
    from normalizador.entrenamiento.evaluar import evaluar_golden, evaluar_sintetico

    cfg = cargar_config()
    if golden.exists():
        m = evaluar_golden(golden, cfg)
        typer.echo(m.reporte(f"real ({golden}, solo filas revisadas)") if m.total else f"{golden}: ninguna fila con revisado=si")
    if (datos / "catastro_prueba.jsonl").exists():
        typer.echo(evaluar_sintetico(datos, cfg, muestras).reporte("sintético, comunas de prueba"))


if __name__ == "__main__":
    app()

"""Métricas del motor: precisión de OK y cobertura (ver decisión Q24)."""

import csv
import random
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from normalizador import formato
from normalizador.config import Config
from normalizador.entrenamiento.catastro import leer
from normalizador.entrenamiento.corruptor import generar
from normalizador.esquema import Estado
from normalizador.motor import normalizar


def canonico(direccion: str | None) -> str | None:
    """Tolera guiones largos y espacios distintos en las direcciones escritas a mano."""
    if not direccion or not direccion.strip():
        return None
    d = direccion.replace("–", "-").replace("—", "-").upper()
    d = re.sub(r"\s*-\s*", " - ", d)
    d = re.sub(r"\s*#\s*", " # ", d)
    return re.sub(r"\s+", " ", d).strip()


@dataclass
class Metricas:
    total: int = 0
    esperadas_ok: int = 0
    ok: int = 0
    ok_correctas: int = 0
    estados: Counter = field(default_factory=Counter)
    metodos: Counter = field(default_factory=Counter)
    errores: list[tuple[str, str | None, str | None]] = field(default_factory=list)

    @property
    def precision_ok(self) -> float:
        return self.ok_correctas / self.ok if self.ok else 0.0

    @property
    def cobertura_ok(self) -> float:
        return self.ok / self.esperadas_ok if self.esperadas_ok else 0.0

    def registrar(self, entrada: str, esperado: str | None, resultado) -> None:
        esperado = canonico(esperado)
        self.total += 1
        self.estados[resultado.estado.value] += 1
        if esperado and " X " not in esperado:  # los cruces de vías son PARCIAL por diseño
            self.esperadas_ok += 1
        if resultado.estado == Estado.OK:
            self.ok += 1
            self.metodos[resultado.metodo] += 1
            if resultado.direccion == esperado:
                self.ok_correctas += 1
            else:
                self.errores.append((entrada, resultado.direccion, esperado))

    def reporte(self, titulo: str) -> str:
        lineas = [
            f"== {titulo}",
            f"total={self.total} esperadas_completas={self.esperadas_ok} estados={dict(self.estados)} metodos_ok={dict(self.metodos)}",
            f"precisión OK={self.precision_ok:.4f}  cobertura OK={self.cobertura_ok:.4f}",
        ]
        for entrada, obtenido, esperado in self.errores[:30]:
            lineas.append(f"  ERROR {entrada!r}: obtenido={obtenido} esperado={esperado}")
        return "\n".join(lineas)


def evaluar_sintetico(datos: Path, cfg: Config, muestras: int = 5000, semilla: int = 99) -> Metricas:
    rng = random.Random(semilla)
    componentes = leer(datos / "catastro_prueba.jsonl")
    m = Metricas()
    for c in rng.sample(componentes, min(muestras, len(componentes))):
        muestra = generar(rng, c)
        esperado = formato.legible(c, cfg.tipo_carrera) if c.placa is not None else None
        m.registrar(muestra.texto, esperado, normalizar(muestra.texto, cfg))
    return m


def evaluar_golden(ruta: Path, cfg: Config) -> Metricas:
    """CSV con columnas `entrada`, `direccion_esperada` (vacía si no es una dirección completa) y `revisado`."""
    m = Metricas()
    with ruta.open(encoding="utf-8", newline="") as f:
        for fila in csv.DictReader(f):
            if fila.get("revisado", "").strip().lower() not in ("si", "sí", "x", "1", "true"):
                continue
            esperado = fila["direccion_esperada"].strip() or None
            m.registrar(fila["entrada"], esperado, normalizar(fila["entrada"], cfg))
    return m

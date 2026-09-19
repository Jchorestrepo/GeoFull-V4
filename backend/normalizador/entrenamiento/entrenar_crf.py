"""Entrena el CRF con muestras sintéticas generadas desde el catastro."""

import random
from pathlib import Path

import pycrfsuite

from normalizador.crf import features
from normalizador.entrenamiento.catastro import leer
from normalizador.entrenamiento.corruptor import generar


def entrenar(datos: Path, modelo: Path, muestras: int = 80_000, semilla: int = 13, iteraciones: int = 150) -> dict:
    rng = random.Random(semilla)
    componentes = leer(datos / "catastro_entrenamiento.jsonl")
    entrenador = pycrfsuite.Trainer(verbose=False)
    for c in rng.choices(componentes, k=muestras):
        m = generar(rng, c)
        if m.tokens:
            entrenador.append(features(m.tokens), m.etiquetas)
    entrenador.set_params({"c1": 0.05, "c2": 0.01, "max_iterations": iteraciones, "feature.possible_transitions": True})
    modelo.parent.mkdir(parents=True, exist_ok=True)
    temporal = modelo.with_suffix(".tmp")
    entrenador.train(str(temporal))
    temporal.replace(modelo)
    return entrenador.logparser.last_iteration

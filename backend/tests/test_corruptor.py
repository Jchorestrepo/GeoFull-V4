import random
from pathlib import Path

import pytest

from normalizador import reglas
from normalizador.entrenamiento.corruptor import generar
from normalizador.esquema import Componentes

DATOS = Path(__file__).parents[1] / "data" / "preparado" / "catastro_prueba.jsonl"

COMPONENTES = [
    Componentes(via_tipo="CL", via_numero=20, via_letra="B", via_cuadrante="SUR", cruce_numero=38, placa="06"),
    Componentes(via_tipo="CR", via_numero=63, cruce_numero=54, cruce_cuadrante="SUR", placa="10"),
    Componentes(via_tipo="CR", via_numero=43, via_letra="A", cruce_numero=1, cruce_cuadrante="ESTE", placa="118"),
    Componentes(via_tipo="CL", via_numero=10, cruce_tipo="CR", cruce_numero=43),
]


def test_etiquetas_alineadas():
    rng = random.Random(0)
    for _ in range(300):
        m = generar(rng, rng.choice(COMPONENTES))
        assert len(m.tokens) == len(m.etiquetas)
        assert m.tokens, m.texto


@pytest.mark.skipif(not DATOS.exists(), reason="requiere data/preparado (normalizador preparar-catastro)")
def test_reglas_coinciden_con_oro(cfg):
    from normalizador.entrenamiento.catastro import leer

    rng = random.Random(1)
    componentes = leer(DATOS)
    iguales = 0
    for c in rng.sample(componentes, 500):
        m = generar(rng, c)
        a = reglas.etiquetar(m.tokens, cfg.ruta_alias)
        iguales += bool(a and a.etiquetas == m.etiquetas)
    assert iguales / 500 >= 0.97

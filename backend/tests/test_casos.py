from pathlib import Path

import pytest
import yaml

from normalizador import normalizar

CASOS = yaml.safe_load((Path(__file__).parent / "casos_reglas.yaml").read_text(encoding="utf-8"))


@pytest.mark.parametrize("caso", CASOS, ids=[c["entrada"][:40] or "<vacía>" for c in CASOS])
def test_caso(caso, cfg):
    r = normalizar(caso["entrada"], cfg)
    assert r.estado.value == caso["estado"], r.advertencias
    if "direccion" in caso:
        assert r.direccion == caso["direccion"], r.advertencias
    if "motivo" in caso:
        assert r.motivo is not None and r.motivo.value == caso["motivo"]


def test_clave_ignora_formato(cfg):
    a = normalizar("calle 45 a sur # 23 b - 5", cfg)
    b = normalizar("CLL45A SUR NRO 23B-05 apto 301", cfg)
    assert a.clave == b.clave == "CL45ASUR23B05"


def test_numeros_de_salida_existen_en_entrada(cfg):
    r = normalizar("Calle 104b #5077", cfg)
    assert str(r.componentes.via_numero) in r.entrada and str(r.componentes.cruce_numero) in r.entrada

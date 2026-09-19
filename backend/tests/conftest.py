import dataclasses
from pathlib import Path

import pytest

from normalizador.config import cargar_config


@pytest.fixture(scope="session")
def cfg():
    return cargar_config()


@pytest.fixture(scope="session")
def cfg_solo_reglas(cfg):
    return dataclasses.replace(cfg, ruta_modelo_crf=Path("/no/existe/crf.crfsuite"))

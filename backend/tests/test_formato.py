from normalizador.esquema import Componentes
from normalizador.formato import clave, legible
from normalizador.limpieza import limpiar
from normalizador.tokenizador import tokenizar


def test_legible_y_clave():
    c = Componentes(via_tipo="CR", via_numero=63, cruce_numero=54, cruce_cuadrante="SUR", placa="10")
    assert legible(c) == "CR 63 # 54 SUR - 10"
    assert legible(c, "KR") == "KR 63 # 54 SUR - 10"
    assert clave(c) == "CR6354SUR10"


def test_cruce_de_vias():
    c = Componentes(via_tipo="CL", via_numero=10, cruce_tipo="CR", cruce_numero=43)
    assert legible(c) == "CL 10 X CR 43"
    assert clave(c) == "CL10XCR43"


def test_tokenizador_separa_pegados():
    assert [t.texto for t in tokenizar("cll45#23-15")] == ["cll", "45", "#", "23", "-", "15"]
    assert [t.texto for t in tokenizar("103bcra50b")] == ["103", "b", "cra", "50", "b"]
    assert [t.texto for t in tokenizar("76asur")] == ["76", "a", "sur"]


def test_limpieza():
    limpio, descartes = limpiar("Antioquia~~~Medellin~~~~~~Cra 44 #95-62 (int 3) 3001234567 x@y.com")
    assert limpio == "cra 44 #95-62"
    assert "(int 3)" in descartes and "3001234567" in descartes

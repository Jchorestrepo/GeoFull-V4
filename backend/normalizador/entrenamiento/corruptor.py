"""Generador de direcciones sucias a partir de componentes correctos del catastro.

Cada muestra trae el texto sucio, los tokens del texto limpio y la etiqueta de cada token.
Los errores imitan los de `samples/raw.csv`: sinónimos, tipo repetido, números pegados,
letras separadas, `#` ausente o escrito como `No`, `SUR` como `S`, ceros, typos y ruido.
"""

import random
from dataclasses import dataclass

from normalizador import etiquetas as E
from normalizador.esquema import Componentes
from normalizador.limpieza import limpiar
from normalizador.tokenizador import Token, tokenizar

SINONIMOS = {
    "CL": [("calle", 30), ("Calle", 30), ("CL", 10), ("Cl", 5), ("cll", 8), ("Cll", 5), ("CLL", 4), ("Cl.", 3), ("clle", 1), ("call", 1)],
    "CR": [("carrera", 25), ("Carrera", 25), ("CR", 8), ("Cr", 5), ("cra", 10), ("Cra", 8), ("CRA", 5), ("Cra.", 4), ("kr", 2), ("Kra", 2), ("crr", 1), ("carrea", 1)],
    "TV": [("transversal", 5), ("Transversal", 5), ("TV", 5), ("tv", 3), ("Trans", 2), ("trv", 1)],
    "DG": [("diagonal", 5), ("Diagonal", 5), ("DG", 5), ("dg", 3), ("Diag", 2)],
    "CQ": [("circular", 5), ("Circular", 5), ("CQ", 5), ("cq", 3), ("Circ", 2)],
}
SEPARADORES = [("#", 45), ("# ", 0), ("No", 6), ("No.", 5), ("Nro", 4), ("Nro.", 4), ("N°", 4), ("numero", 1), ("", 25)]
SUR = [("sur", 30), ("Sur", 25), ("SUR", 20), ("S", 15), ("s", 10)]
ESTE = [("este", 40), ("Este", 30), ("ESTE", 30)]
PREFIJOS_RUIDO = ["Barrio Manrique", "Medellín", "Antioquia Medellín", "Aranjuez", "Urb. Los Pinos", "Conjunto Altos del Río", "Santo Domingo", "Popular 1", "Referencia:"]
SUFIJOS_RUIDO = [
    "apto 301", "Apartamento 201", "interior 105", "int 201", "Int. 9904", "casa", "Casa primer piso", "primer piso", "Segundo piso",
    "piso 2", "2 piso", "1 piso", "Tercer piso", "barrio Manrique", "Manrique central", "local 104", "Local", "bloque 3 apto 508",
    "casa al frente de la cancha", "(0102)", "( interior 101)", "Medellín", "Bello", "Envigado", "Itagüí", "Aranjuez", "Villa Hermosa",
    "tienda la esquina", "porteria", "rejas negras", "timbre lado izquierdo", "Torre 2 apto 1504", "301", "Apt 202", "OF 309",
    "Negocio", "Llamar antes de entregar", "Referencia: casa verde", "cerca al colegio",
]
PERPENDICULAR = {"CL": "CR", "CR": "CL", "DG": "CR", "TV": "CL", "CQ": "CR"}


@dataclass
class Pieza:
    texto: str
    etiqueta: str
    pegada: bool = False  # sin espacio respecto a la pieza anterior


@dataclass
class Muestra:
    texto: str
    tokens: list[Token]
    etiquetas: list[str]
    componentes: Componentes


def _elegir(rng: random.Random, opciones: list[tuple[str, int]]) -> str:
    textos, pesos = zip(*opciones)
    return rng.choices(textos, weights=pesos)[0]


def _typo(rng: random.Random, palabra: str) -> str:
    if len(palabra) < 6:
        return palabra
    i = rng.randrange(1, len(palabra) - 1)
    return palabra[:i] + palabra[i + 1 :] if rng.random() < 0.5 else palabra[:i] + palabra[i + 1] + palabra[i] + palabra[i + 2 :]


def _caso(rng: random.Random, texto: str) -> str:
    r = rng.random()
    return texto.upper() if r < 0.3 else texto.lower() if r < 0.6 else texto


def _tipo(rng: random.Random, codigo: str, etiqueta: str) -> Pieza:
    palabra = _elegir(rng, SINONIMOS[codigo])
    if rng.random() < 0.03:
        palabra = _typo(rng, palabra)
    return Pieza(palabra, etiqueta)


def _eje(rng: random.Random, numero: int, letra: str | None, bis: bool, cuadrante: str | None, pref: str) -> list[Pieza]:
    piezas = [Pieza(str(numero), f"{pref}_NUM")]
    if letra:
        if len(letra) > 1 and rng.random() < 0.1:
            for ch in letra:
                piezas.append(Pieza(_caso(rng, ch), f"{pref}_LETRA"))
        else:
            piezas.append(Pieza(_caso(rng, letra), f"{pref}_LETRA", pegada=rng.random() < 0.65))
    if bis:
        piezas.append(Pieza(_caso(rng, "bis"), f"{pref}_BIS"))
    if cuadrante:
        texto = _elegir(rng, SUR if cuadrante == "SUR" else ESTE)
        piezas.append(Pieza(texto, f"{pref}_CUAD"))
    return piezas


def piezas_sucias(rng: random.Random, c: Componentes) -> list[Pieza]:
    piezas: list[Pieza] = []

    # Ruido y selector de formulario al inicio ("Carrera Carrera 52", "Calle Barrio Granizal Calle 103A").
    r = rng.random()
    if r < 0.12:
        piezas.append(_tipo(rng, c.via_tipo, E.VIA_TIPO))
    elif r < 0.17:
        piezas.append(Pieza(rng.choice(["Calle", "Carrera"]), E.RUIDO))
        piezas.append(Pieza(rng.choice(PREFIJOS_RUIDO), E.RUIDO))
    elif r < 0.22:
        piezas.append(Pieza(rng.choice(PREFIJOS_RUIDO), E.RUIDO))

    tipo = _tipo(rng, c.via_tipo, E.VIA_TIPO)
    piezas.append(tipo)
    via = _eje(rng, c.via_numero, c.via_letra, c.via_bis, c.via_cuadrante, "VIA")
    via[0].pegada = rng.random() < 0.15
    piezas.extend(via)

    if rng.random() < 0.04:  # vía repetida: "Calle 110 Calle 110 49c-35"
        piezas.append(Pieza(tipo.texto, E.RUIDO))
        piezas.extend(Pieza(p.texto, E.RUIDO, p.pegada) for p in via)

    if c.placa is None:  # cruce de vías
        piezas.append(Pieza(rng.choice(["con", "x", "X", "Con", "por"]) if rng.random() < 0.7 else "", E.CONECTOR))
        piezas.append(_tipo(rng, c.cruce_tipo or PERPENDICULAR[c.via_tipo], E.CRUCE_TIPO))
        piezas.extend(_eje(rng, c.cruce_numero, c.cruce_letra, c.cruce_bis, c.cruce_cuadrante, "CRUCE"))
    else:
        sep = _elegir(rng, SEPARADORES)
        if sep:
            piezas.append(Pieza(sep, E.SEP, pegada=sep == "#" and rng.random() < 0.3))
        if rng.random() < 0.08:
            piezas.append(Pieza(_elegir(rng, SINONIMOS[PERPENDICULAR[c.via_tipo]]), E.CRUCE_TIPO))
        cruce = _eje(rng, c.cruce_numero, c.cruce_letra, c.cruce_bis, c.cruce_cuadrante, "CRUCE")
        cruce[0].pegada = sep == "#" and rng.random() < 0.4
        piezas.extend(cruce)

        placa = c.placa
        r = rng.random()
        if r < 0.25 and placa.startswith("0"):
            placa = placa[1:]
        pegar_placa = len(cruce) == 1 and rng.random() < 0.05  # "#5077"
        if not pegar_placa:
            guion = _elegir(rng, [("-", 60), (" - ", 12), ("- ", 8), (" -", 5), ("", 15)])
            if guion.strip():
                piezas.append(Pieza("-", E.SEP, pegada=not guion.startswith(" ")))
            piezas.append(Pieza(placa, E.PLACA, pegada=bool(guion.strip()) and not guion.endswith(" ")))
        else:
            piezas.append(Pieza(placa, E.PLACA, pegada=True))

    for _ in range(rng.choices([0, 1, 2], weights=[40, 45, 15])[0]):
        piezas.append(Pieza(rng.choice(SUFIJOS_RUIDO), E.RUIDO))
    return piezas


def _alinear(piezas: list[Pieza]) -> tuple[str, list[Token], list[str]]:
    """Limpia cada pieza, arma el texto limpio y asigna a cada token la etiqueta de su pieza."""
    partes: list[str] = []
    tramos: list[tuple[int, int, str]] = []
    posicion = 0
    for p in piezas:
        limpio, _ = limpiar(p.texto)
        if not limpio:
            continue
        if partes and not p.pegada:
            partes.append(" ")
            posicion += 1
        tramos.append((posicion, posicion + len(limpio), p.etiqueta))
        partes.append(limpio)
        posicion += len(limpio)
    texto = "".join(partes)
    tokens = tokenizar(texto)
    etiquetas: list[str] = []
    for tok in tokens:
        cubiertas = [e for ini, fin, e in tramos if ini < tok.fin and tok.inicio < fin]
        if E.CRUCE_NUM in cubiertas and E.PLACA in cubiertas:
            etiquetas.append(E.CRUCE_PLACA)
        elif E.VIA_NUM in cubiertas and E.CRUCE_NUM in cubiertas:
            etiquetas.append(E.VIA_CRUCE)
        else:
            etiquetas.append(cubiertas[0] if cubiertas else E.RUIDO)
    return texto, tokens, etiquetas


def generar(rng: random.Random, c: Componentes) -> Muestra:
    piezas = piezas_sucias(rng, c)
    texto_sucio = ""
    for p in piezas:
        if not p.texto:
            continue
        texto_sucio += p.texto if (p.pegada or not texto_sucio) else " " + p.texto
    _, tokens, etiquetas = _alinear(piezas)
    return Muestra(texto_sucio, tokens, etiquetas, c)

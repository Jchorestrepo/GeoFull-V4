"""Tokenizador: separa números, palabras y los símbolos # y -."""

import re
from dataclasses import dataclass

RE_TOKEN = re.compile(r"\d+|[a-z]+|[#\-]")


@dataclass(frozen=True)
class Token:
    texto: str
    inicio: int
    fin: int
    pegado: bool  # True si no hay separación con el token anterior

    @property
    def es_numero(self) -> bool:
        return self.texto.isdigit()

    @property
    def es_palabra(self) -> bool:
        return self.texto.isalpha()


def tokenizar(texto_limpio: str) -> list[Token]:
    """Tokeniza texto ya limpio. "cll45#23-15" -> cll 45 # 23 - 15; "85a10" -> 85 a 10;
    "103bcra50" -> 103 b cra 50; "76asur" -> 76 a sur (letra pegada a la palabra siguiente)."""
    from normalizador.lexico import TIPOS_VIA, partir_letra_pegada

    tokens: list[Token] = []
    fin_anterior = None
    for m in RE_TOKEN.finditer(texto_limpio):
        pegado = fin_anterior is not None and m.start() == fin_anterior
        texto = m.group(0)
        partido = None
        if tokens and tokens[-1].es_numero and texto.isalpha() and texto not in TIPOS_VIA and texto not in ("sur", "este"):
            partido = partir_letra_pegada(texto)
        if partido:
            letra, tipo = partido
            corte = m.start() + len(letra)
            tokens.append(Token(letra, m.start(), corte, True))
            tokens.append(Token(tipo, corte, m.end(), True))
        else:
            tokens.append(Token(texto, m.start(), m.end(), pegado))
        fin_anterior = m.end()
    return tokens

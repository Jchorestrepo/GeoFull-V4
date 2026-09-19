"""Etiquetador CRF de respaldo (python-crfsuite). Mismas etiquetas que las reglas."""

from functools import lru_cache
from pathlib import Path

import pycrfsuite

from normalizador import etiquetas as E
from normalizador.lexico import BIS, CONECTORES_CRUCE, CUADRANTES, MARCADORES_NUMERO, es_letra, tipo_via
from normalizador.tokenizador import Token


def _forma(texto: str) -> str:
    if texto.isdigit():
        return f"d{min(len(texto), 5)}"
    if texto in ("#", "-"):
        return texto
    return "w"


def _features_token(tokens: list[Token], i: int) -> dict[str, object]:
    tok = tokens[i]
    w = tok.texto
    tipo = tipo_via(w) if tok.es_palabra else None
    f: dict[str, object] = {
        "bias": 1.0,
        "forma": _forma(w),
        "pegado": tok.pegado,
        "tipo": tipo[0] if tipo else "-",
        "marcador": w in MARCADORES_NUMERO,
        "conector": w in CONECTORES_CRUCE,
        "cuad": w in CUADRANTES,
        "s": w == "s",
        "bis": w in BIS,
        "letra": tok.es_palabra and es_letra(w),
        "largo": min(len(w), 8),
        "pos": min(i, 10),
    }
    if tok.es_palabra and not tipo and not es_letra(w) and len(w) > 3:
        f["palabra_larga"] = True
    else:
        f["w"] = w if not tok.es_numero else ""
    for d in (-3, -2, -1, 1, 2, 3):
        j = i + d
        if 0 <= j < len(tokens):
            v = tokens[j]
            tv = tipo_via(v.texto) if v.es_palabra else None
            f[f"{d}:forma"] = _forma(v.texto)
            f[f"{d}:tipo"] = tv[0] if tv else "-"
            f[f"{d}:marca"] = "m" if v.texto in MARCADORES_NUMERO else "c" if v.texto in CUADRANTES or v.texto == "s" else "l" if v.es_palabra and es_letra(v.texto) else "o"
            if abs(d) == 1:
                f[f"{d}:pegado"] = v.pegado
        else:
            f[f"{d}:borde"] = True
    # Cuántos números van antes: ayuda a distinguir vía, cruce y placa.
    f["nums_previos"] = min(sum(1 for t in tokens[:i] if t.es_numero), 4)
    return f


def features(tokens: list[Token]) -> list[dict[str, object]]:
    return [_features_token(tokens, i) for i in range(len(tokens))]


ETIQUETAS_NUMERICAS = {E.VIA_NUM, E.VIA_CRUCE, E.CRUCE_NUM, E.CRUCE_PLACA, E.PLACA}


def _validar(tok: Token, etiqueta: str) -> str:
    """Descarta etiquetas imposibles para el token (el CRF no garantiza coherencia de tipo)."""
    w = tok.texto
    if etiqueta in ETIQUETAS_NUMERICAS and not tok.es_numero:
        return E.RUIDO
    if etiqueta in (E.VIA_TIPO, E.CRUCE_TIPO) and not (tok.es_palabra and tipo_via(w)):
        return E.RUIDO
    if etiqueta in (E.VIA_LETRA, E.CRUCE_LETRA) and not (tok.es_palabra and es_letra(w)):
        return E.RUIDO
    if etiqueta in (E.VIA_CUAD, E.CRUCE_CUAD) and w not in CUADRANTES and w != "s":
        return E.RUIDO
    if etiqueta in (E.VIA_BIS, E.CRUCE_BIS) and w not in BIS:
        return E.RUIDO
    return etiqueta


class ModeloCRF:
    def __init__(self, ruta: Path):
        self.tagger = pycrfsuite.Tagger()
        self.tagger.open(str(ruta))

    def etiquetar(self, tokens: list[Token]) -> tuple[list[str], float]:
        """Etiquetas y confianza = mínima probabilidad marginal entre tokens no ruido."""
        if not tokens:
            return [], 0.0
        etiquetas = [_validar(t, e) for t, e in zip(tokens, self.tagger.tag(features(tokens)))]
        marginales = [self.tagger.marginal(e, i) for i, e in enumerate(etiquetas) if e != E.RUIDO]
        return etiquetas, (min(marginales) if marginales else 0.0)


@lru_cache(maxsize=2)
def cargar(ruta: Path) -> ModeloCRF | None:
    return ModeloCRF(ruta) if ruta.exists() else None

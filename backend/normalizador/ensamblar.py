"""Convierte tokens etiquetados (por reglas o CRF) en componentes, con penalizaciones estructurales."""

from dataclasses import dataclass, field
from pathlib import Path

from normalizador import etiquetas as E
from normalizador.alias import PENALIZACION_NO_VALIDADO, buscar_alias_por_texto
from normalizador.esquema import Componentes
from normalizador.lexico import CUADRANTES, TIPOS_FINALES, tipo_via
from normalizador.tokenizador import Token

PERPENDICULAR = {"CL": "CR", "CR": "CL", "DG": "CR", "TV": "CL"}
NUMERO_MAXIMO_PLAUSIBLE = 250


@dataclass
class Ensamblado:
    componentes: Componentes
    penalizaciones: list[tuple[float, str]] = field(default_factory=list)
    parciales: list[str] = field(default_factory=list)
    descartado: list[str] = field(default_factory=list)

    @property
    def tiene_via(self) -> bool:
        return self.componentes.via_numero is not None and self.componentes.via_tipo is not None

    @property
    def completa(self) -> bool:
        c = self.componentes
        return self.tiene_via and c.via_tipo in TIPOS_FINALES and c.cruce_numero is not None and c.placa is not None


def _resolver_tipo(palabras: list[str], pen: list, parciales: list) -> str | None:
    codigos = [tipo_via(p) for p in palabras]
    codigos = [c for c in codigos if c]
    if not codigos:
        return None
    if any(fuzzy for _, fuzzy in codigos):
        pen.append((0.05, "tipo de vía con error de escritura"))
    tipos = [c for c, _ in codigos]
    finales = [c for c in tipos if c in TIPOS_FINALES]
    if "AK" in tipos:
        return "CR"
    if "AC" in tipos:
        return "CL"
    if finales:
        if len(set(finales)) > 1:
            pen.append((0.05, f"tipos de vía distintos ({', '.join(dict.fromkeys(finales))}), se usa el último"))
        return finales[-1]
    if "AV" in tipos:
        parciales.append("avenida sin tipo calle/carrera")
        return "AV"
    parciales.append("autopista sin nomenclatura")
    return "AU"


def _dividir_pegado(digitos: str, pen: list) -> tuple[str, str]:
    """"5077" -> ("50", "77"). Prior: el segundo número (placa o cruce) suele tener 2 dígitos."""
    if len(digitos) < 3:
        pen.append((0.3, f"número '{digitos}' marcado como pegado pero es muy corto"))
        return digitos, ""
    if len(digitos) == 4:
        pen.append((0.08, f"números pegados '{digitos}' separados como {digitos[:2]}-{digitos[2:]}"))
        return digitos[:2], digitos[2:]
    corte = len(digitos) - 2 if len(digitos) <= 5 else 3
    if corte == 3 and int(digitos[:3]) > NUMERO_MAXIMO_PLAUSIBLE:
        corte = 2
    pen.append((0.25, f"números pegados '{digitos}' ambiguos, separados como {digitos[:corte]}-{digitos[corte:]}"))
    return digitos[:corte], digitos[corte:]


def _cuadrante(palabra: str) -> str:
    return CUADRANTES.get(palabra, "SUR")


def ensamblar(tokens: list[Token], etiquetas: list[str], texto_limpio: str, ruta_alias: Path) -> Ensamblado:
    pen: list[tuple[float, str]] = []
    parciales: list[str] = []
    c = Componentes()
    grupos: dict[str, list[Token]] = {}
    for tok, etq in zip(tokens, etiquetas):
        grupos.setdefault(etq, []).append(tok)

    # Vía
    if E.VIA_ALIAS in grupos:
        texto_alias = " ".join(t.texto for t in grupos[E.VIA_ALIAS])
        alias = buscar_alias_por_texto(texto_alias, ruta_alias)
        if alias is None or alias.ambiguo:
            parciales.append(f"alias '{texto_alias}' ambiguo o sin equivalencia" + (f": {alias.nota}" if alias and alias.nota else ""))
            c.via_tipo = "AV"
        else:
            c.via_tipo, c.via_numero, c.via_letra = alias.tipo, alias.numero, alias.letra
            pen.append((0.05 + (0 if alias.validado else PENALIZACION_NO_VALIDADO), f"alias '{texto_alias}' traducido"))
    if E.VIA_TIPO in grupos:
        c.via_tipo = _resolver_tipo([t.texto for t in grupos[E.VIA_TIPO]], pen, parciales)

    # Ningún eje tiene 4 dígitos: un número así etiquetado como simple (vía por CRF, o cruce tras
    # conector "con") son dos números pegados. Solo se reinterpreta si el hueco que llenaría está libre.
    nums_via = grupos.get(E.VIA_NUM, [])
    nums_cruce = grupos.get(E.CRUCE_NUM, [])
    if (nums_via and len(nums_via[0].texto) >= 4 and E.VIA_CRUCE not in grupos
            and not nums_cruce and E.CRUCE_PLACA not in grupos):
        grupos[E.VIA_CRUCE] = [nums_via[0]]
    if (nums_cruce and len(nums_cruce[0].texto) >= 4 and E.CRUCE_PLACA not in grupos
            and E.PLACA not in grupos):
        grupos[E.CRUCE_PLACA] = [nums_cruce[0]]

    if E.VIA_CRUCE in grupos:
        via, cruce = _dividir_pegado(grupos[E.VIA_CRUCE][0].texto, pen)
        c.via_numero, c.cruce_numero = int(via), int(cruce) if cruce else None
    elif nums_via:
        c.via_numero = int(nums_via[0].texto)
        if len(nums_via) > 1:
            pen.append((0.2, "varios números de vía"))

    # Cruce
    if E.CRUCE_PLACA in grupos:
        cruce, placa = _dividir_pegado(grupos[E.CRUCE_PLACA][0].texto, pen)
        c.cruce_numero, c.placa = int(cruce), placa or None
    elif E.CRUCE_NUM in grupos:
        c.cruce_numero = int(grupos[E.CRUCE_NUM][0].texto)
        if len(grupos[E.CRUCE_NUM]) > 1:
            pen.append((0.2, "varios números de cruce"))

    for eje in ("VIA", "CRUCE"):
        letras = "".join(t.texto for t in grupos.get(f"{eje}_LETRA", [])).upper()
        if len(letras) > 3:
            parciales.append(f"letra '{letras}' demasiado larga")
            letras = letras[:3]
        cuadrantes = [_cuadrante(t.texto) for t in grupos.get(f"{eje}_CUAD", [])]
        setattr(c, f"{eje.lower()}_letra", letras or getattr(c, f"{eje.lower()}_letra"))
        setattr(c, f"{eje.lower()}_cuadrante", cuadrantes[0] if cuadrantes else None)
        if len(set(cuadrantes)) > 1:
            parciales.append("cuadrantes contradictorios")
        if grupos.get(f"{eje}_BIS"):
            setattr(c, f"{eje.lower()}_bis", True)
            parciales.append("BIS no existe en el catastro de Medellín")

    # Placa
    placas = grupos.get(E.PLACA, [])
    if placas and c.placa is None:
        c.placa = placas[0].texto
    if len(placas) > 1 or (placas and E.CRUCE_PLACA in grupos):
        extra = [t.texto for t in placas[1:]] if E.CRUCE_PLACA not in grupos else [t.texto for t in placas]
        parciales.append(f"varias placas; se toma la primera, resto: {', '.join(extra)}")
    if c.placa is not None:
        valor = c.placa.lstrip("0") or "0"
        if len(valor) > 3:
            parciales.append(f"placa '{c.placa}' con más de 3 dígitos")
        elif len(c.placa.lstrip("0") or "0") == 1 and len(c.placa) == 1:
            pen.append((0.02, "placa de un dígito completada con cero"))
        c.placa = valor.zfill(2)

    # Cruce de vías sin placa
    tipos_cruce = grupos.get(E.CRUCE_TIPO, [])
    if c.cruce_numero is not None and c.placa is None:
        # Sin placa se interpreta como cruce de vías ("cr 14 Nº15" -> CR 14 X CL 15), según la revisión del set real.
        c.cruce_tipo = _resolver_tipo([t.texto for t in tipos_cruce], pen, []) if tipos_cruce else PERPENDICULAR.get(c.via_tipo or "")
        parciales.append("cruce de vías sin placa")
    elif c.via_tipo and c.via_numero is not None and c.cruce_numero is None:
        parciales.append("dirección sin cruce ni placa")

    for nombre in ("via_numero", "cruce_numero"):
        valor = getattr(c, nombre)
        if valor is not None and (valor == 0 or valor > NUMERO_MAXIMO_PLAUSIBLE):
            pen.append((0.2, f"{nombre.replace('_', ' de ')} {valor} fuera de rango habitual"))

    # Seguridad: ningún número de la salida puede faltar en la entrada.
    digitos_entrada = "".join(t.texto for t in tokens if t.es_numero)
    for valor in (c.via_numero, c.cruce_numero):
        if valor is not None and E.VIA_ALIAS not in grupos and str(valor) not in digitos_entrada:
            parciales.append(f"número {valor} no aparece en la entrada")

    descartado = _tramos_ruido(tokens, etiquetas, texto_limpio)
    return Ensamblado(c, pen, parciales, descartado)


def _tramos_ruido(tokens: list[Token], etiquetas: list[str], texto_limpio: str) -> list[str]:
    tramos: list[str] = []
    inicio = fin = None
    for tok, etq in zip(tokens, etiquetas):
        if etq == E.RUIDO:
            inicio = tok.inicio if inicio is None else inicio
            fin = tok.fin
        elif inicio is not None:
            tramos.append(texto_limpio[inicio:fin])
            inicio = None
    if inicio is not None:
        tramos.append(texto_limpio[inicio:fin])
    return [t for t in tramos if t.strip(" -#")]

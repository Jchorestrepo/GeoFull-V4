"""Etiquetador por reglas: busca anclas (tipo de vía + número) y aplica la gramática
VIA [calificadores] SEP CRUCE [calificadores] - PLACA; el resto es ruido."""

from dataclasses import dataclass, field
from pathlib import Path

from normalizador import etiquetas as E
from normalizador.alias import buscar_alias
from normalizador.lexico import BIS, CONECTORES_CRUCE, CUADRANTES, MARCADORES_NUMERO, PALABRAS_PISO, es_letra, tipo_via
from normalizador.tokenizador import Token

Penalizacion = tuple[float, str]


@dataclass
class Analisis:
    etiquetas: list[str]
    penalizaciones: list[Penalizacion] = field(default_factory=list)
    parciales: list[str] = field(default_factory=list)
    inicio: int = 0
    fin: int = 0
    completitud: int = 0  # 3 placa, 2 cruce de vías, 1 sin placa, 0 solo vía

    @property
    def castigo(self) -> float:
        """Penalizaciones propias más un estimado de las que agregará el ensamblado (números pegados)."""
        pegados = sum(0.25 for e in self.etiquetas if e in (E.CRUCE_PLACA, E.VIA_CRUCE))
        return sum(p for p, _ in self.penalizaciones) + pegados

    def firma(self, tokens: list[Token]) -> tuple[str, ...]:
        return tuple(t.texto for t, e in zip(tokens, self.etiquetas) if e not in (E.RUIDO, E.SEP, E.VIA_TIPO, E.CRUCE_TIPO))


class _Parser:
    def __init__(self, tokens: list[Token], inicio: int, ruta_alias: Path):
        self.t = tokens
        self.n = len(tokens)
        self.inicio = inicio
        self.ruta_alias = ruta_alias
        self.etq = [E.RUIDO] * self.n
        self.pen: list[Penalizacion] = []

    def txt(self, j: int) -> str | None:
        return self.t[j].texto if 0 <= j < self.n else None

    def es_num(self, j: int) -> bool:
        return 0 <= j < self.n and self.t[j].es_numero

    def es_tipo(self, j: int) -> bool:
        return 0 <= j < self.n and self.t[j].es_palabra and tipo_via(self.t[j].texto) is not None

    def calificadores(self, j: int, eje: str) -> int:
        """Letras, BIS y cuadrante después de un número."""
        letras = 0
        while j < self.n:
            w = self.t[j].texto
            if w in CUADRANTES:
                self.etq[j] = f"{eje}_CUAD"
            elif w == "s":
                previo = self.t[j - 1]
                if self.t[j].pegado and (previo.es_numero or es_letra(previo.texto)):
                    self.etq[j] = f"{eje}_LETRA"
                    letras += 1
                    self.pen.append((0.1, "'S' pegada al número interpretada como letra"))
                else:
                    self.etq[j] = f"{eje}_CUAD"
            elif w in BIS:
                self.etq[j] = f"{eje}_BIS"
            elif w == "a" and eje == "VIA" and not self.t[j].pegado and self.es_tipo(j + 1) and not self.t[j + 1].pegado:
                # "Cl 71 A CR 28-05": en el set real revisado suele ser letra, pero también puede ser preposición.
                self.etq[j] = E.VIA_LETRA
                letras += 1
                self.pen.append((0.1, "'a' antes del tipo de vía: puede ser letra o preposición"))
            elif es_letra(w) and letras + len(w) <= 3:
                self.etq[j] = f"{eje}_LETRA"
                letras += len(w)
            else:
                break
            j += 1
        return j

    def es_piso(self, j: int) -> bool:
        """"2 piso": número de un dígito seguido de palabra de piso."""
        return self.es_num(j) and len(self.t[j].texto) == 1 and self.txt(j + 1) in PALABRAS_PISO

    def hay_placa_en(self, j: int) -> bool:
        w = self.txt(j)
        if self.es_piso(j):
            return False
        if w == "-" or w in MARCADORES_NUMERO:
            return self.es_num(j + 1) or (es_letra(self.txt(j + 1) or "") and self.es_num(j + 2))
        return self.es_num(j)

    def parsear(self) -> Analisis | None:
        i = self.inicio
        t = self.t
        alias = buscar_alias([x.texto for x in t], i, self.ruta_alias)
        if alias and alias.numero is None:
            return None  # alias ambiguo ("autopista norte"): no sirve como vía
        via_cruce = False
        if alias:
            j = i + len(alias.patron)
            for k in range(i, j):
                self.etq[k] = E.VIA_ALIAS
        else:
            if not self.es_tipo(i):
                return None
            k = i
            while self.es_tipo(k):
                k += 1
            for x in range(i, k):
                self.etq[x] = E.VIA_TIPO
            # "Calle- 99", "Carrera N 46", "calle # 45"
            while self.txt(k) in ("-", "#", "n", "no", "nro") and not self.es_num(k) and self.es_num(k + 1):
                self.etq[k] = E.SEP
                k += 1
            if not self.es_num(k):
                return None
            if len(t[k].texto) >= 4:
                self.etq[k] = E.VIA_CRUCE
                via_cruce = True
            else:
                self.etq[k] = E.VIA_NUM
            j = k + 1
        j = self.calificadores(j, "VIA")

        interseccion = False
        if not via_cruce:
            j, interseccion, por_conector = self.separador(j)
            if not self.es_num(j):
                return self.cerrar(j, completitud=0)
            cruce = j
            j = self.calificadores(j + 1, "CRUCE")
            if por_conector:
                # "cra 17 con calle 10 #1034": con conector explícito es cruce de vías; lo que sigue es ruido.
                self.etq[cruce] = E.CRUCE_NUM
                return self.cerrar(j, completitud=2)
            largo = len(t[cruce].texto)
            if largo >= 4 or (largo == 3 and not self.hay_placa_en(j)):
                self.etq[cruce] = E.CRUCE_PLACA  # ningún cruce tiene 4 dígitos: "7627-2" -> 76-27
                j = self.placas_extra(j)
                return self.cerrar(j, completitud=3)
            self.etq[cruce] = E.CRUCE_NUM
        else:
            j = self.calificadores(j, "CRUCE")

        # Placa
        w = self.txt(j)
        if w == "-" and es_letra(self.txt(j + 1) or "") and self.es_num(j + 2):
            self.etq[j] = E.SEP  # "27-A 02": la letra es del cruce
            self.etq[j + 1] = E.CRUCE_LETRA
            j += 2
            w = self.txt(j)
        if w == "-" and self.es_num(j + 1):
            self.etq[j] = E.SEP
            j += 1
        elif w in MARCADORES_NUMERO and self.es_num(j + 1):
            self.etq[j] = E.SEP
            self.pen.append((0.2, "marcador '#' antes de la placa"))
            j += 1
        elif self.es_piso(j):
            return self.cerrar(j, completitud=2 if interseccion else 1)  # "2 piso" no es placa
        elif self.es_num(j):
            self.pen.append((0.03, "placa sin guion"))
        else:
            return self.cerrar(j, completitud=2 if interseccion else 1)

        self.etq[j] = E.PLACA
        j += 1
        if self.txt(j) in CUADRANTES or self.txt(j) == "s":
            self.etq[j] = E.CRUCE_CUAD
            j += 1
        j = self.placas_extra(j)
        return self.cerrar(j, completitud=3)

    def separador(self, j: int) -> tuple[int, bool, bool]:
        """Devuelve (posición del cruce, es cruce de vías, cruce de vías indicado por conector)."""
        interseccion = False
        por_conector = False
        salto_texto = False
        # Último tipo escrito: en "Calle Cra 30" el tipo de la vía es CR (igual que en ensamblar).
        via_tipo = next((tipo_via(self.t[k].texto)[0] for k in reversed(range(self.inicio, j)) if self.etq[k] == E.VIA_TIPO), None)
        via_num = next((self.t[k].texto for k in range(self.inicio, j) if self.etq[k] == E.VIA_NUM), None)
        while j < self.n:
            w = self.t[j].texto
            if w in MARCADORES_NUMERO:
                self.etq[j] = E.SEP
                if w == "#" or self.es_num(j + 1):
                    por_conector = False  # "CALLE 50 CON FRENTE #39-120" es dirección con placa
            elif w in CONECTORES_CRUCE:
                self.etq[j] = E.CONECTOR
                interseccion = por_conector = True
            elif (
                es_letra(w) and self.es_num(j + 1) and self.t[j + 1].pegado
                and not any(self.etq[x] == E.VIA_LETRA for x in range(self.inicio, j))
            ):
                self.etq[j] = E.VIA_LETRA  # "Calle 102 #aa27-b71": la letra de la vía quedó después del #
            elif self.t[j].es_palabra and not self.es_tipo(j) and self._placa_adelante(j, via_num):
                salto_texto = True  # "CL 50 FRENTE 56-22", "Calle Cll 103 segundo piso Calle Cll 103 segundo piso #50c-48"
            elif w == "-":
                self.etq[j] = E.SEP
                self.pen.append((0.05, "guion entre vía y cruce"))
            elif self.es_tipo(j):
                k = j
                while self.es_tipo(k):
                    k += 1
                if not self.es_num(k):
                    break
                tipo = tipo_via(self.t[k - 1].texto)[0]
                if via_tipo and tipo == via_tipo and self.t[k].texto == via_num:
                    # Vía repetida: "Calle 110 Calle 110 49c-35"
                    fin = self.calificadores(k + 1, "VIA")
                    for x in range(j, fin):
                        self.etq[x] = E.RUIDO
                    j = fin
                    continue
                for x in range(j, k):
                    self.etq[x] = E.CRUCE_TIPO
                if via_tipo and tipo == via_tipo:
                    self.pen.append((0.15, "el cruce tiene el mismo tipo de vía"))
                j = k
                continue
            else:
                break
            j += 1
        if salto_texto:
            self.pen.append((0.05, "texto entre la vía y el cruce"))
        # "CL 46 CR 78" sin placa es cruce de vías; con placa es una dirección normal.
        if any(self.etq[x] == E.CRUCE_TIPO for x in range(self.inicio, j)):
            interseccion = interseccion or not self._sigue_placa(j)
        if por_conector and self._sigue_placa(j) and not any(self.etq[x] == E.CRUCE_TIPO for x in range(self.inicio, j)):
            por_conector = False  # "CL 50 X 45-10": la X hace de #
        return j, interseccion, por_conector

    def _placa_adelante(self, j: int, via_num: str | None) -> bool:
        """Hay un "# N" o "N-N" más adelante, separado solo por palabras o por la vía repetida."""
        for k in range(j + 1, min(j + 10, self.n)):
            if self.t[k].texto in MARCADORES_NUMERO and self.es_num(k + 1):
                return True
            if self.es_num(k):
                siguiente = k + 2 if es_letra(self.txt(k + 1) or "") else k + 1
                if self.txt(k + 1) == "-" and self.es_num(k + 2):
                    return True
                if self.es_num(siguiente):
                    return True  # "FRENTE AL 47 A 53", "FRENTE 42+25"
                if self.t[k].texto != via_num:
                    return False
            elif not self.t[k].es_palabra:
                return False
        return False

    def _sigue_placa(self, j: int) -> bool:
        k = j + 1
        while k < self.n and (es_letra(self.t[k].texto) or self.t[k].texto in CUADRANTES or self.t[k].texto in BIS):
            k += 1
        return self.hay_placa_en(k)

    def placas_extra(self, j: int) -> int:
        """Detecta "57-85,57-91" o "21 y 80 sur 19": marca los números extra como PLACA."""
        k = j
        while k < self.n:
            if any(self.txt(x) in PALABRAS_PISO for x in range(k, k + 6)):
                break  # "68- 1 piso", "1-2 y 3 piso": son pisos, no placas
            w = self.t[k].texto
            if w in ("-", "y") and self.es_num(k + 1):
                self.etq[k + 1] = E.PLACA
                k += 2
            elif self.es_num(k) and self.txt(k + 1) == "-" and self.es_num(k + 2):
                self.etq[k + 2] = E.PLACA
                k += 3
            elif self.es_num(k) and (self.txt(k + 1) in CUADRANTES) and self.es_num(k + 2):
                self.etq[k + 2] = E.PLACA
                k += 3
            else:
                break
        return k

    def cerrar(self, fin: int, completitud: int) -> Analisis:
        previas = [x for x in self.t[: self.inicio] if x.es_palabra and tipo_via(x.texto) is None]
        if previas:
            self.pen.append((0.02, "texto antes de la dirección"))
        return Analisis(self.etq, self.pen, [], self.inicio, fin, completitud)


def etiquetar(tokens: list[Token], ruta_alias: Path) -> Analisis | None:
    candidatos: list[Analisis] = []
    fin_con_cruce = -1
    for i in range(len(tokens)):
        if i < fin_con_cruce:
            continue  # "cra 17 con calle 10": "calle 10" ya es el cruce de la dirección anterior
        a = _Parser(tokens, i, ruta_alias).parsear()
        if a:
            candidatos.append(a)
            if a.completitud >= 1:
                fin_con_cruce = max(fin_con_cruce, a.fin)
    if not candidatos:
        return None
    # Entre los más completos, preferir el primero salvo que otro tenga claramente menos castigo.
    tope = max(a.completitud for a in candidatos)
    completos = [a for a in candidatos if a.completitud == tope]
    minimo = min(a.castigo for a in completos)
    mejor = min((a for a in completos if a.castigo <= minimo + 0.1), key=lambda a: a.inicio)
    otras = {
        a.firma(tokens)
        for a in candidatos
        if a.inicio >= mejor.fin and a.completitud == 3 and a.firma(tokens) != mejor.firma(tokens)
    }
    if otras:
        mejor.parciales.append("el texto contiene varias direcciones")
    return mejor

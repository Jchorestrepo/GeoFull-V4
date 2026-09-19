"""Pipeline: limpiar -> tokenizar -> reglas -> (CRF de respaldo) -> ensamblar -> estado."""

from normalizador import VERSION_MOTOR, crf, formato, reglas
from normalizador.config import Config, cargar_config
from normalizador.ensamblar import ensamblar
from normalizador.esquema import Estado, Motivo, Resultado
from normalizador import etiquetas as E
from normalizador.lexico import BIS, CUADRANTES_AJENOS, PALABRAS_REFERENCIA, es_rural
from normalizador.limpieza import es_vacia, limpiar
from normalizador.tokenizador import Token, tokenizar


def _fallo(entrada: str, motivo: Motivo, advertencias: list[str]) -> Resultado:
    return Resultado(entrada=entrada, estado=Estado.FALLO, motivo=motivo, advertencias=advertencias, version_motor=VERSION_MOTOR)


def _alertas_de_contexto(tokens: list[Token], etiquetas: list[str], metodo: str) -> list[str]:
    """Señales que impiden un OK aunque la estructura esté completa."""
    alertas: list[str] = []
    palabras = [t.texto for t in tokens]
    if es_rural(palabras):
        alertas.append("contiene indicios rurales (km, vereda, finca)")
    utiles = [i for i, e in enumerate(etiquetas) if e != E.RUIDO]
    if not utiles:
        return alertas
    dentro = range(utiles[0], utiles[-1] + 1)
    ruido_dentro = [tokens[i] for i in dentro if etiquetas[i] == E.RUIDO]
    if any(t.texto in PALABRAS_REFERENCIA for t in ruido_dentro):
        alertas.append("referencia aproximada (frente, cerca, entre...)")
    if any(t.texto in CUADRANTES_AJENOS for t in ruido_dentro):
        alertas.append("cuadrante que no existe en el Valle de Aburrá")
    if any(t.texto in BIS for t in tokens) and not any(e.endswith("_BIS") for e in etiquetas):
        alertas.append("BIS ignorado")
    if metodo == "crf":
        # El CRF solo puede dar OK si la dirección es un bloque limpio: sin tokens ignorados en medio
        # ni placas extra justo después ("50-96 y 92").
        if ruido_dentro:
            alertas.append("el modelo ignoró texto dentro de la dirección")
        siguientes = [t.texto for t in tokens[utiles[-1] + 1 : utiles[-1] + 4]]
        if any(w.isdigit() for w in siguientes) and any(w in ("y", "-") for w in siguientes):
            alertas.append("posibles placas adicionales después de la dirección")
    return alertas


def _construir(
    entrada: str,
    tokens: list[Token],
    etiquetas: list[str],
    texto_limpio: str,
    penalizaciones: list[tuple[float, str]],
    parciales: list[str],
    descartes: list[str],
    metodo: str,
    cfg: Config,
) -> Resultado | None:
    ens = ensamblar(tokens, etiquetas, texto_limpio, cfg.ruta_alias)
    parciales = parciales + _alertas_de_contexto(tokens, etiquetas, metodo)
    if not ens.tiene_via and not ens.parciales:
        return None
    todas_pen = penalizaciones + ens.penalizaciones
    todos_parciales = parciales + ens.parciales
    if not ens.tiene_via:
        return None if not any("alias" in p or "autopista" in p for p in todos_parciales) else _fallo(
            entrada, Motivo.SIN_NOMENCLATURA, todos_parciales + [f"descartado: '{d}'" for d in descartes]
        )
    confianza = round(max(0.0, 1.0 - sum(p for p, _ in todas_pen)), 3)
    estado = Estado.OK if ens.completa and not todos_parciales and confianza >= cfg.umbral_ok else Estado.PARCIAL
    if estado == Estado.PARCIAL and ens.completa and not todos_parciales:
        todos_parciales.append(f"confianza {confianza} menor al umbral {cfg.umbral_ok}")
    advertencias = (
        todos_parciales
        + [motivo for _, motivo in todas_pen]
        + [f"descartado: '{d}'" for d in ens.descartado + descartes]
    )
    return Resultado(
        entrada=entrada,
        direccion=formato.legible(ens.componentes, cfg.tipo_carrera),
        clave=formato.clave(ens.componentes, cfg.tipo_carrera),
        componentes=ens.componentes,
        estado=estado,
        confianza=confianza,
        metodo=metodo,
        advertencias=advertencias,
        version_motor=VERSION_MOTOR,
    )


def normalizar(texto: str | None, cfg: Config | None = None) -> Resultado:
    cfg = cfg or cargar_config()
    entrada = texto or ""
    limpio, descartes = limpiar(entrada)
    if es_vacia(limpio):
        return _fallo(entrada, Motivo.VACIA, [])
    tokens = tokenizar(limpio)

    por_reglas: Resultado | None = None
    por_crf: Resultado | None = None
    analisis = reglas.etiquetar(tokens, cfg.ruta_alias)
    if analisis:
        por_reglas = _construir(entrada, tokens, analisis.etiquetas, limpio, analisis.penalizaciones, analisis.parciales, descartes, "reglas", cfg)

    # El CRF solo actúa si las reglas no encontraron ninguna dirección. Un PARCIAL de las reglas es
    # una ambigüedad detectada a propósito y el CRF no debe convertirla en OK (revisión del set real).
    if por_reglas is None:
        modelo = crf.cargar(cfg.ruta_modelo_crf)
        if modelo is not None:
            etiquetas, confianza_tokens = modelo.etiquetar(tokens)
            pen = [(round(1.0 - confianza_tokens, 3), "incertidumbre del modelo CRF")] if confianza_tokens < 1 else []
            por_crf = _construir(entrada, tokens, etiquetas, limpio, pen, [], descartes, "crf", cfg)

    if por_reglas is not None:
        return por_reglas
    if por_crf is not None and por_crf.estado != Estado.FALLO:
        return por_crf
    motivo = Motivo.RURAL if es_rural([t.texto for t in tokens]) else Motivo.SIN_NOMENCLATURA
    return _fallo(entrada, motivo, [f"descartado: '{d}'" for d in descartes])


def normalizar_lote(textos: list[str | None], cfg: Config | None = None) -> list[Resultado]:
    cfg = cfg or cargar_config()
    return [normalizar(t, cfg) for t in textos]

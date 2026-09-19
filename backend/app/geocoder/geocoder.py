from dataclasses import dataclass
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text
from app.geocoder.normalizer import NormalizedAddress

# eje_de_nomenclatura.numero_via es smallint: un número mayor no existe en el catastro
# y asyncpg falla al codificarlo (ej. "84122" = cruce y placa pegados).
SMALLINT_MAX = 32767


def _numero_valido(numero: Optional[int]) -> bool:
    return numero is not None and 0 < numero <= SMALLINT_MAX


@dataclass
class GeocodeResult:
    latitud: Optional[float]
    longitud: Optional[float]
    nivel_precision: str
    precision_metros: str
    confianza_score: int
    origen_dato: str


async def geocode_address(session: AsyncSession, normalized: Optional[NormalizedAddress]) -> GeocodeResult:
    """
    Geocodificador de Alta Precisión con Fallback por Cercanía (Algoritmo Geocoding Medellín + PostGIS).
    Nivel 1: EXACT_MATCH (Predial Exacto ±2m)
    Nivel 2: PLACA_APROX (Predio más cercano en la misma cuadra ±15m)
    Nivel 3: VIA_APENDICE (Vía vecina con variante apéndice ±50m)
    Nivel 4: INTERSECTION_MATCH (Cruce de Ejes Viales ±30m)
    Nivel 5: VIA_ONLY (Centroide de Calle / Carrera ±100m)
    """
    if not normalized or not normalized.via_db:
        return GeocodeResult(
            latitud=None, longitud=None,
            nivel_precision="NO_GEOLOCALIZADO", precision_metros="0",
            confianza_score=0, origen_dato="NINGUNO"
        )

    # -------------------------------------------------------------------------
    # NIVEL 1: EXACT_MATCH (Coincidencia Predial Exacta ±2m)
    # -------------------------------------------------------------------------
    if normalized.placa_db:
        # Generar posibles variantes de placa (ej: "35-3" y "35-03")
        placa_variante = normalized.placa_db
        placa_pad = f"{normalized.via_generadora}{normalized.apendice_generadora}-{normalized.numero_casa:02d}" if normalized.numero_casa and normalized.numero_casa < 10 else None

        query_1 = text("""
            SELECT ST_Y("Shape") as lat, ST_X("Shape") as lon, via, placa
            FROM public.nomenclatura_domiciliaria
            WHERE via = :via AND (placa = :placa OR placa = :placa_pad OR placa LIKE :placa_prefix)
            ORDER BY (placa = :placa) DESC, (placa = :placa_pad) DESC
            LIMIT 1
        """)
        res = await session.execute(query_1, {
            "via": normalized.via_db,
            "placa": normalized.placa_db,
            "placa_pad": placa_pad or normalized.placa_db,
            "placa_prefix": f"{normalized.placa_db}%"
        })
        r = res.first()
        if r and r.lat and r.lon:
            return GeocodeResult(
                latitud=float(r.lat), longitud=float(r.lon),
                nivel_precision="EXACT_MATCH", precision_metros="2",
                confianza_score=100, origen_dato="nomenclatura_domiciliaria"
            )

    # -------------------------------------------------------------------------
    # NIVEL 2: PLACA_APROX (Cercanía a Predio más Próximo en la misma Cuadra ±15m)
    # -------------------------------------------------------------------------
    if normalized.via_generadora:
        prefix_cuadra = f"{normalized.via_generadora}{normalized.apendice_generadora}-%"
        prefix_cuadra_base = f"{normalized.via_generadora}-%"

        query_2 = text("""
            SELECT ST_Y("Shape") as lat, ST_X("Shape") as lon, placa,
                   ABS(
                       CAST(NULLIF(regexp_replace(SPLIT_PART(placa, '-', 2), '[^0-9]', '', 'g'), '') AS INT) - :casa
                   ) as dist_casa
            FROM public.nomenclatura_domiciliaria
            WHERE via = :via AND (placa LIKE :prefix OR placa LIKE :prefix_base)
            ORDER BY dist_casa ASC NULLS LAST
            LIMIT 1
        """)
        res = await session.execute(query_2, {
            "via": normalized.via_db,
            "prefix": prefix_cuadra,
            "prefix_base": prefix_cuadra_base,
            "casa": normalized.numero_casa or 1
        })
        r = res.first()
        if r and r.lat and r.lon:
            return GeocodeResult(
                latitud=float(r.lat), longitud=float(r.lon),
                nivel_precision="PLACA_APROX", precision_metros="15",
                confianza_score=85, origen_dato="nomenclatura_domiciliaria_cercania"
            )

    # -------------------------------------------------------------------------
    # NIVEL 3: VIA_APENDICE (Vía Vecina con Apéndice ±50m)
    # -------------------------------------------------------------------------
    if normalized.codigo_via and normalized.numero_via:
        prefix_via_apendice = f"{normalized.codigo_via} {normalized.numero_via}%"
        query_3 = text("""
            SELECT ST_Y("Shape") as lat, ST_X("Shape") as lon
            FROM public.nomenclatura_domiciliaria
            WHERE via LIKE :via_prefix AND placa LIKE :placa_prefix
            LIMIT 1
        """)
        res = await session.execute(query_3, {
            "via_prefix": prefix_via_apendice,
            "placa_prefix": f"{normalized.via_generadora or 1}-%"
        })
        r = res.first()
        if r and r.lat and r.lon:
            return GeocodeResult(
                latitud=float(r.lat), longitud=float(r.lon),
                nivel_precision="VIA_APENDICE", precision_metros="50",
                confianza_score=65, origen_dato="nomenclatura_domiciliaria_apendice"
            )

    # -------------------------------------------------------------------------
    # NIVEL 4: INTERSECTION_MATCH (Cruce de Vías / Esquina en Ejes Viales ±30m)
    # -------------------------------------------------------------------------
    if _numero_valido(normalized.numero_via) and _numero_valido(normalized.via_generadora):
        cruce_tipo = "CR" if normalized.codigo_via == "CL" else "CL"
        query_4 = text("""
            SELECT ST_Y(ST_Centroid(ST_Intersection(a."Shape", b."Shape"))) as lat,
                   ST_X(ST_Centroid(ST_Intersection(a."Shape", b."Shape"))) as lon
            FROM public.eje_de_nomenclatura a
            JOIN public.eje_de_nomenclatura b ON ST_Intersects(a."Shape", b."Shape")
            WHERE a.tipo_via = :tipo_a AND a.numero_via = :num_a
              AND b.tipo_via = :tipo_b AND b.numero_via = :num_b
            LIMIT 1
        """)
        res = await session.execute(query_4, {
            "tipo_a": normalized.codigo_via, "num_a": normalized.numero_via,
            "tipo_b": cruce_tipo, "num_b": normalized.via_generadora
        })
        r = res.first()
        if r and r.lat and r.lon:
            return GeocodeResult(
                latitud=float(r.lat), longitud=float(r.lon),
                nivel_precision="INTERSECTION_MATCH", precision_metros="30",
                confianza_score=55, origen_dato="eje_de_nomenclatura_interseccion"
            )

    # -------------------------------------------------------------------------
    # NIVEL 5: VIA_ONLY (Centroide de la Calle / Carrera ±100m)
    # -------------------------------------------------------------------------
    if normalized.codigo_via and _numero_valido(normalized.numero_via):
        query_5 = text("""
            SELECT ST_Y(ST_Centroid(ST_Union("Shape"))) as lat,
                   ST_X(ST_Centroid(ST_Union("Shape"))) as lon
            FROM public.eje_de_nomenclatura
            WHERE tipo_via = :tipo AND numero_via = :num
        """)
        res = await session.execute(query_5, {"tipo": normalized.codigo_via, "num": normalized.numero_via})
        r = res.first()
        if r and r.lat and r.lon:
            return GeocodeResult(
                latitud=float(r.lat), longitud=float(r.lon),
                nivel_precision="VIA_ONLY", precision_metros="100",
                confianza_score=30, origen_dato="eje_de_nomenclatura_centroide"
            )

    return GeocodeResult(
        latitud=None, longitud=None,
        nivel_precision="NO_GEOLOCALIZADO", precision_metros="0",
        confianza_score=0, origen_dato="NINGUNO"
    )

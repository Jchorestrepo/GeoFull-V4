#!/usr/bin/env bash
# ==============================================================================
# GeoFull V4 — Importación de datos catastrales (GPKG GeoMedellín -> PostGIS)
# ==============================================================================
# Se ejecuta dentro del contenedor GDAL (servicio `geo-import` de docker-compose):
#   docker compose run --rm geo-import            # importa solo si las tablas están vacías
#   docker compose run --rm -e FORZAR=1 geo-import # vacía y recarga las tablas
#
# Busca los archivos en /data (montado desde backend/data/):
#   nomenclatura_domiciliaria.gpkg  o  gpkg_nomenclatura_domiciliaria.zip
#   eje_de_nomenclatura.gpkg        o  gpkg_eje_de_nomenclatura.zip
# Los GPKG vienen en EPSG:9377 y se reproyectan a EPSG:4326.
# La conexión usa las variables libpq PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
# ==============================================================================
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
FORZAR="${FORZAR:-0}"
PG="PG:dbname=${PGDATABASE}"

contar() {
    ogrinfo -ro -q "$PG" -sql "SELECT count(*) AS n FROM public.$1" \
        | sed -n 's/.*n (Integer64) = \([0-9]*\).*/\1/p'
}

ejecutar_sql() {
    ogrinfo -q "$PG" -sql "$1" > /dev/null
}

origen() {
    local capa="$1"
    if [ -f "$DATA_DIR/$capa.gpkg" ]; then
        echo "$DATA_DIR/$capa.gpkg"
    elif [ -f "$DATA_DIR/gpkg_$capa.zip" ]; then
        echo "/vsizip/$DATA_DIR/gpkg_$capa.zip/$capa.gpkg"
    fi
}

# importar <capa> <tipo_geometria> <campos>
importar() {
    local capa="$1" tipo="$2" campos="$3"
    local src
    src="$(origen "$capa")"
    if [ -z "$src" ]; then
        echo "[AVISO] No se encontró $capa.gpkg ni gpkg_$capa.zip en $DATA_DIR. Se omite."
        return 0
    fi

    local actuales
    actuales="$(contar "$capa")"
    if [ "${actuales:-0}" -gt 0 ] && [ "$FORZAR" != "1" ]; then
        echo "[OK] public.$capa ya tiene $actuales registros. Se omite (usa FORZAR=1 para recargar)."
        return 0
    fi

    if [ "${actuales:-0}" -gt 0 ]; then
        echo "[..] Vaciando public.$capa ($actuales registros)..."
        ejecutar_sql "TRUNCATE public.$capa RESTART IDENTITY"
    fi

    echo "[..] Importando $src -> public.$capa ..."
    ogr2ogr -f PostgreSQL "$PG" "$src" "$capa" \
        -append -nln "public.$capa" \
        -s_srs EPSG:9377 -t_srs EPSG:4326 -nlt "$tipo" \
        -select "$campos" \
        -gt 65536 --config PG_USE_COPY YES

    ejecutar_sql "ANALYZE public.$capa"
    echo "[OK] public.$capa: $(contar "$capa") registros."
}

echo "=== Importación de datos catastrales GeoFull V4 ==="
importar nomenclatura_domiciliaria POINT \
    "direccion,via,placa,cbml,numero_mejora,direccionencasillada,direccioncodificada"
importar eje_de_nomenclatura MULTILINESTRING \
    "tipo_via,numero_via,apendice_via,orientacion_via,label,nombre_comun,comuna"
echo "=== Importación finalizada ==="

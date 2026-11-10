from typing import List, Optional, Any, Dict
from datetime import date, datetime, timedelta, timezone
import uuid
import json
from fastapi import APIRouter, HTTPException, Header, status, Depends, Query
from pydantic import BaseModel
from app.core.dependencies import get_current_user, get_tenant_id, require_admin_user
from app.core.audit import registrar_historial_evento
from sqlalchemy import text
from app.core.database import get_db_session

router = APIRouter(prefix="/zones", tags=["Zonas GeoJSON por Empresa"])


class ZoneCreateGeoJSON(BaseModel):
    nombre_zona: str
    codigo_zona: Optional[str] = None
    geojson_geometry: Dict[str, Any]  # FeatureCollection, Feature, Polygon o MultiPolygon GeoJSON


class ZoneResponse(BaseModel):
    id: uuid.UUID
    nombre: str
    codigo: Optional[str] = None
    codigo_barras: Optional[str] = None
    color: str = "#10b981"
    activa: bool


class UpdateZoneBarcode(BaseModel):
    codigo_barras: str


class InventoryScanPackageReq(BaseModel):
    barcode: str
    zone_id: str



def extract_features_with_props(geojson_input: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extrae la lista de features con sus propiedades y geometrías de cualquier GeoJSON."""
    if not isinstance(geojson_input, dict):
        return []

    gtype = geojson_input.get("type")
    if gtype == "FeatureCollection":
        return [f for f in geojson_input.get("features", []) if isinstance(f, dict) and f.get("geometry")]
    elif gtype == "Feature":
        return [geojson_input] if geojson_input.get("geometry") else []
    elif gtype in ("Polygon", "MultiPolygon"):
        return [{"type": "Feature", "properties": {}, "geometry": geojson_input}]
    return []


@router.get("/", response_model=List[ZoneResponse])
async def list_zones(x_tenant_id: str = Depends(get_tenant_id)):
    """Lista las zonas GeoJSON de la empresa con sus códigos de barras."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        query = text("""
            SELECT id, nombre_zona, codigo_zona, codigo_barras, activa
            FROM zonas_personalizadas
            WHERE tenant_id = :tenant_id
            ORDER BY nombre_zona ASC
        """)
        res = await session.execute(query, {"tenant_id": x_tenant_id})
        rows = res.fetchall()

        colors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"]
        return [
            ZoneResponse(
                id=r.id, nombre=r.nombre_zona, codigo=r.codigo_zona,
                codigo_barras=r.codigo_barras,
                color=colors[idx % len(colors)], activa=r.activa
            )
            for idx, r in enumerate(rows)
        ]


@router.get("/geojson")
async def get_zones_geojson(x_tenant_id: str = Depends(get_tenant_id)):
    """Devuelve la FeatureCollection GeoJSON completa de las zonas activas de la empresa."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        query = text("""
            SELECT id, nombre_zona, codigo_zona, ST_AsGeoJSON(geom) as geojson
            FROM zonas_personalizadas
            WHERE tenant_id = :tenant_id AND activa = true
            ORDER BY nombre_zona ASC
        """)
        res = await session.execute(query, {"tenant_id": x_tenant_id})
        rows = res.fetchall()

        SECTOR_PALETTE = [
            '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
            '#06b6d4', '#f97316', '#84cc16', '#a855f7', '#6366f1', '#14b8a6', '#f43f5e'
        ]

        features = []
        for idx, r in enumerate(rows):
            if r.geojson:
                try:
                    geom_dict = json.loads(r.geojson)
                    features.append({
                        "type": "Feature",
                        "geometry": geom_dict,
                        "properties": {
                            "id": str(r.id),
                            "name": r.nombre_zona,
                            "code": r.codigo_zona or "",
                            "color": SECTOR_PALETTE[idx % len(SECTOR_PALETTE)]
                        }
                    })
                except Exception:
                    pass

        return {
            "type": "FeatureCollection",
            "features": features
        }


@router.post("/import-geojson", status_code=status.HTTP_201_CREATED)
async def import_zone_geojson(
    req: ZoneCreateGeoJSON,
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Importa polígonos/sectores desde cualquier archivo GeoJSON (FeatureCollection, Feature, Polygon o MultiPolygon)."""
    features = extract_features_with_props(req.geojson_geometry)
    if not features:
        raise HTTPException(
            status_code=400,
            detail="El archivo GeoJSON no contiene geometrías válidas (Polygon o MultiPolygon)."
        )

    imported_count = 0
    imported_names = []
    last_inserted_id = None
    last_inserted_name = req.nombre_zona
    last_inserted_code = req.codigo_zona or "ZONA-PROP"
    last_inserted_activa = True

    async for session in get_db_session(tenant_id=x_tenant_id):
        try:
            for idx, feat in enumerate(features):
                props = feat.get("properties") or {}
                geom = feat.get("geometry")

                if not geom or geom.get("type") not in ("Polygon", "MultiPolygon", "GeometryCollection"):
                    continue

                # Determinar nombre descriptivo del sector/zona
                feat_name = (
                    props.get("name") or props.get("NAME") or
                    props.get("nombre") or props.get("NOMBRE") or
                    props.get("barrio") or props.get("BARRIO") or
                    props.get("zona") or props.get("ZONA") or
                    props.get("sector") or props.get("SECTOR") or
                    props.get("codigo") or props.get("CODIGO") or
                    props.get("id")
                )

                if not feat_name:
                    if len(features) == 1:
                        feat_name = req.nombre_zona
                    else:
                        feat_name = f"{req.nombre_zona} #{idx + 1}"

                feat_code = (
                    props.get("code") or props.get("codigo") or
                    req.codigo_zona or f"ZONA-{idx + 1}"
                )

                geom_str = json.dumps(geom)

                sql = text("""
                    INSERT INTO zonas_personalizadas (tenant_id, nombre_zona, codigo_zona, geom)
                    VALUES (
                        :tenant_id,
                        :nombre,
                        :codigo,
                        CASE 
                            WHEN ST_XMin(ST_GeomFromGeoJSON(:geom)) > 100000 THEN
                                ST_Multi(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 9377), 4326)))
                            ELSE
                                ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)))
                        END
                    )
                    RETURNING id, nombre_zona, codigo_zona, activa
                """)

                try:
                    res = await session.execute(sql, {
                        "tenant_id": x_tenant_id,
                        "nombre": str(feat_name).strip(),
                        "codigo": str(feat_code).strip(),
                        "geom": geom_str
                    })
                    r = res.first()
                    if r:
                        imported_count += 1
                        imported_names.append(r.nombre_zona)
                        last_inserted_id = r.id
                        last_inserted_name = r.nombre_zona
                        last_inserted_code = r.codigo_zona
                        last_inserted_activa = r.activa
                except Exception as feat_err:
                    try:
                        fallback_sql = text("""
                            INSERT INTO zonas_personalizadas (tenant_id, nombre_zona, codigo_zona, geom)
                            VALUES (
                                :tenant_id,
                                :nombre,
                                :codigo,
                                ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)))
                            )
                            RETURNING id, nombre_zona, codigo_zona, activa
                        """)
                        res_fb = await session.execute(fallback_sql, {
                            "tenant_id": x_tenant_id,
                            "nombre": str(feat_name).strip(),
                            "codigo": str(feat_code).strip(),
                            "geom": geom_str
                        })
                        r_fb = res_fb.first()
                        if r_fb:
                            imported_count += 1
                            imported_names.append(r_fb.nombre_zona)
                            last_inserted_id = r_fb.id
                            last_inserted_name = r_fb.nombre_zona
                            last_inserted_code = r_fb.codigo_zona
                            last_inserted_activa = r_fb.activa
                    except Exception as fb_err:
                        print(f"⚠️ Geometría omitida #{idx} por error en PostGIS: {fb_err}")

            await session.commit()

            if imported_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="No se pudieron procesar geometrías válidas del archivo GeoJSON."
                )

            return {
                "id": str(last_inserted_id) if last_inserted_id else str(uuid.uuid4()),
                "nombre": last_inserted_name,
                "codigo": last_inserted_code,
                "activa": last_inserted_activa,
                "total_importados": imported_count,
                "mensaje": f"Se han importado {imported_count} polígonos/sectores correctamente a la empresa ({x_tenant_id})."
            }

        except HTTPException:
            await session.rollback()
            raise
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Error al procesar el archivo GeoJSON en PostGIS: {str(e)}"
            )


@router.delete("/purge")
async def purge_all_zones(
    admin_user: dict = Depends(require_admin_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Elimina todas las zonas personalizadas de la empresa (Requiere Admin)."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM zonas_personalizadas WHERE tenant_id = :tenant_id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        await session.commit()
        return {"status": "ok", "eliminados": res.rowcount}


@router.delete("/{zone_id}")
async def delete_zone(
    zone_id: uuid.UUID,
    admin_user: dict = Depends(require_admin_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Elimina una zona específica por ID (Requiere Admin)."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM zonas_personalizadas WHERE id = :id AND tenant_id = :tenant_id")
        res = await session.execute(sql, {"id": zone_id, "tenant_id": x_tenant_id})
        await session.commit()
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Zona no encontrada")
        return {"status": "ok", "message": "Zona eliminada exitosamente"}


@router.put("/{zone_id}/toggle")
async def toggle_zone(zone_id: uuid.UUID, x_tenant_id: str = Depends(get_tenant_id)):
    """Alterna el estado activa/inactiva de una zona."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("""
            UPDATE zonas_personalizadas 
            SET activa = NOT activa 
            WHERE id = :id AND tenant_id = :tenant_id 
            RETURNING id, activa
        """)
        res = await session.execute(sql, {"id": zone_id, "tenant_id": x_tenant_id})
        await session.commit()
        r = res.first()
        if not r:
            raise HTTPException(status_code=404, detail="Zona no encontrada")
        return {"status": "ok", "activa": r.activa}


@router.put("/{zone_id}/barcode")
async def update_zone_barcode(
    zone_id: uuid.UUID,
    payload: UpdateZoneBarcode,
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Actualiza el código de barras asignado a una zona."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("""
            UPDATE zonas_personalizadas 
            SET codigo_barras = :barcode 
            WHERE id = :id AND tenant_id = :tenant_id 
            RETURNING id, nombre_zona, codigo_barras
        """)
        res = await session.execute(sql, {
            "id": zone_id,
            "barcode": payload.codigo_barras.strip(),
            "tenant_id": x_tenant_id
        })
        await session.commit()
        r = res.first()
        if not r:
            raise HTTPException(status_code=404, detail="Zona no encontrada")
        return {
            "status": "ok",
            "id": str(r.id),
            "nombre": r.nombre_zona,
            "codigo_barras": r.codigo_barras
        }


@router.get("/inventory-summary")
async def get_inventory_summary(x_tenant_id: str = Depends(get_tenant_id)):
    """Obtiene el listado de zonas activas con conteo en tiempo real de paquetes en bodega, esperados y alertas rojas."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("""
            WITH conteo_zonas AS (
                SELECT
                    p.zona_id,
                    COUNT(*) FILTER (WHERE p.estado = 'EN_BODEGA') AS total_bodega,
                    COUNT(*) FILTER (WHERE p.estado = 'SECTORIZADO') AS pendientes_escanear,
                    COUNT(*) FILTER (
                        WHERE p.estado = 'EN_BODEGA'
                          AND p.cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN'
                    ) AS alertas_rojas
                FROM pedidos p
                WHERE p.tenant_id = :tenant_id
                  AND p.estado IN ('EN_BODEGA', 'SECTORIZADO')
                  AND p.zona_id IS NOT NULL
                GROUP BY p.zona_id
            )
            SELECT 
                z.id,
                z.nombre_zona,
                z.codigo_zona,
                z.codigo_barras,
                z.activa,
                COALESCE(c.total_bodega, 0) AS total_bodega,
                COALESCE(c.pendientes_escanear, 0) AS pendientes_escanear,
                GREATEST(0, COALESCE(c.total_bodega, 0) + COALESCE(c.pendientes_escanear, 0) - COALESCE(c.alertas_rojas, 0)) AS total_esperados,
                COALESCE(c.alertas_rojas, 0) AS alertas_rojas
            FROM zonas_personalizadas z
            LEFT JOIN conteo_zonas c ON c.zona_id = z.id
            WHERE z.tenant_id = :tenant_id AND z.activa = true
            ORDER BY z.nombre_zona ASC
        """)
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        rows = res.fetchall()

        colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16']

        return [
            {
                "id": str(r.id),
                "nombre": r.nombre_zona,
                "codigo": r.codigo_zona or "",
                "codigo_barras": r.codigo_barras or f"ZONA-{r.nombre_zona.upper().replace(' ', '-')}",
                "total_bodega": r.total_bodega or 0,
                "pendientes_escanear": r.pendientes_escanear or 0,
                "total_esperados": r.total_esperados or 0,
                "alertas_rojas": r.alertas_rojas or 0,
                "tiene_alerta_roja": bool((r.alertas_rojas or 0) > 0),
                "color": colors[idx % len(colors)]
            }
            for idx, r in enumerate(rows)
        ]


@router.get("/unscanned-orders")
async def get_unscanned_orders(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    guia: Optional[str] = None,
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Lista pedidos importados que aún no han sido escaneados ni en sectorización ni en inventario de bodega."""
    hasta = fecha_hasta or date.today()
    desde = fecha_desde or hasta - timedelta(days=15)
    params = {
        "tenant_id": x_tenant_id,
        "desde": desde,
        "hasta_excl": hasta + timedelta(days=1),
        "limit": limit,
        "offset": offset,
    }
    filtro = """
        WHERE tenant_id = :tenant_id
          AND fecha_importacion >= :desde
          AND fecha_importacion < :hasta_excl
          AND estado != 'EN_BODEGA'
          AND COALESCE(cliente, '') != '⚠️ CÓDIGO NO EN IMPORTACIÓN'
          AND NOT EXISTS (
            SELECT 1 FROM pedidos_historial h
            WHERE h.tenant_id = pedidos.tenant_id
              AND h.pedido_id = pedidos.id
              AND h.tipo_evento IN ('SECTORIZACION_ESCANEO', 'INGRESO_BODEGA', 'REUBICACION_BODEGA')
          )
    """
    if guia and guia.strip():
        filtro += " AND guia ILIKE :guia"
        params["guia"] = f"%{guia.strip()}%"

    async for session in get_db_session(tenant_id=x_tenant_id):
        total_res = await session.execute(text(f"SELECT COUNT(*) FROM pedidos {filtro}"), params)
        total = total_res.scalar() or 0

        res = await session.execute(text(f"""
            SELECT guia, cliente, direccion_original, direccion_limpia,
                   zona_nombre, estado, fecha_importacion
            FROM pedidos
            {filtro}
            ORDER BY fecha_importacion DESC
            LIMIT :limit OFFSET :offset
        """), params)
        items = [
            {
                "guia": r.guia,
                "cliente": r.cliente,
                "direccion": r.direccion_limpia or r.direccion_original,
                "zona_nombre": r.zona_nombre,
                "estado": r.estado,
                "fecha_importacion": r.fecha_importacion.isoformat() if r.fecha_importacion else None,
            }
            for r in res.fetchall()
        ]
        return {
            "items": items,
            "total": total,
            "fecha_desde": desde.isoformat(),
            "fecha_hasta": hasta.isoformat(),
        }


@router.get("/{zone_id}/packages")
async def get_zone_packages(
    zone_id: uuid.UUID,
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Devuelve todos los códigos/paquetes de una zona: alertas rojas (no importados), en bodega y pendientes por escanear."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        z_res = await session.execute(
            text("SELECT id, nombre_zona, codigo_zona, codigo_barras FROM zonas_personalizadas WHERE id = :zid AND tenant_id = :tenant_id"),
            {"zid": zone_id, "tenant_id": x_tenant_id}
        )
        z = z_res.first()
        if not z:
            raise HTTPException(status_code=404, detail="Zona no encontrada")

        p_res = await session.execute(text("""
            SELECT id, guia, cliente, direccion_original, direccion_limpia,
                   zona_id, zona_nombre, estado,
                   (cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN') AS alerta_roja,
                   (cliente = 'Paquete Extra (Verificado en Bodega)') AS verificado_bodega,
                   CASE
                       WHEN estado = 'EN_BODEGA' THEN COALESCE(datos_extra->>'zona_importacion_nombre', datos_extra->>'zona_original_nombre', zona_nombre)
                       ELSE zona_nombre
                   END AS zona_orig,
                   CASE
                       WHEN estado = 'EN_BODEGA' THEN datos_extra->>'escaneado_por'
                       ELSE NULL
                   END AS escaneado_por,
                   fecha_importacion, fecha_actualizacion
            FROM pedidos
            WHERE tenant_id = :tenant_id
              AND zona_id = :zid
              AND estado IN ('EN_BODEGA', 'SECTORIZADO')
            ORDER BY
                CASE WHEN estado = 'EN_BODEGA' THEN 0 ELSE 1 END,
                fecha_actualizacion DESC
            LIMIT 1000
        """), {"tenant_id": x_tenant_id, "zid": zone_id})

        en_bodega = []
        pendientes = []
        alertas_rojas_count = 0

        for r in p_res.fetchall():
            alerta_roja = bool(r.alerta_roja)
            verificado_bodega = bool(r.verificado_bodega)
            es_no_importado = alerta_roja or verificado_bodega
            zona_orig = r.zona_orig or r.zona_nombre
            reubicado = bool(zona_orig and zona_orig != z.nombre_zona and not es_no_importado)

            item = {
                "id": str(r.id),
                "guia": r.guia,
                "cliente": r.cliente or ("⚠️ Código no encontrado en importación" if alerta_roja else "Cliente sin nombre"),
                "direccion": r.direccion_limpia or r.direccion_original,
                "estado": r.estado,
                "zona_nombre": r.zona_nombre,
                "zona_original_nombre": zona_orig,
                "reubicado": reubicado,
                "es_no_importado": es_no_importado,
                "verificado_bodega": verificado_bodega,
                "alerta_roja": alerta_roja,
                "escaneado_por": r.escaneado_por,
                "fecha_actualizacion": r.fecha_actualizacion.isoformat() if r.fecha_actualizacion else None,
                "fecha_importacion": r.fecha_importacion.isoformat() if r.fecha_importacion else None,
            }

            if r.estado == "EN_BODEGA":
                if alerta_roja:
                    alertas_rojas_count += 1
                en_bodega.append(item)
            else:
                pendientes.append(item)

        en_bodega.sort(key=lambda x: (0 if x["alerta_roja"] else 1))

        return {
            "zone": {
                "id": str(z.id),
                "nombre": z.nombre_zona,
                "codigo": z.codigo_zona or "",
                "codigo_barras": z.codigo_barras or f"ZONA-{z.nombre_zona.upper().replace(' ', '-')}",
            },
            "en_bodega": en_bodega,
            "pendientes": pendientes,
            "total_bodega": len(en_bodega),
            "total_pendientes": len(pendientes),
            "alertas_rojas_count": alertas_rojas_count,
        }


@router.delete("/{zone_id}/packages/{pedido_id}")
async def remove_package_from_zone(
    zone_id: uuid.UUID,
    pedido_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """
    Elimina un código mal escaneado (si no existía en importación)
    o retira un paquete válido del conteo de bodega de la zona.
    """
    user_name = current_user.get("nombre") or current_user.get("email") or "Operador de Bodega"
    async for session in get_db_session(tenant_id=x_tenant_id):
        res = await session.execute(text("""
            SELECT id, guia, cliente, estado, zona_id, zona_nombre, datos_extra
            FROM pedidos
            WHERE id = :pid AND tenant_id = :tenant_id
            LIMIT 1
        """), {"pid": pedido_id, "tenant_id": x_tenant_id})
        pedido = res.first()
        if not pedido:
            raise HTTPException(status_code=404, detail="Paquete o código no encontrado")

        extra = pedido.datos_extra if isinstance(pedido.datos_extra, dict) else (json.loads(pedido.datos_extra) if pedido.datos_extra else {})
        es_no_importado = (
            extra.get("origen_inventario") == "NO_IMPORTADO"
            or pedido.cliente in ("⚠️ CÓDIGO NO EN IMPORTACIÓN", "Paquete Extra (Verificado en Bodega)")
        )

        if es_no_importado:
            await session.execute(
                text("DELETE FROM pedidos_historial WHERE pedido_id = :pid AND tenant_id = :tenant_id"),
                {"pid": pedido.id, "tenant_id": x_tenant_id}
            )
            await session.execute(
                text("DELETE FROM pedidos WHERE id = :pid AND tenant_id = :tenant_id"),
                {"pid": pedido.id, "tenant_id": x_tenant_id}
            )
            await session.commit()
            return {
                "status": "ok",
                "action": "deleted_unknown",
                "guia": pedido.guia,
                "was_red_alert": pedido.cliente == "⚠️ CÓDIGO NO EN IMPORTACIÓN",
                "message": f"Código '{pedido.guia}' eliminado de la zona."
            }
        else:
            orig_zone_id = extra.get("zona_importacion_id") or extra.get("zona_original_id")
            orig_zone_name = extra.get("zona_importacion_nombre") or extra.get("zona_original_nombre") or pedido.zona_nombre
            target_zid = uuid.UUID(orig_zone_id) if orig_zone_id else pedido.zona_id

            await session.execute(text("""
                UPDATE pedidos
                SET estado = 'SECTORIZADO',
                    zona_id = :zid,
                    zona_nombre = :zname,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :pid AND tenant_id = :tenant_id
            """), {
                "zid": target_zid,
                "zname": orig_zone_name,
                "pid": pedido.id,
                "tenant_id": x_tenant_id
            })

            await registrar_historial_evento(
                session=session,
                tenant_id=x_tenant_id,
                pedido_id=pedido.id,
                guia=pedido.guia,
                tipo_evento="RETIRO_BODEGA_MANUAL",
                descripcion=f"【Retiro de Zona Bodega】 Guía retirada del conteo de 【{pedido.zona_nombre}】 por 【{user_name}】.",
                estado_anterior=pedido.estado,
                estado_nuevo="SECTORIZADO",
                usuario_id=current_user.get("id") if current_user.get("id") else None,
                usuario_nombre=user_name,
                detalles={"zona_retirada": pedido.zona_nombre, "zona_restaurada": orig_zone_name}
            )
            await session.commit()
            return {
                "status": "ok",
                "action": "removed_from_bodega",
                "guia": pedido.guia,
                "was_red_alert": False,
                "message": f"Guía '{pedido.guia}' retirada del conteo en bodega."
            }


@router.patch("/{zone_id}/packages/{pedido_id}/verify-extra")
async def verify_unimported_package(
    zone_id: uuid.UUID,
    pedido_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Confirma que un código que no estaba en la importación corresponde a un paquete físico real (quita la alerta roja)."""
    user_name = current_user.get("nombre") or current_user.get("email") or "Operador de Bodega"
    async for session in get_db_session(tenant_id=x_tenant_id):
        res = await session.execute(text("""
            SELECT id, guia, cliente, estado, zona_nombre, datos_extra
            FROM pedidos
            WHERE id = :pid AND tenant_id = :tenant_id
            LIMIT 1
        """), {"pid": pedido_id, "tenant_id": x_tenant_id})
        pedido = res.first()
        if not pedido:
            raise HTTPException(status_code=404, detail="Paquete no encontrado")

        extra = pedido.datos_extra if isinstance(pedido.datos_extra, dict) else (json.loads(pedido.datos_extra) if pedido.datos_extra else {})
        extra["alerta_roja"] = False
        extra["verificado_bodega"] = True
        extra["verificado_por"] = user_name
        extra["fecha_verificacion"] = datetime.now(timezone.utc).isoformat()

        nuevo_cliente = "Paquete Extra (Verificado en Bodega)"

        await session.execute(text("""
            UPDATE pedidos
            SET cliente = :cliente,
                datos_extra = CAST(:datos_extra AS JSONB),
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :pid AND tenant_id = :tenant_id
        """), {
            "cliente": nuevo_cliente,
            "datos_extra": json.dumps(extra, ensure_ascii=False),
            "pid": pedido.id,
            "tenant_id": x_tenant_id
        })

        await registrar_historial_evento(
            session=session,
            tenant_id=x_tenant_id,
            pedido_id=pedido.id,
            guia=pedido.guia,
            tipo_evento="VERIFICACION_PAQUETE_EXTRA",
            descripcion=f"【Paquete Extra Verificado】 Operador 【{user_name}】 confirmó que el código '{pedido.guia}' es un paquete físico real en 【{pedido.zona_nombre}】.",
            estado_anterior=pedido.estado,
            estado_nuevo=pedido.estado,
            usuario_id=current_user.get("id") if current_user.get("id") else None,
            usuario_nombre=user_name,
            detalles={"zona": pedido.zona_nombre, "verificado_bodega": True}
        )
        await session.commit()
        return {
            "status": "ok",
            "guia": pedido.guia,
            "message": f"Código '{pedido.guia}' confirmado como paquete físico extra. Alerta roja desactivada."
        }


@router.post("/reset-inventory/{zone_id}")
async def reset_zone_inventory(
    zone_id: uuid.UUID,
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Reinicia el contador de la zona pasando los paquetes previos en bodega a PENDIENTE_REINVENTARIO y limpiando códigos falsos sin verificar."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        await session.execute(text("""
            DELETE FROM pedidos_historial
            WHERE tenant_id = :tenant_id
              AND pedido_id IN (
                  SELECT id FROM pedidos
                  WHERE tenant_id = :tenant_id
                    AND zona_id = :zone_id
                    AND estado = 'EN_BODEGA'
                    AND cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN'
              )
        """), {"tenant_id": x_tenant_id, "zone_id": zone_id})

        del_res = await session.execute(text("""
            DELETE FROM pedidos
            WHERE tenant_id = :tenant_id
              AND zona_id = :zone_id
              AND estado = 'EN_BODEGA'
              AND cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN'
        """), {"tenant_id": x_tenant_id, "zone_id": zone_id})

        sql = text("""
            UPDATE pedidos 
            SET estado = 'PENDIENTE_REINVENTARIO', fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE tenant_id = :tenant_id AND zona_id = :zone_id AND estado = 'EN_BODEGA'
            RETURNING id
        """)
        res = await session.execute(sql, {"tenant_id": x_tenant_id, "zone_id": zone_id})
        await session.commit()
        total_afectados = (res.rowcount or 0) + (del_res.rowcount or 0)
        return {
            "status": "ok",
            "zone_id": str(zone_id),
            "afectados": total_afectados,
            "message": f"Contador reiniciado a cero ({total_afectados} registros limpiados)."
        }


@router.post("/reset-all-inventory")
async def reset_all_zones_inventory(x_tenant_id: str = Depends(get_tenant_id)):
    """Reinicia el contador de TODAS las zonas a cero y elimina los códigos no importados sin verificar."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        await session.execute(text("""
            DELETE FROM pedidos_historial
            WHERE tenant_id = :tenant_id
              AND pedido_id IN (
                  SELECT id FROM pedidos
                  WHERE tenant_id = :tenant_id
                    AND estado = 'EN_BODEGA'
                    AND cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN'
              )
        """), {"tenant_id": x_tenant_id})

        del_res = await session.execute(text("""
            DELETE FROM pedidos
            WHERE tenant_id = :tenant_id
              AND estado = 'EN_BODEGA'
              AND cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN'
        """), {"tenant_id": x_tenant_id})

        upd_res = await session.execute(text("""
            UPDATE pedidos
            SET estado = 'PENDIENTE_REINVENTARIO',
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE tenant_id = :tenant_id AND estado = 'EN_BODEGA'
        """), {"tenant_id": x_tenant_id})
        await session.commit()
        total = (upd_res.rowcount or 0) + (del_res.rowcount or 0)
        return {
            "status": "ok",
            "afectados": total,
            "message": f"Todas las zonas han sido reiniciadas a 0 ({total} paquetes reiniciados)."
        }


@router.post("/reorganize-map")
async def reorganize_map_from_inventory(
    current_user: dict = Depends(get_current_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """
    Sincroniza y reorganiza el Mapa según la distribución física de las zonas en bodega:
    1. Consolida todos los paquetes escaneados (EN_BODEGA) en la zona física donde quedaron.
    2. Si algún paquete en zona no tenía coordenadas GPS (ej. paquete extra verificado o dirección difícil),
       le asigna el punto interior del polígono de su zona (ST_PointOnSurface) para que aparezca en el mapa.
    3. Re-evalúa con PostGIS (ST_Contains) los paquetes FUERA_DE_ZONA o PENDIENTE_REINVENTARIO que tienen coordenadas.
    """
    user_name = current_user.get("nombre") or current_user.get("email") or "Operador de Bodega"
    async for session in get_db_session(tenant_id=x_tenant_id):
        # 1. Verificar cuántos códigos en alerta roja sin verificar existen (usa índice parcial)
        alert_res = await session.execute(text("""
            SELECT COUNT(*) FROM pedidos
            WHERE tenant_id = :tenant_id
              AND estado = 'EN_BODEGA'
              AND cliente = '⚠️ CÓDIGO NO EN IMPORTACIÓN'
        """), {"tenant_id": x_tenant_id})
        alertas_pendientes = alert_res.scalar() or 0

        # 2. Para los paquetes EN_BODEGA (válidos o verificados) que no tengan coordenadas,
        # asignarles el punto en superficie del polígono de su zona para que el mapa los muestre
        geo_upd = await session.execute(text("""
            UPDATE pedidos p
            SET latitud = ST_Y(ST_PointOnSurface(z.geom)),
                longitud = ST_X(ST_PointOnSurface(z.geom)),
                geom = ST_SetSRID(ST_PointOnSurface(z.geom), 4326),
                nivel_precision = COALESCE(p.nivel_precision, 'ZONA_BODEGA'),
                fecha_actualizacion = CURRENT_TIMESTAMP
            FROM zonas_personalizadas z
            WHERE p.tenant_id = :tenant_id
              AND z.tenant_id = :tenant_id
              AND p.zona_id = z.id
              AND p.estado = 'EN_BODEGA'
              AND (p.latitud IS NULL OR p.longitud IS NULL)
              AND COALESCE(p.cliente, '') != '⚠️ CÓDIGO NO EN IMPORTACIÓN'
        """), {"tenant_id": x_tenant_id})
        geolocalizados_zona = geo_upd.rowcount or 0

        # 3. Consolidar como zona oficial de cada paquete EN_BODEGA la zona donde fue escaneado
        consolidados_upd = await session.execute(text("""
            UPDATE pedidos p
            SET zona_nombre = z.nombre_zona,
                datos_extra = COALESCE(p.datos_extra, '{}'::jsonb) || jsonb_build_object(
                    'zona_importacion_id', z.id::text,
                    'zona_importacion_nombre', z.nombre_zona,
                    'mapa_sincronizado_bodega', true,
                    'sincronizado_por', CAST(:user_name AS TEXT)
                ),
                fecha_actualizacion = CURRENT_TIMESTAMP
            FROM zonas_personalizadas z
            WHERE p.tenant_id = :tenant_id
              AND z.tenant_id = :tenant_id
              AND p.zona_id = z.id
              AND p.estado = 'EN_BODEGA'
              AND COALESCE(p.cliente, '') != '⚠️ CÓDIGO NO EN IMPORTACIÓN'
        """), {"tenant_id": x_tenant_id, "user_name": user_name})
        consolidados_bodega = consolidados_upd.rowcount or 0

        # 4. Re-sectorizar usando índice espacial GIST sólo aquellos paquetes en FUERA_DE_ZONA o PENDIENTE_REINVENTARIO
        resect_upd = await session.execute(text("""
            UPDATE pedidos p
            SET zona_id = z.id,
                zona_nombre = z.nombre_zona,
                estado = 'SECTORIZADO',
                fecha_actualizacion = CURRENT_TIMESTAMP
            FROM zonas_personalizadas z
            WHERE p.tenant_id = :tenant_id
              AND z.tenant_id = :tenant_id
              AND z.activa = true
              AND p.estado IN ('FUERA_DE_ZONA', 'PENDIENTE_REINVENTARIO')
              AND p.geom IS NOT NULL
              AND ST_Contains(z.geom, p.geom)
        """), {"tenant_id": x_tenant_id})
        resectorizados_mapa = resect_upd.rowcount or 0

        await session.commit()

        return {
            "status": "ok",
            "consolidados_bodega": consolidados_bodega,
            "geolocalizados_zona": geolocalizados_zona,
            "resectorizados_mapa": resectorizados_mapa,
            "alertas_pendientes": alertas_pendientes,
            "message": (
                f"Mapa reorganizado exitosamente: {consolidados_bodega} paquetes en bodega consolidados en sus zonas"
                + (f" ({geolocalizados_zona} ubicados en polígono)" if geolocalizados_zona else "")
                + (f". ⚠️ Atención: quedan {alertas_pendientes} código(s) en rojo por revisar." if alertas_pendientes else ".")
            )
        }


@router.post("/inventory-scan-package")
async def scan_package_inventory(
    payload: InventoryScanPackageReq,
    current_user: dict = Depends(get_current_user),
    x_tenant_id: str = Depends(get_tenant_id)
):
    """
    Escanear un paquete/guía y ubicarlo en la zona activa en estado EN_BODEGA:
    - Si existe en otra zona, sale de la zona anterior y entra a la nueva.
    - Si ya estaba en la misma zona en EN_BODEGA, no duplica el conteo.
    - Si NO existe en la importación, entra a la zona pero marca la zona en ROJO (alerta_roja = True)
      para que el usuario pueda inspeccionar los códigos y verificar si fue un mal escaneo o paquete extra.
    """
    barcode = payload.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="El código de barras no puede estar vacío")

    try:
        zone_id = uuid.UUID(payload.zone_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="zone_id no es un UUID válido")

    async for session in get_db_session(tenant_id=x_tenant_id):
        # 1. Obtener nombre de la zona destino
        z_query = text("SELECT id, nombre_zona FROM zonas_personalizadas WHERE id = :zid AND tenant_id = :tenant_id")
        z_res = await session.execute(z_query, {"zid": zone_id, "tenant_id": x_tenant_id})
        zone_row = z_res.first()
        if not zone_row:
            raise HTTPException(status_code=404, detail="La zona seleccionada no existe.")

        target_zone_name = zone_row.nombre_zona

        # 2. Buscar primero por índice primario exacto (0.08ms) y como fallback por índice funcional UPPER(TRIM(guia))
        p_exact = text("""
            SELECT id, guia, cliente, direccion_original, direccion_limpia,
                   zona_id, zona_nombre, estado, datos_extra
            FROM pedidos 
            WHERE tenant_id = :tenant_id AND guia = :guia
            LIMIT 1
        """)
        p_res = await session.execute(p_exact, {"tenant_id": x_tenant_id, "guia": barcode})
        pedido = p_res.first()

        if not pedido:
            p_upper = text("""
                SELECT id, guia, cliente, direccion_original, direccion_limpia,
                       zona_id, zona_nombre, estado, datos_extra
                FROM pedidos 
                WHERE tenant_id = :tenant_id
                  AND UPPER(TRIM(guia)) = UPPER(TRIM(:guia))
                LIMIT 1
            """)
            p_res2 = await session.execute(p_upper, {"tenant_id": x_tenant_id, "guia": barcode})
            pedido = p_res2.first()

        user_name = current_user.get("nombre") or current_user.get("email") or "Operador de Bodega"

        if pedido:
            extra = pedido.datos_extra if isinstance(pedido.datos_extra, dict) else (json.loads(pedido.datos_extra) if pedido.datos_extra else {})
            es_no_importado = extra.get("origen_inventario") == "NO_IMPORTADO"
            verificado_bodega = bool(extra.get("verificado_bodega", False))
            alerta_roja = es_no_importado and not verificado_bodega

            prev_zone_id = str(pedido.zona_id) if pedido.zona_id else None
            prev_zone_name = pedido.zona_nombre or "Sin Zona"
            prev_estado = pedido.estado

            already_in_zone = (prev_zone_id == str(zone_id) and prev_estado == "EN_BODEGA")
            was_in_bodega_other_zone = (prev_estado == "EN_BODEGA" and prev_zone_id is not None and prev_zone_id != str(zone_id))
            zone_changed = (prev_zone_id is not None and prev_zone_id != str(zone_id))

            # Preservar la zona original de importación si aún no estaba guardada
            if "zona_importacion_id" not in extra and prev_zone_id and not es_no_importado:
                extra["zona_importacion_id"] = prev_zone_id
                extra["zona_importacion_nombre"] = prev_zone_name
            extra["ultimo_escaneo_bodega"] = datetime.now(timezone.utc).isoformat()
            extra["escaneado_por"] = user_name

            upd_query = text("""
                UPDATE pedidos 
                SET zona_id = :zone_id,
                    zona_nombre = :zone_name,
                    estado = 'EN_BODEGA',
                    datos_extra = CAST(:datos_extra AS JSONB),
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id AND tenant_id = :tenant_id
                RETURNING id, guia, cliente, direccion_original, direccion_limpia, zona_nombre, estado
            """)
            upd_res = await session.execute(upd_query, {
                "zone_id": zone_id,
                "zone_name": target_zone_name,
                "datos_extra": json.dumps(extra, ensure_ascii=False),
                "id": pedido.id,
                "tenant_id": x_tenant_id
            })
            updated_p = upd_res.first()

            if not already_in_zone:
                desc_escaneo = f"【Ingreso a Bodega】 Paquete escaneado en zona 【{target_zone_name}】 por operador 【{user_name}】."
                if zone_changed:
                    desc_escaneo = f"【Reubicación Bodega】 Paquete movido de 【{prev_zone_name}】 a 【{target_zone_name}】 por operador 【{user_name}】."

                await registrar_historial_evento(
                    session=session,
                    tenant_id=x_tenant_id,
                    pedido_id=updated_p.id,
                    guia=updated_p.guia,
                    tipo_evento="REUBICACION_BODEGA" if zone_changed else "INGRESO_BODEGA",
                    descripcion=desc_escaneo,
                    estado_anterior=prev_estado,
                    estado_nuevo="EN_BODEGA",
                    usuario_id=current_user.get("id") if current_user.get("id") else None,
                    usuario_nombre=user_name,
                    detalles={
                        "zona_anterior_id": prev_zone_id,
                        "zona_anterior": prev_zone_name,
                        "zona_nueva_id": str(zone_id),
                        "zona_nueva": target_zone_name,
                        "reubicado_en_bodega": was_in_bodega_other_zone
                    }
                )
            await session.commit()

            return {
                "status": "ok",
                "id": str(updated_p.id),
                "is_new": False,
                "is_unimported_alert": alerta_roja,
                "already_in_zone": already_in_zone,
                "zone_changed": zone_changed,
                "was_in_bodega_other_zone": was_in_bodega_other_zone,
                "previous_zone_id": prev_zone_id,
                "previous_zone": prev_zone_name,
                "guia": updated_p.guia,
                "cliente": updated_p.cliente or "Cliente no registrado",
                "direccion": updated_p.direccion_limpia or updated_p.direccion_original,
                "zona_nombre": updated_p.zona_nombre,
                "estado": updated_p.estado
            }
        else:
            # Código NO encontrado en importación: Entra a la zona pero activa ALERTA ROJA
            extra_new = {
                "origen_inventario": "NO_IMPORTADO",
                "alerta_roja": True,
                "verificado_bodega": False,
                "ultimo_escaneo_bodega": datetime.now(timezone.utc).isoformat(),
                "escaneado_por": user_name
            }
            ins_query = text("""
                INSERT INTO pedidos (
                    tenant_id, guia, cliente, direccion_original, zona_id, zona_nombre, estado, datos_extra
                ) VALUES (
                    :tenant_id, :guia, '⚠️ CÓDIGO NO EN IMPORTACIÓN', 'Código escaneado en bodega que no existe en el archivo importado',
                    :zone_id, :zone_name, 'EN_BODEGA', CAST(:datos_extra AS JSONB)
                )
                RETURNING id, guia, cliente, direccion_original, zona_nombre, estado
            """)
            ins_res = await session.execute(ins_query, {
                "tenant_id": x_tenant_id,
                "guia": barcode,
                "zone_id": zone_id,
                "zone_name": target_zone_name,
                "datos_extra": json.dumps(extra_new, ensure_ascii=False)
            })
            new_p = ins_res.first()

            await registrar_historial_evento(
                session=session,
                tenant_id=x_tenant_id,
                pedido_id=new_p.id,
                guia=new_p.guia,
                tipo_evento="CODIGO_NO_IMPORTADO_BODEGA",
                descripcion=f"【⚠️ Alerta Código No Importado】 Código '{barcode}' escaneado en zona 【{target_zone_name}】 por 【{user_name}】. No figura en la importación; zona marcada en ROJO para revisión.",
                estado_anterior=None,
                estado_nuevo="EN_BODEGA",
                usuario_id=current_user.get("id") if current_user.get("id") else None,
                usuario_nombre=user_name,
                detalles={"zona": target_zone_name, "alerta_roja": True}
            )
            await session.commit()

            return {
                "status": "ok",
                "id": str(new_p.id),
                "is_new": True,
                "is_unimported_alert": True,
                "already_in_zone": False,
                "zone_changed": False,
                "was_in_bodega_other_zone": False,
                "previous_zone_id": None,
                "previous_zone": "No existía en importación",
                "guia": new_p.guia,
                "cliente": new_p.cliente,
                "direccion": new_p.direccion_original,
                "zona_nombre": new_p.zona_nombre,
                "estado": new_p.estado
            }


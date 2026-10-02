from typing import List, Optional, Any, Dict
import uuid
import json
from fastapi import APIRouter, HTTPException, Header, status, Depends
from pydantic import BaseModel
from app.core.dependencies import get_current_user, get_tenant_id
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
async def purge_all_zones(x_tenant_id: str = Depends(get_tenant_id)):
    """Elimina todas las zonas personalizadas de la empresa."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM zonas_personalizadas WHERE tenant_id = :tenant_id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        await session.commit()
        return {"status": "ok", "eliminados": res.rowcount}


@router.delete("/{zone_id}")
async def delete_zone(zone_id: uuid.UUID, x_tenant_id: str = Depends(get_tenant_id)):
    """Elimina una zona específica por ID."""
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
    """Obtiene el listado de zonas activas con conteo en tiempo real de paquetes en bodega."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("""
            SELECT 
                z.id,
                z.nombre_zona,
                z.codigo_zona,
                z.codigo_barras,
                z.activa,
                COUNT(p.id) FILTER (WHERE p.estado = 'EN_BODEGA') as total_bodega
            FROM zonas_personalizadas z
            LEFT JOIN pedidos p ON p.zona_id = z.id AND p.tenant_id = z.tenant_id
            WHERE z.tenant_id = :tenant_id AND z.activa = true
            GROUP BY z.id, z.nombre_zona, z.codigo_zona, z.codigo_barras, z.activa
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
                "color": colors[idx % len(colors)]
            }
            for idx, r in enumerate(rows)
        ]


@router.post("/reset-inventory/{zone_id}")
async def reset_zone_inventory(
    zone_id: uuid.UUID,
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Reinicia el contador de la zona pasando los paquetes previos en bodega a PENDIENTE_REINVENTARIO."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("""
            UPDATE pedidos 
            SET estado = 'PENDIENTE_REINVENTARIO', fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE tenant_id = :tenant_id AND zona_id = :zone_id AND estado = 'EN_BODEGA'
            RETURNING id
        """)
        res = await session.execute(sql, {"tenant_id": x_tenant_id, "zone_id": zone_id})
        await session.commit()
        return {
            "status": "ok",
            "zone_id": str(zone_id),
            "afectados": res.rowcount,
            "message": f"Contador reiniciado a cero. {res.rowcount} paquetes marcados como PENDIENTE_REINVENTARIO."
        }


@router.post("/inventory-scan-package")
async def scan_package_inventory(
    payload: InventoryScanPackageReq,
    x_tenant_id: str = Depends(get_tenant_id)
):
    """Escanear un paquete/guía y ubicarlo en la zona activa en estado EN_BODEGA."""
    barcode = payload.barcode.strip()
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

        # 2. Buscar si la guía existe en pedidos
        p_query = text("""
            SELECT id, guia, cliente, direccion_original, zona_id, zona_nombre, estado 
            FROM pedidos 
            WHERE tenant_id = :tenant_id AND guia = :guia
        """)
        p_res = await session.execute(p_query, {"tenant_id": x_tenant_id, "guia": barcode})
        pedido = p_res.first()

        zone_changed = False
        is_new = False

        if pedido:
            # Si el paquete existía previamente y estaba en otra zona o no estaba en bodega
            if str(pedido.zona_id) != str(zone_id) or pedido.estado != 'EN_BODEGA':
                zone_changed = True

            upd_query = text("""
                UPDATE pedidos 
                SET zona_id = :zone_id,
                    zona_nombre = :zone_name,
                    estado = 'EN_BODEGA',
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id AND tenant_id = :tenant_id
                RETURNING id, guia, cliente, direccion_original, zona_nombre, estado
            """)
            upd_res = await session.execute(upd_query, {
                "zone_id": zone_id,
                "zone_name": target_zone_name,
                "id": pedido.id,
                "tenant_id": x_tenant_id
            })
            await session.commit()
            updated_p = upd_res.first()
            return {
                "status": "ok",
                "is_new": False,
                "zone_changed": zone_changed,
                "previous_zone": pedido.zona_nombre or "Sin Zona",
                "guia": updated_p.guia,
                "cliente": updated_p.cliente or "Cliente no registrado",
                "direccion": updated_p.direccion_original,
                "zona_nombre": updated_p.zona_nombre,
                "estado": updated_p.estado
            }
        else:
            # Guía nueva: Se crea automáticamente en estado EN_BODEGA
            ins_query = text("""
                INSERT INTO pedidos (
                    tenant_id, guia, cliente, direccion_original, zona_id, zona_nombre, estado
                ) VALUES (
                    :tenant_id, :guia, 'Ingreso Manual Bodega', 'Registrado en escaneo de inventario', :zone_id, :zone_name, 'EN_BODEGA'
                )
                RETURNING id, guia, cliente, direccion_original, zona_nombre, estado
            """)
            ins_res = await session.execute(ins_query, {
                "tenant_id": x_tenant_id,
                "guia": barcode,
                "zone_id": zone_id,
                "zone_name": target_zone_name
            })
            await session.commit()
            new_p = ins_res.first()
            return {
                "status": "ok",
                "is_new": True,
                "zone_changed": True,
                "previous_zone": "Nueva Guía",
                "guia": new_p.guia,
                "cliente": new_p.cliente,
                "direccion": new_p.direccion_original,
                "zona_nombre": new_p.zona_nombre,
                "estado": new_p.estado
            }


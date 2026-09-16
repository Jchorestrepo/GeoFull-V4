from typing import List, Optional, Any, Dict
import uuid
import json
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel
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
    color: str = "#10b981"
    activa: bool


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
async def list_zones(x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")):
    """Lista las zonas GeoJSON de la empresa."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        query = text("""
            SELECT id, nombre_zona, codigo_zona, activa
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
                color=colors[idx % len(colors)], activa=r.activa
            )
            for idx, r in enumerate(rows)
        ]


@router.get("/geojson")
async def get_zones_geojson(x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")):
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
    x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")
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
async def purge_all_zones(x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")):
    """Elimina todas las zonas personalizadas de la empresa."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM zonas_personalizadas WHERE tenant_id = :tenant_id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id})
        await session.commit()
        return {"status": "ok", "eliminados": res.rowcount}


@router.delete("/{zone_id}")
async def delete_zone(zone_id: uuid.UUID, x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")):
    """Elimina una zona específica por ID."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = text("DELETE FROM zonas_personalizadas WHERE id = :id AND tenant_id = :tenant_id")
        res = await session.execute(sql, {"id": zone_id, "tenant_id": x_tenant_id})
        await session.commit()
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Zona no encontrada")
        return {"status": "ok", "message": "Zona eliminada exitosamente"}


@router.put("/{zone_id}/toggle")
async def toggle_zone(zone_id: uuid.UUID, x_tenant_id: str = Header("empresa_demo", alias="X-Tenant-ID")):
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

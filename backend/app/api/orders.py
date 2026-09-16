from typing import List, Optional, Dict, Any
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from app.core.database import get_db_session
from app.geocoder.sanitizer import sanitize_address
from app.geocoder.normalizer import normalize_address
from app.geocoder.geocoder import geocode_address
from app.geocoder.sectorizer import sectorize_point

router = APIRouter(prefix="/orders", tags=["Pedidos & Geocodificación Operativa"])


class OrderCreateRequest(BaseModel):
    guia: str
    cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None
    direccion_original: str
    datos_extra: Optional[Dict[str, Any]] = None


class AssignZoneRequest(BaseModel):
    zona_id: uuid.UUID


class OrderResponse(BaseModel):
    id: uuid.UUID
    tenant_id: str
    guia: str
    cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None
    direccion_original: str
    direccion_limpia: Optional[str] = None
    observaciones_entrega: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    nivel_precision: Optional[str] = None
    precision_metros: Optional[str] = None
    confianza_score: Optional[int] = None
    zona_id: Optional[uuid.UUID] = None
    zona_nombre: Optional[str] = None
    estado: str
    domiciliario_id: Optional[uuid.UUID] = None
    domiciliario_nombre: Optional[str] = None
    fecha_entrega: Optional[datetime] = None
    pagado_conductor: Optional[bool] = False
    proveedor_entrega: Optional[str] = None
    alerta_rango_logico: bool
    detalle_alerta_rango: Optional[str] = None


def _build_order_response(r) -> OrderResponse:
    return OrderResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        guia=r.guia,
        cliente=r.cliente,
        telefono_cliente=r.telefono_cliente,
        direccion_original=r.direccion_original,
        direccion_limpia=r.direccion_limpia,
        observaciones_entrega=r.observaciones_entrega,
        latitud=float(r.latitud) if r.latitud else None,
        longitud=float(r.longitud) if r.longitud else None,
        nivel_precision=r.nivel_precision,
        precision_metros=r.precision_metros,
        confianza_score=r.confianza_score,
        zona_id=r.zona_id,
        zona_nombre=r.zona_nombre,
        estado=r.estado,
        domiciliario_id=r.domiciliario_id,
        domiciliario_nombre=r.domiciliario_nombre,
        fecha_entrega=r.fecha_entrega,
        pagado_conductor=r.pagado_conductor if r.pagado_conductor is not None else False,
        proveedor_entrega=r.proveedor_entrega,
        alerta_rango_logico=r.alerta_rango_logico,
        detalle_alerta_rango=r.detalle_alerta_rango
    )


@router.get("/", response_model=List[OrderResponse])
async def list_orders(
    estado: Optional[str] = Query(None),
    zona_id: Optional[uuid.UUID] = Query(None),
    solo_bodega: Optional[bool] = Query(False),
    limit: int = Query(10000, le=50000),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID")
):
    """Lista pedidos del tenant con filtros por estado, zona o sólo paquetes activos en bodega/ruta."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sql = "SELECT * FROM pedidos WHERE tenant_id = :tenant_id"
        params = {"tenant_id": x_tenant_id, "limit": limit if isinstance(limit, int) else 10000}

        if estado and isinstance(estado, str):
            sql += " AND estado = :estado"
            params["estado"] = estado
        if zona_id and isinstance(zona_id, uuid.UUID):
            sql += " AND zona_id = :zona_id"
            params["zona_id"] = zona_id

        if solo_bodega:
            sql += " AND (estado IS NULL OR estado NOT IN ('ENTREGADO', 'PERDIDO', 'DEVUELTO', 'DEVUELTO_PROVEEDOR', 'DEVOLUCION', 'ANULADO'))"

        sql += " ORDER BY fecha_importacion DESC LIMIT :limit"

        res = await session.execute(text(sql), params)
        rows = res.fetchall()
        return [_build_order_response(r) for r in rows]


@router.post("/process-single", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def process_single_order(
    req: OrderCreateRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID")
):
    """Procesa una guía individual: Sanitizer -> Normalizer -> Geocoder -> Sectorizer -> UPSERT en BD."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        sanitized = sanitize_address(req.direccion_original)
        normalized = normalize_address(sanitized.direccion_nucleo)
        geocoded = await geocode_address(session, normalized)
        sectorized = await sectorize_point(
            session, x_tenant_id,
            geocoded.latitud, geocoded.longitud,
            normalized
        )

        geom_sql = "ST_SetSRID(ST_Point(:lon, :lat), 4326)" if geocoded.longitud and geocoded.latitud else "NULL"
        datos_extra_json = json.dumps(req.datos_extra) if req.datos_extra else "{}"

        # UPSERT por guía única (tenant_id, guia)
        upsert_sql = text(f"""
            INSERT INTO pedidos (
                tenant_id, guia, cliente, telefono_cliente,
                direccion_original, direccion_limpia, observaciones_entrega, datos_extra,
                latitud, longitud, geom, nivel_precision, precision_metros,
                confianza_score, zona_id, zona_nombre, estado,
                alerta_rango_logico, detalle_alerta_rango
            ) VALUES (
                :tenant_id, :guia, :cliente, :telefono_cliente,
                :direccion_original, :direccion_limpia, :observaciones_entrega, CAST(:datos_extra AS JSONB),
                :latitud, :longitud, {geom_sql}, :nivel_precision, :precision_metros,
                :confianza_score, :zona_id, :zona_nombre, :estado,
                :alerta_rango, :detalle_alerta
            )
            ON CONFLICT (tenant_id, guia) DO UPDATE SET
                cliente = COALESCE(EXCLUDED.cliente, pedidos.cliente),
                telefono_cliente = COALESCE(EXCLUDED.telefono_cliente, pedidos.telefono_cliente),
                direccion_original = EXCLUDED.direccion_original,
                direccion_limpia = EXCLUDED.direccion_limpia,
                observaciones_entrega = EXCLUDED.observaciones_entrega,
                datos_extra = EXCLUDED.datos_extra,
                latitud = EXCLUDED.latitud,
                longitud = EXCLUDED.longitud,
                geom = EXCLUDED.geom,
                nivel_precision = EXCLUDED.nivel_precision,
                precision_metros = EXCLUDED.precision_metros,
                confianza_score = EXCLUDED.confianza_score,
                zona_id = EXCLUDED.zona_id,
                zona_nombre = EXCLUDED.zona_nombre,
                estado = EXCLUDED.estado,
                alerta_rango_logico = EXCLUDED.alerta_rango_logico,
                detalle_alerta_rango = EXCLUDED.detalle_alerta_rango,
                fecha_actualizacion = CURRENT_TIMESTAMP
            RETURNING *
        """)

        res = await session.execute(upsert_sql, {
            "tenant_id": x_tenant_id,
            "guia": req.guia,
            "cliente": req.cliente,
            "telefono_cliente": req.telefono_cliente or sanitized.observaciones_entrega,
            "direccion_original": req.direccion_original,
            "direccion_limpia": normalized.direccion_db if normalized else None,
            "observaciones_entrega": sanitized.observaciones_entrega,
            "datos_extra": datos_extra_json,
            "latitud": geocoded.latitud,
            "longitud": geocoded.longitud,
            "lon": geocoded.longitud,
            "lat": geocoded.latitud,
            "nivel_precision": geocoded.nivel_precision,
            "precision_metros": geocoded.precision_metros,
            "confianza_score": geocoded.confianza_score,
            "zona_id": sectorized.zona_id,
            "zona_nombre": sectorized.zona_nombre,
            "estado": sectorized.estado,
            "alerta_rango": sectorized.alerta_rango_logico,
            "detalle_alerta": sectorized.detalle_alerta_rango
        })

        await session.commit()
        r = res.first()

        return _build_order_response(r)


@router.patch("/{order_id}/assign-zone", response_model=OrderResponse)
async def assign_zone_manually(
    order_id: uuid.UUID,
    req: AssignZoneRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID")
):
    """Asigna o reasigna manualmente una zona a un pedido (ej: pedidos FUERA_DE_ZONA)."""
    async for session in get_db_session(tenant_id=x_tenant_id):
        res_z = await session.execute(
            text("SELECT nombre_zona FROM zonas_personalizadas WHERE id = :zid AND tenant_id = :tenant_id LIMIT 1"),
            {"zid": req.zona_id, "tenant_id": x_tenant_id}
        )
        z = res_z.first()
        if not z:
            raise HTTPException(status_code=404, detail="La zona seleccionada no existe")

        update_sql = text("""
            UPDATE pedidos
            SET zona_id = :zona_id,
                zona_nombre = :zona_nombre,
                estado = 'SECTORIZADO',
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :id AND tenant_id = :tenant_id
            RETURNING *
        """)
        res = await session.execute(update_sql, {
            "id": order_id,
            "tenant_id": x_tenant_id,
            "zona_id": req.zona_id,
            "zona_nombre": z.nombre_zona
        })
        await session.commit()
        r = res.first()
        if not r:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        return _build_order_response(r)


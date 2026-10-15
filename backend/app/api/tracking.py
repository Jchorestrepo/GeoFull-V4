from typing import List, Optional, Dict, Any
import uuid
import json
from decimal import Decimal
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text
from app.core.dependencies import get_current_user, get_tenant_id
from app.core.database import get_db_session

router = APIRouter(prefix="/tracking", tags=["Historial & Rastreo Unificado"])


class BatchTrackingRequest(BaseModel):
    guias: List[str]


class TrackingEventResponse(BaseModel):
    id: Optional[uuid.UUID] = None
    fecha: datetime
    tipo_evento: str
    descripcion: str
    estado_anterior: Optional[str] = None
    estado_nuevo: Optional[str] = None
    usuario_nombre: str
    detalles: Optional[Dict[str, Any]] = None


class OrderSummaryResponse(BaseModel):
    id: uuid.UUID
    guia: str
    cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None
    direccion_original: str
    direccion_limpia: Optional[str] = None
    zona_nombre: Optional[str] = None
    estado: str
    domiciliario_nombre: Optional[str] = None
    proveedor_entrega: Optional[str] = None
    fecha_importacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    total_eventos: int = 0


class OrderDetailResponse(OrderSummaryResponse):
    observaciones_entrega: Optional[str] = None
    complemento: Optional[str] = None
    zona_id: Optional[uuid.UUID] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    nivel_precision: Optional[str] = None
    precision_metros: Optional[str] = None
    confianza_score: Optional[int] = None
    domiciliario_id: Optional[uuid.UUID] = None
    fecha_entrega: Optional[datetime] = None
    pagado_conductor: Optional[bool] = False
    alerta_rango_logico: Optional[bool] = False
    detalle_alerta_rango: Optional[str] = None
    estado_normalizacion: Optional[str] = None
    clave_direccion: Optional[str] = None
    confianza_normalizacion: Optional[float] = None
    advertencias_normalizacion: Optional[List[str]] = []
    datos_extra: Optional[Dict[str, Any]] = None
    fecha_pago_conductor: Optional[datetime] = None


class OrderDetailWithHistoryResponse(BaseModel):
    pedido: OrderDetailResponse
    historial: List[TrackingEventResponse]


def _extraer_cliente_fallback(cliente: Optional[str], datos_extra: Optional[dict]) -> Optional[str]:
    if cliente and str(cliente).strip():
        return str(cliente).strip()
    if datos_extra and isinstance(datos_extra, dict):
        for key in ['El nombre del destinatario', 'Nombre del destinatario', 'Destinatario', 'Nombre Cliente', 'Cliente', 'destinatario', 'cliente']:
            val = datos_extra.get(key)
            if val and str(val).strip():
                return str(val).strip()
    return cliente or None


def _extraer_telefono_fallback(telefono: Optional[str], datos_extra: Optional[dict]) -> Optional[str]:
    if telefono and str(telefono).strip():
        return str(telefono).strip()
    if datos_extra and isinstance(datos_extra, dict):
        for key in ['Teléfono entrante', 'Telefono', 'Teléfono', 'Celular', 'telefono_cliente', 'tel']:
            val = datos_extra.get(key)
            if val and str(val).strip():
                return str(val).strip()
    return telefono or None


def _extraer_domiciliario_fallback(domiciliario: Optional[str], datos_extra: Optional[dict]) -> Optional[str]:
    if domiciliario and str(domiciliario).strip():
        return str(domiciliario).strip()
    if datos_extra and isinstance(datos_extra, dict):
        for key in ['conductor de entrega', 'Conductor', 'Mensajero', 'Domiciliario', 'conductor']:
            val = datos_extra.get(key)
            if val and str(val).strip():
                return str(val).strip()
    return domiciliario or None


@router.post("/batch-summary", response_model=List[OrderSummaryResponse])
async def get_batch_orders_summary(
    req: BatchTrackingRequest,
    current_user: dict = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id)
):
    """
    Obtiene la lista de información resumida para un lote de números de guía pegados.
    Conserva el orden solicitado y limpia duplicados/espacios.
    """
    if not req.guias:
        return []

    # Limpiar y deduplicar preservando orden
    guias_limpias = []
    vistas = set()
    for g in req.guias:
        clean = str(g).strip().upper()
        if clean and clean not in vistas:
            vistas.add(clean)
            guias_limpias.append(clean)

    if not guias_limpias:
        return []

    # Limitar a máximo 500 guías por lote para optimizar rendimiento
    guias_a_consultar = guias_limpias[:500]

    async for session in get_db_session(tenant_id=tenant_id):
        query = text("""
            SELECT 
                p.id,
                p.guia,
                p.cliente,
                p.telefono_cliente,
                p.direccion_original,
                p.direccion_limpia,
                p.zona_nombre,
                p.estado,
                p.domiciliario_nombre,
                p.proveedor_entrega,
                p.datos_extra,
                p.fecha_importacion,
                p.fecha_actualizacion,
                COALESCE(h.total_h, 0) as total_eventos
            FROM pedidos p
            LEFT JOIN (
                SELECT guia, COUNT(*) as total_h
                FROM pedidos_historial
                WHERE tenant_id = :tenant_id
                  AND (guia = ANY(:guias) OR UPPER(guia) = ANY(:guias))
                GROUP BY guia
            ) h ON (h.guia = p.guia OR UPPER(h.guia) = UPPER(p.guia))
            WHERE p.tenant_id = :tenant_id
              AND (p.guia = ANY(:guias) OR UPPER(p.guia) = ANY(:guias))
        """)

        res = await session.execute(query, {
            "tenant_id": tenant_id,
            "guias": guias_a_consultar
        })
        rows = res.fetchall()

        # Mapear para devolver en el mismo orden en que fueron consultadas
        dict_pedidos = {r.guia.upper(): r for r in rows}

        resultado = []
        for g in guias_a_consultar:
            if g in dict_pedidos:
                r = dict_pedidos[g]
                cliente_val = _extraer_cliente_fallback(r.cliente, r.datos_extra)
                tel_val = _extraer_telefono_fallback(r.telefono_cliente, r.datos_extra)
                dom_val = _extraer_domiciliario_fallback(r.domiciliario_nombre, r.datos_extra)

                resultado.append(OrderSummaryResponse(
                    id=r.id,
                    guia=r.guia,
                    cliente=cliente_val,
                    telefono_cliente=tel_val,
                    direccion_original=r.direccion_original,
                    direccion_limpia=r.direccion_limpia,
                    zona_nombre=r.zona_nombre,
                    estado=r.estado,
                    domiciliario_nombre=dom_val,
                    proveedor_entrega=r.proveedor_entrega,
                    fecha_importacion=r.fecha_importacion,
                    fecha_actualizacion=r.fecha_actualizacion,
                    total_eventos=r.total_eventos
                ))
            else:
                # Guía no encontrada en base de datos
                resultado.append(OrderSummaryResponse(
                    id=uuid.uuid4(),
                    guia=g,
                    cliente="No Registrado",
                    telefono_cliente=None,
                    direccion_original="Guía no encontrada en el sistema",
                    direccion_limpia=None,
                    zona_nombre=None,
                    estado="NO_REGISTRADO",
                    domiciliario_nombre=None,
                    proveedor_entrega=None,
                    fecha_importacion=None,
                    fecha_actualizacion=None,
                    total_eventos=0
                ))

        return resultado


@router.get("/{guia}", response_model=OrderDetailWithHistoryResponse)
async def get_order_tracking_history(
    guia: str,
    current_user: dict = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id)
):
    """
    Obtiene la ficha técnica completa con todos los datos asociados y la línea de tiempo de eventos.
    """
    guia_raw = guia.strip()
    guia_clean = guia_raw.upper()

    async for session in get_db_session(tenant_id=tenant_id):
        # 1. Obtener pedido con todos los campos asociados
        p_query = text("""
            SELECT 
                id, tenant_id, guia, cliente, telefono_cliente, direccion_original,
                direccion_limpia, complemento, observaciones_entrega, latitud, longitud,
                nivel_precision, precision_metros, confianza_score, zona_id, zona_nombre,
                estado, domiciliario_id, domiciliario_nombre, fecha_entrega, pagado_conductor,
                proveedor_entrega, alerta_rango_logico, detalle_alerta_rango,
                estado_normalizacion, clave_direccion, confianza_normalizacion,
                advertencias_normalizacion, datos_extra, fecha_importacion,
                fecha_actualizacion, fecha_pago_conductor
            FROM pedidos
            WHERE tenant_id = :tenant_id 
              AND (guia = :guia OR UPPER(guia) = :guia_upper OR LOWER(guia) = :guia_lower)
            LIMIT 1
        """)
        p_res = await session.execute(p_query, {
            "tenant_id": tenant_id,
            "guia": guia_raw,
            "guia_upper": guia_clean,
            "guia_lower": guia_raw.lower()
        })
        p = p_res.first()

        if not p:
            raise HTTPException(status_code=404, detail=f"La guía '{guia_raw}' no existe en el sistema.")

        # 2. Consultar historial registrado
        h_query = text("""
            SELECT 
                id, tipo_evento, descripcion, estado_anterior, estado_nuevo,
                usuario_nombre, detalles, created_at
            FROM pedidos_historial
            WHERE tenant_id = :tenant_id 
              AND (guia = :guia OR UPPER(guia) = :guia_upper)
            ORDER BY created_at ASC
        """)
        h_res = await session.execute(h_query, {
            "tenant_id": tenant_id,
            "guia": p.guia,
            "guia_upper": p.guia.upper()
        })
        h_rows = h_res.fetchall()

        eventos: List[TrackingEventResponse] = []
        has_importacion = False
        for r in h_rows:
            if r.tipo_evento == "IMPORTACION":
                has_importacion = True
            eventos.append(TrackingEventResponse(
                id=r.id,
                fecha=r.created_at,
                tipo_evento=r.tipo_evento,
                descripcion=r.descripcion,
                estado_anterior=r.estado_anterior,
                estado_nuevo=r.estado_nuevo,
                usuario_nombre=r.usuario_nombre or "Sistema",
                detalles=r.detalles
            ))

        # Si el pedido no tiene evento explícito de IMPORTACION en la bitácora,
        # lo agregamos SIEMPRE como hito inicial histórico en la posición 0.
        if not has_importacion:
            f_imp = p.fecha_importacion or datetime.utcnow()
            desc_imp = f"【Importación】 Paquete registrado en el sistema. Dirección declarada: {p.direccion_original}"
            if p.zona_nombre:
                desc_imp += f" | Asignación inicial: 【{p.zona_nombre}】"
            evento_imp = TrackingEventResponse(
                fecha=f_imp,
                tipo_evento="IMPORTACION",
                descripcion=desc_imp,
                estado_anterior=None,
                estado_nuevo="CREADO",
                usuario_nombre="Sistema (Archivo)",
                detalles={"direccion": p.direccion_original, "zona": p.zona_nombre}
            )
            eventos.insert(0, evento_imp)

        # Ordenar siempre cronológicamente por fecha ascendente
        eventos.sort(key=lambda x: x.fecha)

        # Normalizar advertencias de normalización
        adv_norm = p.advertencias_normalizacion
        if isinstance(adv_norm, str):
            try:
                adv_norm = json.loads(adv_norm)
            except Exception:
                adv_norm = [adv_norm]
        if not isinstance(adv_norm, list):
            adv_norm = []

        cliente_final = _extraer_cliente_fallback(p.cliente, p.datos_extra)
        tel_final = _extraer_telefono_fallback(p.telefono_cliente, p.datos_extra)
        dom_final = _extraer_domiciliario_fallback(p.domiciliario_nombre, p.datos_extra)

        res_pedido = OrderDetailResponse(
            id=p.id,
            guia=p.guia,
            cliente=cliente_final,
            telefono_cliente=tel_final,
            direccion_original=p.direccion_original,
            direccion_limpia=p.direccion_limpia,
            observaciones_entrega=p.observaciones_entrega,
            complemento=p.complemento,
            zona_id=p.zona_id,
            zona_nombre=p.zona_nombre,
            estado=p.estado,
            latitud=float(p.latitud) if p.latitud is not None else None,
            longitud=float(p.longitud) if p.longitud is not None else None,
            nivel_precision=p.nivel_precision,
            precision_metros=p.precision_metros,
            confianza_score=p.confianza_score,
            domiciliario_id=p.domiciliario_id,
            domiciliario_nombre=dom_final,
            fecha_entrega=p.fecha_entrega,
            pagado_conductor=bool(p.pagado_conductor) if p.pagado_conductor is not None else False,
            proveedor_entrega=p.proveedor_entrega,
            alerta_rango_logico=bool(p.alerta_rango_logico) if p.alerta_rango_logico is not None else False,
            detalle_alerta_rango=p.detalle_alerta_rango,
            estado_normalizacion=p.estado_normalizacion,
            clave_direccion=p.clave_direccion,
            confianza_normalizacion=float(p.confianza_normalizacion) if p.confianza_normalizacion is not None else None,
            advertencias_normalizacion=adv_norm,
            datos_extra=p.datos_extra if isinstance(p.datos_extra, dict) else {},
            fecha_importacion=p.fecha_importacion,
            fecha_actualizacion=p.fecha_actualizacion,
            fecha_pago_conductor=p.fecha_pago_conductor,
            total_eventos=len(eventos)
        )

        return OrderDetailWithHistoryResponse(
            pedido=res_pedido,
            historial=eventos
        )

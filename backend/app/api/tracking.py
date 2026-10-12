from typing import List, Optional, Dict, Any
import uuid
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
    fecha_importacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    total_eventos: int = 0


class OrderDetailWithHistoryResponse(BaseModel):
    pedido: OrderSummaryResponse
    historial: List[TrackingEventResponse]


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
                p.fecha_importacion,
                p.fecha_actualizacion,
                COALESCE(h.total_h, 0) as total_eventos
            FROM pedidos p
            LEFT JOIN (
                SELECT guia, COUNT(*) as total_h
                FROM pedidos_historial
                WHERE tenant_id = :tenant_id
                GROUP BY guia
            ) h ON h.guia = p.guia
            WHERE p.tenant_id = :tenant_id
              AND p.guia = ANY(:guias)
        """)

        res = await session.execute(query, {
            "tenant_id": tenant_id,
            "guias": guias_a_consultar
        })
        rows = res.fetchall()

        # Mapear para devolver en el mismo orden en que fueron consultadas
        dict_pedidos = {r.guia: r for r in rows}

        resultado = []
        for g in guias_a_consultar:
            if g in dict_pedidos:
                r = dict_pedidos[g]
                resultado.append(OrderSummaryResponse(
                    id=r.id,
                    guia=r.guia,
                    cliente=r.cliente,
                    telefono_cliente=r.telefono_cliente,
                    direccion_original=r.direccion_original,
                    direccion_limpia=r.direccion_limpia,
                    zona_nombre=r.zona_nombre,
                    estado=r.estado,
                    domiciliario_nombre=r.domiciliario_nombre,
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
    Obtiene la ficha técnica y la línea de tiempo completa de eventos de una guía específica.
    """
    guia_clean = guia.strip().upper()

    async for session in get_db_session(tenant_id=tenant_id):
        # 1. Obtener pedido
        p_query = text("""
            SELECT 
                id, guia, cliente, telefono_cliente, direccion_original,
                direccion_limpia, zona_nombre, estado, domiciliario_nombre,
                fecha_importacion, fecha_actualizacion, nivel_precision,
                precision_metros, confianza_score, proveedor_entrega,
                fecha_entrega
            FROM pedidos
            WHERE tenant_id = :tenant_id AND guia = :guia
            LIMIT 1
        """)
        p_res = await session.execute(p_query, {"tenant_id": tenant_id, "guia": guia_clean})
        p = p_res.first()

        if not p:
            raise HTTPException(status_code=404, detail=f"La guía '{guia_clean}' no existe en el sistema.")

        # 2. Consultar historial registrado
        h_query = text("""
            SELECT 
                id, tipo_evento, descripcion, estado_anterior, estado_nuevo,
                usuario_nombre, detalles, created_at
            FROM pedidos_historial
            WHERE tenant_id = :tenant_id AND guia = :guia
            ORDER BY created_at ASC
        """)
        h_res = await session.execute(h_query, {"tenant_id": tenant_id, "guia": guia_clean})
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

        # Si el pedido no tiene evento explícito de IMPORTACION en la bitácora (ej. creado antes o importado previamente),
        # lo agregamos SIEMPRE como hito inicial histórico en la posición 0.
        if not has_importacion:
            f_imp = p.fecha_importacion or datetime.utcnow()
            desc_imp = f"【Importación】 Paquete registrado en el sistema. Dirección: {p.direccion_original}"
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

        res_pedido = OrderSummaryResponse(
            id=p.id,
            guia=p.guia,
            cliente=p.cliente,
            telefono_cliente=p.telefono_cliente,
            direccion_original=p.direccion_original,
            direccion_limpia=p.direccion_limpia,
            zona_nombre=p.zona_nombre,
            estado=p.estado,
            domiciliario_nombre=p.domiciliario_nombre,
            fecha_importacion=p.fecha_importacion,
            fecha_actualizacion=p.fecha_actualizacion,
            total_eventos=len(eventos)
        )

        return OrderDetailWithHistoryResponse(
            pedido=res_pedido,
            historial=eventos
        )

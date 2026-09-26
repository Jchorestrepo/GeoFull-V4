from typing import List, Optional, Dict, Any
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from app.core.database import get_db_session

router = APIRouter(prefix="/reconciliation", tags=["Control & Conciliación Diaria (Etapa 5)"])


class RouteItemRequest(BaseModel):
    guia: str
    domiciliario_nombre: str
    delivered_time: Optional[str] = None
    proveedor: Optional[str] = "iMile"
    datos_extra: Optional[Dict[str, Any]] = None


class BatchRouteRequest(BaseModel):
    items: List[RouteItemRequest]


from datetime import datetime, timezone, timedelta

BOGOTA_TZ = timezone(timedelta(hours=-5))

class DriverUnifyRequest(BaseModel):
    cedula_real: str
    driver_ids: List[uuid.UUID]


def parse_local_timestamp(raw_val: Optional[Any]) -> Optional[datetime]:
    """
    Parsea fechas/horas entregadas respetando estrictamente la zona horaria local de Colombia (-05:00).
    Soporta formato ISO/estándar y números de serie de fecha de Excel (ej: 46279.70549768519).
    Retorna un objeto datetime consciente de la zona horaria compatible con asyncpg.
    """
    if not raw_val or not str(raw_val).strip() or str(raw_val).strip().lower() in ['none', 'null', 'nan', '']:
        return None

    val_str = str(raw_val).strip()

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%Y/%m/%d %H:%M:%S"
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(val_str, fmt)
            return dt.replace(tzinfo=BOGOTA_TZ)
        except ValueError:
            continue

    # Soporte para Número de Serie de Fecha de Excel (ej: 46279.70549768519)
    try:
        val_num = float(val_str)
        if 30000 < val_num < 80000:  # Rango de fechas Excel aproximado (1982 a 2119)
            excel_base = datetime(1899, 12, 30)
            dt = excel_base + timedelta(days=val_num)
            return dt.replace(tzinfo=BOGOTA_TZ)
    except (ValueError, TypeError):
        pass

    return None


async def get_or_create_driver(session, tenant_id: str, driver_name: str) -> Dict[str, Any]:
    """
    Busca un domiciliario por su nombre o alias registrado.
    Si no existe, crea un nuevo registro con cédula alfanumérica temporal (AUTO-DA-...).
    """
    clean_name = driver_name.strip()
    if not clean_name:
        clean_name = "CONDUCTOR NO ESPECIFICADO"

    # 1. Buscar por nombre completo exacto o alias en JSONB
    query_search = text("""
        SELECT id, nombre_completo, cedula, alias_nombres
        FROM personal_conductores
        WHERE tenant_id = :tenant_id
          AND (
              LOWER(nombre_completo) = LOWER(:name)
              OR alias_nombres @> CAST(:name_json AS jsonb)
          )
        LIMIT 1
    """)
    res = await session.execute(query_search, {
        "tenant_id": tenant_id,
        "name": clean_name,
        "name_json": json.dumps([clean_name])
    })
    driver = res.first()

    if driver:
        return {"id": driver.id, "nombre_completo": driver.nombre_completo, "cedula": driver.cedula}

    # 2. Si no existe, autocrear domiciliario con cédula temporal alfanumérica única y tarifa predeterminada 2000
    auto_cedula = f"AUTO-DA-{uuid.uuid4().hex[:8].upper()}"
    query_insert = text("""
        INSERT INTO personal_conductores (tenant_id, nombre_completo, cedula, alias_nombres, tarifa_paquete, activo)
        VALUES (:tenant_id, :nombre, :cedula, CAST(:alias AS jsonb), 2000.0, true)
        RETURNING id, nombre_completo, cedula
    """)
    res_ins = await session.execute(query_insert, {
        "tenant_id": tenant_id,
        "nombre": clean_name,
        "cedula": auto_cedula,
        "alias": json.dumps([clean_name])
    })
    new_driver = res_ins.first()
    return {"id": new_driver.id, "nombre_completo": new_driver.nombre_completo, "cedula": new_driver.cedula}


@router.post("/process-routes")
async def process_batch_routes(req: BatchRouteRequest, x_tenant_id: str = Header("empresa_demo")):
    """
    Procesa masivamente la planilla de rutas asignadas / entregadas (iMile).
    - Si trae fecha/hora de entrega ('Delivered time') -> estado = 'ENTREGADO'.
    - Si NO trae fecha/hora de entrega -> estado = 'ASIGNADO' (en ruta).
    - Autocrea el domiciliario si no existe.
    - Marca pagado_conductor = FALSE para control de nómina.
    """
    if not req.items:
        raise HTTPException(status_code=400, detail="El lote de rutas está vacío")

    async for session in get_db_session(x_tenant_id):
        total_items = len(req.items)
        entregados_count = 0
        asignados_count = 0
        nuevos_creados = 0
        existentes_actualizados = 0
        conductores_vistos = set()

        for item in req.items:
            guia_clean = item.guia.strip()
            if not guia_clean:
                continue

            # Obtener o crear domiciliario por su nombre / alias
            driver_info = await get_or_create_driver(session, x_tenant_id, item.domiciliario_nombre)
            conductores_vistos.add(driver_info["nombre_completo"])

            # Parsear fecha de entrega respetando zona horaria local (-05:00)
            fecha_entrega_iso = parse_local_timestamp(item.delivered_time)

            # Determinar estado: si tiene fecha_entrega es ENTREGADO, si no es ASIGNADO
            nuevo_estado = "ENTREGADO" if fecha_entrega_iso else "ASIGNADO"
            if nuevo_estado == "ENTREGADO":
                entregados_count += 1
            else:
                asignados_count += 1

            datos_extra_json = json.dumps(item.datos_extra) if item.datos_extra else "{}"
            proveedor = item.proveedor or "iMile"

            # Verificar si el pedido ya existe en el sistema
            check_sql = text("SELECT id FROM pedidos WHERE tenant_id = :tenant_id AND guia = :guia LIMIT 1")
            res_check = await session.execute(check_sql, {"tenant_id": x_tenant_id, "guia": guia_clean})
            existing = res_check.first()

            if existing:
                existentes_actualizados += 1
                update_sql = text("""
                    UPDATE pedidos
                    SET estado = :estado,
                        fecha_entrega = :fecha_entrega,
                        domiciliario_id = :dom_id,
                        domiciliario_nombre = :dom_nombre,
                        pagado_conductor = FALSE,
                        proveedor_entrega = :proveedor,
                        fecha_actualizacion = CURRENT_TIMESTAMP
                    WHERE tenant_id = :tenant_id AND guia = :guia
                """)
                await session.execute(update_sql, {
                    "tenant_id": x_tenant_id,
                    "guia": guia_clean,
                    "estado": nuevo_estado,
                    "fecha_entrega": fecha_entrega_iso,
                    "dom_id": driver_info["id"],
                    "dom_nombre": driver_info["nombre_completo"],
                    "proveedor": proveedor
                })
            else:
                nuevos_creados += 1
                insert_sql = text("""
                    INSERT INTO pedidos (
                        tenant_id, guia, direccion_original, estado,
                        fecha_entrega, domiciliario_id, domiciliario_nombre,
                        pagado_conductor, proveedor_entrega, datos_extra
                    ) VALUES (
                        :tenant_id, :guia, 'CREADO DESDE CONCILIACIÓN', :estado,
                        :fecha_entrega, :dom_id, :dom_nombre,
                        FALSE, :proveedor, CAST(:datos_extra AS JSONB)
                    )
                """)
                await session.execute(insert_sql, {
                    "tenant_id": x_tenant_id,
                    "guia": guia_clean,
                    "estado": nuevo_estado,
                    "fecha_entrega": fecha_entrega_iso,
                    "dom_id": driver_info["id"],
                    "dom_nombre": driver_info["nombre_completo"],
                    "proveedor": proveedor,
                    "datos_extra": datos_extra_json
                })

        await session.commit()

        return {
            "status": "ok",
            "total_procesados": total_items,
            "entregados_count": entregados_count,
            "asignados_count": asignados_count,
            "nuevos_creados": nuevos_creados,
            "existentes_actualizados": existentes_actualizados,
            "conductores_involucrados": len(conductores_vistos),
            "nombres_conductores": list(conductores_vistos)
        }


@router.post("/drivers/unify")
async def unify_drivers(req: DriverUnifyRequest, x_tenant_id: str = Header("empresa_demo")):
    """
    Unifica dos o más registros de domiciliarios que compartan la misma cédula real.
    Combina sus alias_nombres y reasigna todas sus entregas históricas al conductor principal.
    """
    if len(req.driver_ids) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos dos domiciliarios para unificar")

    async for session in get_db_session(x_tenant_id):
        primary_id = req.driver_ids[0]
        secondary_ids = req.driver_ids[1:]

        # 1. Obtener nombres y alias de los domiciliarios secundarios
        get_sec_sql = text("""
            SELECT id, nombre_completo, alias_nombres
            FROM personal_conductores
            WHERE tenant_id = :tenant_id AND id = ANY(:sec_ids)
        """)
        res_sec = await session.execute(get_sec_sql, {"tenant_id": x_tenant_id, "sec_ids": secondary_ids})
        sec_rows = res_sec.fetchall()

        all_aliases = set()
        for r in sec_rows:
            all_aliases.add(r.nombre_completo)
            if r.alias_nombres:
                try:
                    aliases_list = json.loads(r.alias_nombres) if isinstance(r.alias_nombres, str) else r.alias_nombres
                    for a in aliases_list:
                        all_aliases.add(a)
                except Exception:
                    pass

        # 2. Actualizar el conductor principal con la cédula real y los nuevos alias acumulados
        get_prim_sql = text("SELECT alias_nombres FROM personal_conductores WHERE tenant_id = :tenant_id AND id = :id LIMIT 1")
        res_prim = await session.execute(get_prim_sql, {"tenant_id": x_tenant_id, "id": primary_id})
        prim_row = res_prim.first()

        if prim_row and prim_row.alias_nombres:
            try:
                aliases_list = json.loads(prim_row.alias_nombres) if isinstance(prim_row.alias_nombres, str) else prim_row.alias_nombres
                for a in aliases_list:
                    all_aliases.add(a)
            except Exception:
                pass

        update_prim_sql = text("""
            UPDATE personal_conductores
            SET cedula = :cedula_real,
                alias_nombres = CAST(:aliases AS jsonb)
            WHERE tenant_id = :tenant_id AND id = :id
        """)
        await session.execute(update_prim_sql, {
            "tenant_id": x_tenant_id,
            "id": primary_id,
            "cedula_real": req.cedula_real,
            "aliases": json.dumps(list(all_aliases))
        })

        # 3. Reasignar todos los pedidos de los conductores secundarios al principal
        reassign_orders_sql = text("""
            UPDATE pedidos
            SET domiciliario_id = :primary_id
            WHERE tenant_id = :tenant_id AND domiciliario_id = ANY(:sec_ids)
        """)
        await session.execute(reassign_orders_sql, {
            "tenant_id": x_tenant_id,
            "primary_id": primary_id,
            "sec_ids": secondary_ids
        })

        # 4. Eliminar los registros de domiciliarios secundarios ya unificados
        delete_sec_sql = text("DELETE FROM personal_conductores WHERE tenant_id = :tenant_id AND id = ANY(:sec_ids)")
        await session.execute(delete_sec_sql, {"tenant_id": x_tenant_id, "sec_ids": secondary_ids})

        await session.commit()

        return {
            "status": "ok",
            "message": f"Conductores unificados exitosamente bajo la cédula {req.cedula_real}",
            "primary_id": primary_id,
            "alias_acumulados": list(all_aliases)
        }


@router.get("/summary")
async def get_reconciliation_summary(x_tenant_id: str = Header("empresa_demo")):
    """
    Obtiene el resumen operativo de conciliaciones y entregas por domiciliario.
    """
    async for session in get_db_session(x_tenant_id):
        # 1. Resumen por Domiciliario
        drivers_summary_sql = text("""
            SELECT
                p.domiciliario_id,
                COALESCE(c.nombre_completo, p.domiciliario_nombre, 'SIN ASIGNAR') as domiciliario,
                COALESCE(c.cedula, 'N/A') as cedula,
                COUNT(*) FILTER (WHERE p.estado = 'ENTREGADO') as total_entregados,
                COUNT(*) FILTER (WHERE p.estado = 'ASIGNADO') as total_en_ruta,
                COUNT(*) FILTER (WHERE p.estado = 'ENTREGADO' AND p.pagado_conductor = FALSE) as pendientes_liquidacion
            FROM pedidos p
            LEFT JOIN personal_conductores c ON p.domiciliario_id = c.id
            WHERE p.tenant_id = :tenant_id AND p.domiciliario_id IS NOT NULL
            GROUP BY p.domiciliario_id, c.nombre_completo, p.domiciliario_nombre, c.cedula
            ORDER BY total_entregados DESC
        """)
        res_drivers = await session.execute(drivers_summary_sql, {"tenant_id": x_tenant_id})
        driver_rows = [dict(r._mapping) for r in res_drivers.fetchall()]

        # 2. Métricas Totales
        totals_sql = text("""
            SELECT
                COUNT(*) FILTER (WHERE estado = 'ENTREGADO') as total_entregados,
                COUNT(*) FILTER (WHERE estado = 'ASIGNADO') as total_asignados_en_ruta,
                COUNT(*) FILTER (WHERE estado = 'ENTREGADO' AND pagado_conductor = FALSE) as total_pendientes_pago_nomina
            FROM pedidos
            WHERE tenant_id = :tenant_id
        """)
        res_totals = await session.execute(totals_sql, {"tenant_id": x_tenant_id})
        tot = res_totals.first()

        return {
            "metricas": {
                "total_entregados": tot.total_entregados or 0,
                "total_asignados_en_ruta": tot.total_asignados_en_ruta or 0,
                "total_pendientes_pago_nomina": tot.total_pendientes_pago_nomina or 0
            },
            "domiciliarios": driver_rows
        }


class DriverCreateRequest(BaseModel):
    nombre_completo: str
    cedula: str
    nombres: Optional[str] = None
    apellidos: Optional[str] = None
    telefono: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    jefe_zona: Optional[str] = None
    tipo_contrato: Optional[str] = "PAQUETEO"
    tipo_remuneracion: Optional[str] = "DESTAJO"
    salario_fijo: Optional[float] = 0.0
    periodicidad_pago: Optional[str] = "GLOBAL"
    tarifa_paquete: Optional[float] = 2000.0
    banco: Optional[str] = None
    cuenta: Optional[str] = None
    tipo_cuenta: Optional[str] = "Ahorros"
    cc_titular: Optional[str] = None
    cuentas_bancarias: Optional[List[Dict[str, Any]]] = None
    plataformas: Optional[List[Dict[str, Any]]] = None
    foto: Optional[str] = None
    doc_cedula_frontal: Optional[str] = None
    doc_cedula_trasera: Optional[str] = None
    doc_servicios: Optional[str] = None
    doc_certificado_bancario: Optional[str] = None
    docs_rut: Optional[List[Dict[str, Any]]] = None


@router.get("/drivers")
async def list_drivers(
    search: Optional[str] = Query(None),
    x_tenant_id: str = Header("empresa_demo")
):
    """
    Lista domiciliarios ordenados alfabéticamente con filtro de búsqueda por nombre o cédula.
    """
    async for session in get_db_session(x_tenant_id):
        params = {"tenant_id": x_tenant_id}
        where_search = ""
        if search and search.strip():
            where_search = " AND (LOWER(c.nombre_completo) LIKE :s OR LOWER(c.cedula) LIKE :s) "
            params["s"] = f"%{search.strip().lower()}%"

        sql = f"""
            SELECT
                c.id,
                c.nombre_completo,
                c.cedula,
                c.nombres,
                c.apellidos,
                c.telefono,
                c.fecha_nacimiento,
                c.jefe_zona,
                c.tipo_contrato,
                COALESCE(c.tipo_remuneracion, 'DESTAJO') as tipo_remuneracion,
                COALESCE(c.salario_fijo, 0.0) as salario_fijo,
                COALESCE(c.periodicidad_pago, 'GLOBAL') as periodicidad_pago,
                COALESCE(c.tarifa_paquete, 2000.0) as tarifa_paquete,
                c.banco,
                c.cuenta,
                c.tipo_cuenta,
                c.cc_titular,
                c.cuentas_bancarias,
                c.plataformas,
                c.foto,
                c.doc_cedula_frontal,
                c.doc_cedula_trasera,
                c.doc_servicios,
                c.doc_certificado_bancario,
                c.docs_rut,
                c.alias_nombres,
                c.activo,
                COUNT(p.id) FILTER (WHERE p.estado = 'ENTREGADO') as total_entregados,
                COUNT(p.id) FILTER (WHERE p.estado = 'ASIGNADO') as total_en_ruta,
                COUNT(p.id) FILTER (WHERE p.estado = 'ENTREGADO' AND p.pagado_conductor = FALSE) as pendientes_liquidacion
            FROM personal_conductores c
            LEFT JOIN pedidos p ON p.domiciliario_id = c.id AND p.tenant_id = c.tenant_id
            WHERE c.tenant_id = :tenant_id {where_search}
            GROUP BY c.id, c.nombre_completo, c.cedula, c.nombres, c.apellidos, c.telefono,
                     c.fecha_nacimiento, c.jefe_zona, c.tipo_contrato, c.tipo_remuneracion,
                     c.salario_fijo, c.periodicidad_pago, c.tarifa_paquete,
                     c.banco, c.cuenta, c.tipo_cuenta, c.cc_titular, c.cuentas_bancarias,
                     c.plataformas, c.foto, c.doc_cedula_frontal, c.doc_cedula_trasera,
                     c.doc_servicios, c.doc_certificado_bancario, c.docs_rut, c.alias_nombres, c.activo
            ORDER BY c.nombre_completo ASC
        """
        res = await session.execute(text(sql), params)
        rows = [dict(r._mapping) for r in res.fetchall()]
        # Formatear fecha_nacimiento si existe
        for r in rows:
            if r.get("fecha_nacimiento"):
                r["fecha_nacimiento"] = str(r["fecha_nacimiento"])
        return rows


@router.post("/drivers", status_code=status.HTTP_201_CREATED)
async def create_driver(req: DriverCreateRequest, x_tenant_id: str = Header("empresa_demo")):
    """Crea un nuevo domiciliario/conductor en la plataforma."""
    async for session in get_db_session(x_tenant_id):
        check_sql = text("SELECT id FROM personal_conductores WHERE tenant_id = :tenant_id AND cedula = :cedula LIMIT 1")
        res_check = await session.execute(check_sql, {"tenant_id": x_tenant_id, "cedula": req.cedula.strip()})
        if res_check.first():
            raise HTTPException(status_code=400, detail="Ya existe un domiciliario registrado con esa Cédula")

        fn_date = None
        if req.fecha_nacimiento:
            try:
                fn_date = datetime.strptime(req.fecha_nacimiento, "%Y-%m-%d").date()
            except ValueError:
                fn_date = None

        insert_sql = text("""
            INSERT INTO personal_conductores (
                tenant_id, nombre_completo, cedula, nombres, apellidos, telefono, fecha_nacimiento, jefe_zona,
                tipo_contrato, tipo_remuneracion, salario_fijo, periodicidad_pago, tarifa_paquete, banco, cuenta, tipo_cuenta, cc_titular,
                cuentas_bancarias, plataformas, foto, doc_cedula_frontal, doc_cedula_trasera,
                doc_servicios, doc_certificado_bancario, docs_rut, alias_nombres, activo
            ) VALUES (
                :tenant_id, :nombre, :cedula, :nombres, :apellidos, :telefono, :fecha_nacimiento, :jefe_zona,
                :contrato, :tipo_remuneracion, :salario_fijo, :periodicidad_pago, :tarifa, :banco, :cuenta, :tipo_cuenta, :cc_titular,
                CAST(:cuentas_bancarias AS jsonb), CAST(:plataformas AS jsonb), :foto, :doc_frontal, :doc_trasera,
                :doc_servicios, :doc_bancario, CAST(:docs_rut AS jsonb), CAST(:alias AS jsonb), true
            )
            RETURNING *
        """)
        res = await session.execute(insert_sql, {
            "tenant_id": x_tenant_id,
            "nombre": req.nombre_completo.strip(),
            "cedula": req.cedula.strip(),
            "nombres": req.nombres,
            "apellidos": req.apellidos,
            "telefono": req.telefono,
            "fecha_nacimiento": fn_date,
            "jefe_zona": req.jefe_zona,
            "contrato": req.tipo_contrato or "PAQUETEO",
            "tipo_remuneracion": req.tipo_remuneracion or "DESTAJO",
            "salario_fijo": req.salario_fijo if req.salario_fijo is not None else 0.0,
            "periodicidad_pago": req.periodicidad_pago or "GLOBAL",
            "tarifa": req.tarifa_paquete if req.tarifa_paquete is not None else 2000.0,
            "banco": req.banco,
            "cuenta": req.cuenta,
            "tipo_cuenta": req.tipo_cuenta or "Ahorros",
            "cc_titular": req.cc_titular,
            "cuentas_bancarias": json.dumps(req.cuentas_bancarias or []),
            "plataformas": json.dumps(req.plataformas or []),
            "foto": req.foto,
            "doc_frontal": req.doc_cedula_frontal,
            "doc_trasera": req.doc_cedula_trasera,
            "doc_servicios": req.doc_servicios,
            "doc_bancario": req.doc_certificado_bancario,
            "docs_rut": json.dumps(req.docs_rut or []),
            "alias": json.dumps([req.nombre_completo.strip()])
        })
        await session.commit()
        ret_data = dict(res.first()._mapping)
        if ret_data.get("fecha_nacimiento"):
            ret_data["fecha_nacimiento"] = str(ret_data["fecha_nacimiento"])
        return ret_data


class DriverUpdateRequest(BaseModel):
    nombre_completo: Optional[str] = None
    cedula: Optional[str] = None
    nombres: Optional[str] = None
    apellidos: Optional[str] = None
    telefono: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    jefe_zona: Optional[str] = None
    tipo_contrato: Optional[str] = None
    tipo_remuneracion: Optional[str] = None
    salario_fijo: Optional[float] = None
    periodicidad_pago: Optional[str] = None
    tarifa_paquete: Optional[float] = None
    banco: Optional[str] = None
    cuenta: Optional[str] = None
    tipo_cuenta: Optional[str] = None
    cc_titular: Optional[str] = None
    cuentas_bancarias: Optional[List[Dict[str, Any]]] = None
    plataformas: Optional[List[Dict[str, Any]]] = None
    foto: Optional[str] = None
    doc_cedula_frontal: Optional[str] = None
    doc_cedula_trasera: Optional[str] = None
    doc_servicios: Optional[str] = None
    doc_certificado_bancario: Optional[str] = None
    docs_rut: Optional[List[Dict[str, Any]]] = None
    activo: Optional[bool] = None
    alias_nombres: Optional[List[str]] = None


@router.put("/drivers/{driver_id}")
async def update_driver(
    driver_id: uuid.UUID,
    req: DriverUpdateRequest,
    x_tenant_id: str = Header("empresa_demo")
):
    """
    Actualiza la información de un domiciliario.
    Si la Cédula se cambia a una ya existente en otro conductor real, unifica los registros automáticamente.
    """
    async for session in get_db_session(x_tenant_id):
        # 1. Verificar existencia del conductor
        get_sql = text("SELECT * FROM personal_conductores WHERE tenant_id = :tenant_id AND id = :id LIMIT 1")
        res_driver = await session.execute(get_sql, {"tenant_id": x_tenant_id, "id": driver_id})
        current_driver = res_driver.first()
        if not current_driver:
            raise HTTPException(status_code=404, detail="Domiciliario no encontrado")

        new_cedula = req.cedula.strip() if req.cedula else current_driver.cedula

        # 2. Si se cambia la cédula a una ya existente en otro conductor, unificar automáticamente
        if req.cedula and new_cedula != current_driver.cedula and not new_cedula.startswith("AUTO-DA"):
            check_sql = text("SELECT id FROM personal_conductores WHERE tenant_id = :tenant_id AND cedula = :cedula AND id != :id LIMIT 1")
            res_other = await session.execute(check_sql, {"tenant_id": x_tenant_id, "cedula": new_cedula, "id": driver_id})
            other_driver = res_other.first()
            if other_driver:
                unify_req = DriverUnifyRequest(cedula_real=new_cedula, driver_ids=[other_driver.id, driver_id])
                return await unify_drivers(unify_req, x_tenant_id=x_tenant_id)

        # 3. Actualizar campos
        updates = []
        params = {"tenant_id": x_tenant_id, "id": driver_id}

        if req.nombre_completo is not None:
            updates.append("nombre_completo = :nombre_completo")
            params["nombre_completo"] = req.nombre_completo.strip()

        if req.cedula is not None:
            updates.append("cedula = :cedula")
            params["cedula"] = req.cedula.strip()

        if req.nombres is not None:
            updates.append("nombres = :nombres")
            params["nombres"] = req.nombres.strip()

        if req.apellidos is not None:
            updates.append("apellidos = :apellidos")
            params["apellidos"] = req.apellidos.strip()

        if req.telefono is not None:
            updates.append("telefono = :telefono")
            params["telefono"] = req.telefono

        if req.fecha_nacimiento is not None:
            fn_date = None
            if req.fecha_nacimiento:
                try:
                    fn_date = datetime.strptime(req.fecha_nacimiento, "%Y-%m-%d").date()
                except ValueError:
                    fn_date = None
            updates.append("fecha_nacimiento = :fecha_nacimiento")
            params["fecha_nacimiento"] = fn_date

        if req.jefe_zona is not None:
            updates.append("jefe_zona = :jefe_zona")
            params["jefe_zona"] = req.jefe_zona

        if req.tipo_contrato is not None:
            updates.append("tipo_contrato = :tipo_contrato")
            params["tipo_contrato"] = req.tipo_contrato

        if req.tarifa_paquete is not None:
            updates.append("tarifa_paquete = :tarifa_paquete")
            params["tarifa_paquete"] = req.tarifa_paquete

        if req.banco is not None:
            updates.append("banco = :banco")
            params["banco"] = req.banco

        if req.cuenta is not None:
            updates.append("cuenta = :cuenta")
            params["cuenta"] = req.cuenta

        if req.tipo_cuenta is not None:
            updates.append("tipo_cuenta = :tipo_cuenta")
            params["tipo_cuenta"] = req.tipo_cuenta

        if req.cc_titular is not None:
            updates.append("cc_titular = :cc_titular")
            params["cc_titular"] = req.cc_titular

        if req.cuentas_bancarias is not None:
            updates.append("cuentas_bancarias = CAST(:cuentas_bancarias AS jsonb)")
            params["cuentas_bancarias"] = json.dumps(req.cuentas_bancarias)

        if req.plataformas is not None:
            updates.append("plataformas = CAST(:plataformas AS jsonb)")
            params["plataformas"] = json.dumps(req.plataformas)

        if req.foto is not None:
            updates.append("foto = :foto")
            params["foto"] = req.foto

        if req.doc_cedula_frontal is not None:
            updates.append("doc_cedula_frontal = :doc_cedula_frontal")
            params["doc_cedula_frontal"] = req.doc_cedula_frontal

        if req.tipo_remuneracion is not None:
            updates.append("tipo_remuneracion = :tipo_remuneracion")
            params["tipo_remuneracion"] = req.tipo_remuneracion

        if req.salario_fijo is not None:
            updates.append("salario_fijo = :salario_fijo")
            params["salario_fijo"] = req.salario_fijo

        if req.periodicidad_pago is not None:
            updates.append("periodicidad_pago = :periodicidad_pago")
            params["periodicidad_pago"] = req.periodicidad_pago


        if req.doc_cedula_trasera is not None:
            updates.append("doc_cedula_trasera = :doc_cedula_trasera")
            params["doc_cedula_trasera"] = req.doc_cedula_trasera

        if req.doc_servicios is not None:
            updates.append("doc_servicios = :doc_servicios")
            params["doc_servicios"] = req.doc_servicios

        if req.doc_certificado_bancario is not None:
            updates.append("doc_certificado_bancario = :doc_certificado_bancario")
            params["doc_certificado_bancario"] = req.doc_certificado_bancario

        if req.docs_rut is not None:
            updates.append("docs_rut = CAST(:docs_rut AS jsonb)")
            params["docs_rut"] = json.dumps(req.docs_rut)

        if req.activo is not None:
            updates.append("activo = :activo")
            params["activo"] = req.activo

        if req.alias_nombres is not None:
            updates.append("alias_nombres = CAST(:alias_nombres AS jsonb)")
            params["alias_nombres"] = json.dumps(req.alias_nombres)

        if updates:
            update_sql = text(f"UPDATE personal_conductores SET {', '.join(updates)} WHERE tenant_id = :tenant_id AND id = :id")
            await session.execute(update_sql, params)
            await session.commit()

        # Actualizar también los pedidos que tenían denormalizado el nombre si cambió
        if req.nombre_completo is not None:
            upd_pedidos = text("UPDATE pedidos SET domiciliario_nombre = :nombre WHERE tenant_id = :tenant_id AND domiciliario_id = :id")
            await session.execute(upd_pedidos, {"tenant_id": x_tenant_id, "id": driver_id, "nombre": req.nombre_completo.strip()})
            await session.commit()

        res_updated = await session.execute(get_sql, {"tenant_id": x_tenant_id, "id": driver_id})
        ret_data = dict(res_updated.first()._mapping)
        if ret_data.get("fecha_nacimiento"):
            ret_data["fecha_nacimiento"] = str(ret_data["fecha_nacimiento"])
        return ret_data


# ==============================================================================
# SECCIÓN: NOVEDADES DE NÓMINA (VALES / ANTICIPOS, BONOS Y PENALIDADES)
# ==============================================================================

class NovedadCreateRequest(BaseModel):
    domiciliario_id: uuid.UUID
    tipo_novedad: str  # 'VALE', 'BONO', 'PENALIDAD'
    monto: float
    motivo: Optional[str] = None
    fecha_novedad: Optional[str] = None


@router.get("/payroll/novedades")
async def list_novedades(
    domiciliario_id: Optional[uuid.UUID] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    x_tenant_id: str = Header("empresa_demo")
):
    """Lista las novedades (Vales, Bonos y Penalidades) registradas."""
    async for session in get_db_session(x_tenant_id):
        params = {"tenant_id": x_tenant_id}
        conditions = ["n.tenant_id = :tenant_id"]

        if domiciliario_id and isinstance(domiciliario_id, (uuid.UUID, str)):
            conditions.append("n.domiciliario_id = :dom_id")
            params["dom_id"] = domiciliario_id

        if fecha_inicio:
            try:
                dt_i = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
                conditions.append("n.fecha_novedad >= :f_inicio")
                params["f_inicio"] = dt_i
            except Exception:
                pass

        if fecha_fin:
            try:
                dt_f = datetime.strptime(fecha_fin, "%Y-%m-%d").date()
                conditions.append("n.fecha_novedad <= :f_fin")
                params["f_fin"] = dt_f
            except Exception:
                pass

        where_clause = " AND ".join(conditions)
        sql = text(f"""
            SELECT n.id, n.tenant_id, n.domiciliario_id, n.tipo_novedad, n.monto, n.motivo,
                   n.fecha_novedad, n.estado, n.fecha_creacion, c.nombre_completo as domiciliario_nombre
            FROM novedades_nomina n
            JOIN personal_conductores c ON c.id = n.domiciliario_id
            WHERE {where_clause}
            ORDER BY n.fecha_novedad DESC, n.fecha_creacion DESC
        """)
        res = await session.execute(sql, params)
        rows = [dict(r._mapping) for r in res.fetchall()]
        for r in rows:
            if r.get("fecha_novedad"):
                r["fecha_novedad"] = str(r["fecha_novedad"])
            if r.get("fecha_creacion"):
                r["fecha_creacion"] = str(r["fecha_creacion"])
        return rows


@router.post("/payroll/novedades", status_code=status.HTTP_201_CREATED)
async def create_novedad(req: NovedadCreateRequest, x_tenant_id: str = Header("empresa_demo")):
    """Registra un Vale/Anticipo (-), Bono (+) o Penalidad (-) para un trabajador."""
    if req.monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    tipo_clean = req.tipo_novedad.strip().upper()
    if tipo_clean not in ["VALE", "BONO", "PENALIDAD"]:
        raise HTTPException(status_code=400, detail="Tipo de novedad inválido. Use VALE, BONO o PENALIDAD.")

    f_date = datetime.now().date()
    if req.fecha_novedad:
        try:
            f_date = datetime.strptime(req.fecha_novedad, "%Y-%m-%d").date()
        except ValueError:
            f_date = datetime.now().date()

    async for session in get_db_session(x_tenant_id):
        sql = text("""
            INSERT INTO novedades_nomina (tenant_id, domiciliario_id, tipo_novedad, monto, motivo, fecha_novedad, estado)
            VALUES (:tenant_id, :dom_id, :tipo, :monto, :motivo, :fecha, 'PENDIENTE')
            RETURNING *
        """)
        res = await session.execute(sql, {
            "tenant_id": x_tenant_id,
            "dom_id": req.domiciliario_id,
            "tipo": tipo_clean,
            "monto": req.monto,
            "motivo": req.motivo or "",
            "fecha": f_date
        })
        await session.commit()
        ret = dict(res.first()._mapping)
        if ret.get("fecha_novedad"):
            ret["fecha_novedad"] = str(ret["fecha_novedad"])
        return ret


@router.delete("/payroll/novedades/{novedad_id}")
async def delete_novedad(novedad_id: uuid.UUID, x_tenant_id: str = Header("empresa_demo")):
    """Elimina una novedad de nómina."""
    async for session in get_db_session(x_tenant_id):
        sql = text("DELETE FROM novedades_nomina WHERE tenant_id = :tenant_id AND id = :id RETURNING id")
        res = await session.execute(sql, {"tenant_id": x_tenant_id, "id": novedad_id})
        await session.commit()
        if not res.first():
            raise HTTPException(status_code=404, detail="Novedad no encontrada")
        return {"message": "Novedad eliminada correctamente"}


# ==============================================================================
# SECCIÓN: LIQUIDACIÓN, PRE-CALCULO Y CONCILIACIÓN DE NÓMINA (1 o 2 ARCHIVOS)
# ==============================================================================

class PayrollPayRequest(BaseModel):
    domiciliario_ids: List[uuid.UUID]
    fecha_inicio: str
    fecha_fin: str
    metodo_pago: Optional[str] = "TRANSFERENCIA"
    referencia_pago: Optional[str] = None


@router.get("/payroll/summary")
async def get_payroll_summary(
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    domiciliario_id: Optional[uuid.UUID] = Query(None),
    x_tenant_id: str = Header("empresa_demo")
):
    """
    Calcula la pre-liquidación consolidada de la nómina para el rango de fechas.
    Consolida:
    - Entregas registradas (Archivo 1)
    - Remuneración por Destajo / Salario Fijo / Mixto
    - (+) Bonos
    - (-) Penalidades
    - (-) Vales / Anticipos
    - Estado actual de Pago (PENDIENTE / PAGADA)
    """
    dt_inicio = datetime.now().date()
    dt_fin = datetime.now().date()
    try:
        dt_inicio = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
    except Exception:
        pass
    try:
        dt_fin = datetime.strptime(fecha_fin, "%Y-%m-%d").date()
    except Exception:
        pass

    async for session in get_db_session(x_tenant_id):
        # 1. Obtener domiciliarios activos
        where_dom = " WHERE c.tenant_id = :tenant_id AND c.activo = true "
        params_dom = {"tenant_id": x_tenant_id, "f_inicio": dt_inicio, "f_fin": dt_fin}
        if domiciliario_id and isinstance(domiciliario_id, (uuid.UUID, str)):
            where_dom += " AND c.id = :dom_id "
            params_dom["dom_id"] = domiciliario_id

        drivers_sql = text(f"""
            SELECT c.id, c.nombre_completo, c.cedula, c.banco, c.cuenta, c.tipo_cuenta,
                   COALESCE(c.tipo_remuneracion, 'DESTAJO') as tipo_remuneracion,
                   COALESCE(c.salario_fijo, 0.0) as salario_fijo,
                   COALESCE(c.periodicidad_pago, 'GLOBAL') as periodicidad_pago,
                   COALESCE(c.tarifa_paquete, 2000.0) as tarifa_paquete
            FROM personal_conductores c
            {where_dom}
            ORDER BY c.nombre_completo ASC
        """)
        res_drivers = await session.execute(drivers_sql, params_dom)
        drivers = [dict(r._mapping) for r in res_drivers.fetchall()]

        payroll_rows = []

        for d in drivers:
            d_id = d["id"]

            # Paquetes entregados en el rango de fechas (Control y Conciliación)
            # EXCLUYE guías que ya fueron pagadas previamente (Anti-Doble Pago)
            # Evalúa fecha_entrega real de la guía en lugar de solo la fecha de importación/actualización del registro
            pkgs_sql = text("""
                SELECT COUNT(id) as total_entregados
                FROM pedidos
                WHERE tenant_id = :tenant_id
                  AND domiciliario_id = :dom_id
                  AND estado = 'ENTREGADO'
                  AND CAST(COALESCE(fecha_entrega, fecha_importacion, fecha_actualizacion) AS DATE) >= :f_inicio
                  AND CAST(COALESCE(fecha_entrega, fecha_importacion, fecha_actualizacion) AS DATE) <= :f_fin
                  AND (pagado_conductor IS FALSE OR pagado_conductor IS NULL)
            """)
            res_pkgs = await session.execute(pkgs_sql, {"tenant_id": x_tenant_id, "dom_id": d_id, "f_inicio": dt_inicio, "f_fin": dt_fin})
            total_entregados = res_pkgs.scalar() or 0

            # Novedades registradas (Vales, Bonos, Penalidades)
            nov_sql = text("""
                SELECT tipo_novedad, COALESCE(SUM(monto), 0.0) as total
                FROM novedades_nomina
                WHERE tenant_id = :tenant_id
                  AND domiciliario_id = :dom_id
                  AND fecha_novedad >= :f_inicio
                  AND fecha_novedad <= :f_fin
                GROUP BY tipo_novedad
            """)
            res_nov = await session.execute(nov_sql, {"tenant_id": x_tenant_id, "dom_id": d_id, "f_inicio": dt_inicio, "f_fin": dt_fin})
            nov_map = {r.tipo_novedad: float(r.total) for r in res_nov.fetchall()}

            vales = nov_map.get("VALE", 0.0)
            bonos = nov_map.get("BONO", 0.0)
            penalidades = nov_map.get("PENALIDAD", 0.0)

            # Cálculo según tipo de remuneración
            tipo_rem = d["tipo_remuneracion"]
            tarifa = float(d["tarifa_paquete"])
            sal_fijo = float(d["salario_fijo"])

            monto_paquetes = 0.0
            salario_fijo_aplicado = 0.0

            if tipo_rem == "DESTAJO":
                monto_paquetes = total_entregados * tarifa
                salario_fijo_aplicado = 0.0
            elif tipo_rem == "SALARIO_FIJO":
                monto_paquetes = 0.0
                salario_fijo_aplicado = sal_fijo
            elif tipo_rem == "MIXTO":
                monto_paquetes = total_entregados * tarifa
                salario_fijo_aplicado = sal_fijo

            monto_bruto = monto_paquetes + salario_fijo_aplicado + bonos
            descuentos = vales + penalidades
            monto_neto = max(0.0, monto_bruto - descuentos)

            # Verificar si ya existe registro de liquidación guardado/pagado
            liq_sql = text("""
                SELECT estado_pago, metodo_pago, referencia_pago, fecha_pago,
                       total_paquetes_periodo, monto_neto, monto_bruto, vales_descontados, bonos, penalidades
                FROM liquidaciones
                WHERE tenant_id = :tenant_id
                  AND domiciliario_id = :dom_id
                  AND fecha_inicio = :f_inicio
                  AND fecha_fin = :f_fin
                LIMIT 1
            """)
            res_liq = await session.execute(liq_sql, {"tenant_id": x_tenant_id, "dom_id": d_id, "f_inicio": dt_inicio, "f_fin": dt_fin})
            liq_row = res_liq.first()

            estado_pago = "PENDIENTE"
            metodo_pago = None
            referencia_pago = None
            fecha_pago = None

            if liq_row:
                estado_pago = liq_row.estado_pago or "PENDIENTE"
                metodo_pago = liq_row.metodo_pago
                referencia_pago = liq_row.referencia_pago
                fecha_pago = str(liq_row.fecha_pago) if liq_row.fecha_pago else None

                if liq_row.estado_pago == "PAGADO":
                    total_entregados = liq_row.total_paquetes_periodo if liq_row.total_paquetes_periodo is not None else total_entregados
                    monto_neto = float(liq_row.monto_neto) if liq_row.monto_neto is not None else monto_neto
                    monto_bruto = float(liq_row.monto_bruto) if liq_row.monto_bruto is not None else monto_bruto
                    vales = float(liq_row.vales_descontados) if liq_row.vales_descontados is not None else vales
                    bonos = float(liq_row.bonos) if liq_row.bonos is not None else bonos
                    penalidades = float(liq_row.penalidades) if liq_row.penalidades is not None else penalidades

            payroll_rows.append({
                "domiciliario_id": str(d_id),
                "nombre_completo": d["nombre_completo"],
                "cedula": d["cedula"],
                "banco": d["banco"],
                "cuenta": d["cuenta"],
                "tipo_remuneracion": tipo_rem,
                "periodicidad_pago": d["periodicidad_pago"],
                "total_entregados": total_entregados,
                "tarifa_paquete": tarifa,
                "monto_paquetes": round(monto_paquetes, 2),
                "salario_fijo_aplicado": round(salario_fijo_aplicado, 2),
                "bonos": round(bonos, 2),
                "penalidades": round(penalidades, 2),
                "vales_descontados": round(vales, 2),
                "monto_bruto": round(monto_bruto, 2),
                "descuentos": round(descuentos, 2),
                "monto_neto": round(monto_neto, 2),
                "estado_pago": estado_pago,
                "metodo_pago": metodo_pago,
                "referencia_pago": referencia_pago,
                "fecha_pago": fecha_pago
            })

        return {
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin,
            "total_trabajadores": len(payroll_rows),
            "total_neto_nomina": round(sum(r["monto_neto"] for r in payroll_rows), 2),
            "total_pagado": round(sum(r["monto_neto"] for r in payroll_rows if r["estado_pago"] == "PAGADO"), 2),
            "total_pendiente": round(sum(r["monto_neto"] for r in payroll_rows if r["estado_pago"] == "PENDIENTE"), 2),
            "items": payroll_rows
        }


@router.post("/payroll/pay")
async def mark_payroll_as_paid(req: PayrollPayRequest, x_tenant_id: str = Header("empresa_demo")):
    """
    Marca las nóminas de los domiciliarios seleccionados como PAGADA (individual o masivo).
    Guarda o actualiza la liquidación en la tabla liquidaciones.
    """
    if not req.domiciliario_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos un trabajador")

    dt_inicio = datetime.now().date()
    dt_fin = datetime.now().date()
    try:
        dt_inicio = datetime.strptime(req.fecha_inicio, "%Y-%m-%d").date()
    except Exception:
        pass
    try:
        dt_fin = datetime.strptime(req.fecha_fin, "%Y-%m-%d").date()
    except Exception:
        pass

    async for session in get_db_session(x_tenant_id):
        # Obtener los datos actuales del cálculo de nómina para los seleccionados
        summary = await get_payroll_summary(
            fecha_inicio=req.fecha_inicio,
            fecha_fin=req.fecha_fin,
            x_tenant_id=x_tenant_id
        )

        selected_set = {str(did) for did in req.domiciliario_ids}
        now_dt = datetime.now(BOGOTA_TZ)
        updated_count = 0

        for row in summary["items"]:
            if row["domiciliario_id"] in selected_set:
                dom_id = uuid.UUID(row["domiciliario_id"])

                check_sql = text("""
                    SELECT id FROM liquidaciones
                    WHERE tenant_id = :tenant_id AND domiciliario_id = :dom_id
                      AND fecha_inicio = :f_inicio AND fecha_fin = :f_fin
                    LIMIT 1
                """)
                res_check = await session.execute(check_sql, {"tenant_id": x_tenant_id, "dom_id": dom_id, "f_inicio": dt_inicio, "f_fin": dt_fin})
                existing = res_check.first()

                if existing:
                    upd_sql = text("""
                        UPDATE liquidaciones SET
                            estado_pago = 'PAGADO',
                            metodo_pago = :metodo,
                            referencia_pago = :ref,
                            fecha_pago = :fecha_pago,
                            monto_neto = :neto,
                            monto_bruto = :bruto,
                            vales_descontados = :vales,
                            bonos = :bonos,
                            penalidades = :penalidades
                        WHERE id = :id
                    """)
                    await session.execute(upd_sql, {
                        "metodo": req.metodo_pago or "TRANSFERENCIA",
                        "ref": req.referencia_pago or "",
                        "fecha_pago": now_dt,
                        "neto": row["monto_neto"],
                        "bruto": row["monto_bruto"],
                        "vales": row["vales_descontados"],
                        "bonos": row["bonos"],
                        "penalidades": row["penalidades"],
                        "id": existing.id
                    })
                else:
                    ins_sql = text("""
                        INSERT INTO liquidaciones (
                            tenant_id, domiciliario_id, fecha_inicio, fecha_fin, total_paquetes_periodo,
                            tarifa_paquete, monto_paquetes, salario_fijo_aplicado, bonos, penalidades,
                            vales_descontados, monto_bruto, monto_neto, estado_pago, metodo_pago,
                            referencia_pago, fecha_pago, estado
                        ) VALUES (
                            :tenant_id, :dom_id, :f_inicio, :f_fin, :total_pkgs,
                            :tarifa, :monto_pkgs, :sal_fijo, :bonos, :penalidades,
                            :vales, :bruto, :neto, 'PAGADO', :metodo,
                            :ref, :fecha_pago, 'REVISADA'
                        )
                    """)
                    await session.execute(ins_sql, {
                        "tenant_id": x_tenant_id,
                        "dom_id": dom_id,
                        "f_inicio": dt_inicio,
                        "f_fin": dt_fin,
                        "total_pkgs": row["total_entregados"],
                        "tarifa": row["tarifa_paquete"],
                        "monto_pkgs": row["monto_paquetes"],
                        "sal_fijo": row["salario_fijo_aplicado"],
                        "bonos": row["bonos"],
                        "penalidades": row["penalidades"],
                        "vales": row["vales_descontados"],
                        "bruto": row["monto_bruto"],
                        "neto": row["monto_neto"],
                        "metodo": req.metodo_pago or "TRANSFERENCIA",
                        "ref": req.referencia_pago or "",
                        "fecha_pago": now_dt
                    })

                # Marcar los pedidos del período como pagados al conductor (con timestamp y liquidacion_id)
                upd_pkgs = text("""
                    UPDATE pedidos 
                    SET pagado_conductor = TRUE,
                        fecha_pago_conductor = :fecha_pago
                    WHERE tenant_id = :tenant_id
                      AND domiciliario_id = :dom_id
                      AND estado = 'ENTREGADO'
                      AND CAST(COALESCE(fecha_entrega, fecha_importacion, fecha_actualizacion) AS DATE) >= :f_inicio
                      AND CAST(COALESCE(fecha_entrega, fecha_importacion, fecha_actualizacion) AS DATE) <= :f_fin
                """)
                await session.execute(upd_pkgs, {"tenant_id": x_tenant_id, "dom_id": dom_id, "f_inicio": dt_inicio, "f_fin": dt_fin, "fecha_pago": now_dt})

                # Cambiar estado de novedades del período a APLICADO
                upd_nov = text("""
                    UPDATE novedades_nomina SET estado = 'APLICADO'
                    WHERE tenant_id = :tenant_id
                      AND domiciliario_id = :dom_id
                      AND fecha_novedad >= :f_inicio
                      AND fecha_novedad <= :f_fin
                """)
                await session.execute(upd_nov, {"tenant_id": x_tenant_id, "dom_id": dom_id, "f_inicio": dt_inicio, "f_fin": dt_fin})

                updated_count += 1

        # Actualizar estado de período si existe un período activo para este rango
        upd_per = text("""
            UPDATE periodos_nomina
            SET estado = 'PAGADO', fecha_pago = :fecha_pago
            WHERE tenant_id = :tenant_id
              AND fecha_inicio = :f_inicio
              AND fecha_fin = :f_fin
        """)
        await session.execute(upd_per, {"tenant_id": x_tenant_id, "f_inicio": dt_inicio, "f_fin": dt_fin, "fecha_pago": now_dt})

        await session.commit()
        return {
            "message": f"Se marcaron como PAGADAS {updated_count} nóminas correctamente",
            "trabajadores_actualizados": updated_count
        }


# -----------------------------------------------------------------------------
# GESTIÓN DE PERÍODOS DE NÓMINA (CORTES PERSISTENTES)
# -----------------------------------------------------------------------------

class PeriodoNominaCreate(BaseModel):
    nombre_periodo: str
    fecha_inicio: str
    fecha_fin: str


@router.get("/payroll/periods")
async def get_payroll_periods(x_tenant_id: str = Header("empresa_demo")):
    """
    Devuelve la lista de períodos de nómina guardados y el período activo.
    """
    async for session in get_db_session(x_tenant_id):
        res = await session.execute(text("""
            SELECT id, nombre_periodo, fecha_inicio, fecha_fin, estado, total_neto, fecha_creacion
            FROM periodos_nomina
            WHERE tenant_id = :tenant_id
            ORDER BY fecha_creacion DESC
        """), {"tenant_id": x_tenant_id})
        periods = [dict(r._mapping) for r in res.fetchall()]
        
        formatted = []
        active_period = None
        for p in periods:
            p_dict = {
                "id": str(p["id"]),
                "nombre_periodo": p["nombre_periodo"],
                "fecha_inicio": str(p["fecha_inicio"]),
                "fecha_fin": str(p["fecha_fin"]),
                "estado": p["estado"],
                "total_neto": float(p["total_neto"] or 0.0),
                "fecha_creacion": str(p["fecha_creacion"]) if p["fecha_creacion"] else None
            }
            formatted.append(p_dict)
            if p["estado"] == "ABIERTO" and not active_period:
                active_period = p_dict

        if not active_period and formatted:
            active_period = formatted[0]

        return {
            "periodos": formatted,
            "periodo_activo": active_period
        }


@router.post("/payroll/periods")
async def create_payroll_period(req: PeriodoNominaCreate, x_tenant_id: str = Header("empresa_demo")):
    """
    Fija o crea un nuevo período de nómina activo para la empresa.
    """
    try:
        dt_inicio = datetime.strptime(req.fecha_inicio, "%Y-%m-%d").date()
        dt_fin = datetime.strptime(req.fecha_fin, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Fechas inválidas. Formato YYYY-MM-DD")

    async for session in get_db_session(x_tenant_id):
        # Cerrar períodos anteriores abiertos si los hay
        await session.execute(text("""
            UPDATE periodos_nomina 
            SET estado = 'CERRADO'
            WHERE tenant_id = :tenant_id AND estado = 'ABIERTO'
        """), {"tenant_id": x_tenant_id})

        # Insertar el nuevo período activo
        ins_sql = text("""
            INSERT INTO periodos_nomina (tenant_id, nombre_periodo, fecha_inicio, fecha_fin, estado)
            VALUES (:tenant_id, :nombre, :f_inicio, :f_fin, 'ABIERTO')
            RETURNING id, nombre_periodo, fecha_inicio, fecha_fin, estado, fecha_creacion
        """)
        res = await session.execute(ins_sql, {
            "tenant_id": x_tenant_id,
            "nombre": req.nombre_periodo.strip(),
            "f_inicio": dt_inicio,
            "f_fin": dt_fin
        })
        new_row = res.fetchone()
        await session.commit()

        return {
            "message": "Período de nómina fijado exitosamente",
            "periodo": {
                "id": str(new_row.id),
                "nombre_periodo": new_row.nombre_periodo,
                "fecha_inicio": str(new_row.fecha_inicio),
                "fecha_fin": str(new_row.fecha_fin),
                "estado": new_row.estado,
                "fecha_creacion": str(new_row.fecha_creacion)
            }
        }


@router.get("/dashboard-stats")
async def get_dashboard_executive_stats(x_tenant_id: str = Header("empresa_demo")):
    """
    Endpoint Ejecutivo: Retorna un paquete completo y segmentado de KPIs operativos,
    calidad catastral, rendimiento de flota y métricas financieras para Gerencia.
    """
    async for session in get_db_session(x_tenant_id):
        # 1. Totales Operativos de Pedidos
        query_orders = text("""
            SELECT
                COUNT(*) as total_pedidos,
                COUNT(*) FILTER (WHERE estado IN ('CREADO', 'SECTORIZADO')) as creados_pendientes,
                COUNT(*) FILTER (WHERE estado IN ('EN_INVENTARIO', 'EN_BODEGA')) as en_bodega,
                COUNT(*) FILTER (WHERE estado IN ('DESPACHADO', 'ASIGNADO')) as en_ruta,
                COUNT(*) FILTER (WHERE estado = 'ENTREGADO') as entregados,
                COUNT(*) FILTER (WHERE estado IN ('NOVEDAD', 'DEVOLUCION', 'FALLIDO')) as novedades,
                COUNT(*) FILTER (WHERE estado = 'FUERA_DE_ZONA' OR zona_id IS NULL) as fuera_de_zona,
                
                -- Precisión Catastral
                COUNT(*) FILTER (WHERE nivel_precision ILIKE '%ROOFTOP%' OR nivel_precision ILIKE '%EXACT%' OR precision_metros = '2') as precision_rooftop,
                COUNT(*) FILTER (WHERE nivel_precision ILIKE '%PLACA%' OR nivel_precision ILIKE '%INTERSECTION%' OR precision_metros IN ('30', '50', '100')) as precision_aproximada,
                COUNT(*) FILTER (WHERE nivel_precision ILIKE '%AMBIGUO%' OR nivel_precision ILIKE '%NO_ENCONTRADO%' OR precision_metros = '200' OR latitud IS NULL) as precision_ambigua
            FROM pedidos
            WHERE tenant_id = :tenant_id
        """)
        res_orders = await session.execute(query_orders, {"tenant_id": x_tenant_id})
        ord_stats = res_orders.first()

        total_pedidos = ord_stats.total_pedidos or 0
        entregados = ord_stats.entregados or 0
        en_ruta = ord_stats.en_ruta or 0
        novedades = ord_stats.novedades or 0
        despachados_totales = entregados + en_ruta + novedades
        
        sla_pct = round((entregados / despachados_totales * 100), 1) if despachados_totales > 0 else 0.0
        rooftop_pct = round((ord_stats.precision_rooftop / total_pedidos * 100), 1) if total_pedidos > 0 else 0.0

        # 2. Guías distribuidas por Zonas GeoJSON (Top 6)
        query_zonas = text("""
            SELECT 
                COALESCE(zona_nombre, 'Sin Zona Asignada') as zona,
                COUNT(*) as cantidad
            FROM pedidos
            WHERE tenant_id = :tenant_id
            GROUP BY zona_nombre
            ORDER BY cantidad DESC
            LIMIT 6
        """)
        res_zonas = await session.execute(query_zonas, {"tenant_id": x_tenant_id})
        zonas_list = [{"zona": r.zona, "cantidad": r.cantidad} for r in res_zonas.fetchall()]

        # 3. Top 5 Conductores por Entregas Efectivas
        query_drivers = text("""
            SELECT
                p.domiciliario_id,
                COALESCE(c.nombre_completo, p.domiciliario_nombre, 'CONDUCTOR NO REGISTRADO') as nombre,
                COALESCE(c.cedula, 'N/A') as cedula,
                COALESCE(c.tarifa_paquete, 2000.0) as tarifa,
                COUNT(*) FILTER (WHERE p.estado = 'ENTREGADO') as entregados,
                COUNT(*) FILTER (WHERE p.estado = 'ASIGNADO') as en_ruta
            FROM pedidos p
            LEFT JOIN personal_conductores c ON p.domiciliario_id = c.id
            WHERE p.tenant_id = :tenant_id AND p.domiciliario_id IS NOT NULL
            GROUP BY p.domiciliario_id, c.nombre_completo, p.domiciliario_nombre, c.cedula, c.tarifa_paquete
            ORDER BY entregados DESC
            LIMIT 5
        """)
        res_drivers = await session.execute(query_drivers, {"tenant_id": x_tenant_id})
        drivers_list = []
        monto_nomina_estimado = 0.0
        for r in res_drivers.fetchall():
            entregados_cnt = r.entregados or 0
            tarifa = float(r.tarifa or 2000.0)
            monto_driver = entregados_cnt * tarifa
            monto_nomina_estimado += monto_driver
            drivers_list.append({
                "id": str(r.domiciliario_id),
                "nombre": r.nombre,
                "cedula": r.cedula,
                "entregados": entregados_cnt,
                "en_ruta": r.en_ruta or 0,
                "tarifa": tarifa,
                "subtotal_ganado": monto_driver
            })

        # 4. Total Vales y Adelantos Registrados (Pendientes)
        query_vales = text("""
            SELECT COALESCE(SUM(monto), 0) as total_vales
            FROM novedades_nomina
            WHERE tenant_id = :tenant_id AND estado = 'PENDIENTE'
        """)
        res_vales = await session.execute(query_vales, {"tenant_id": x_tenant_id})
        total_vales = float(res_vales.scalar() or 0.0)

        # 5. Paquetes en Bodega retenidos (> 24 horas)
        query_retencion = text("""
            SELECT COUNT(*) as retencion_24h
            FROM pedidos
            WHERE tenant_id = :tenant_id 
              AND estado IN ('EN_INVENTARIO', 'EN_BODEGA')
              AND fecha_importacion < NOW() - INTERVAL '24 hours'
        """)
        res_retencion = await session.execute(query_retencion, {"tenant_id": x_tenant_id})
        retencion_24h = res_retencion.scalar() or 0

        return {
            "resumen_ejecutivo": {
                "total_pedidos": total_pedidos,
                "sla_cumplimiento_pct": sla_pct,
                "precision_rooftop_pct": rooftop_pct,
                "en_bodega": ord_stats.en_bodega or 0,
                "retencion_critica_24h": retencion_24h,
                "monto_nomina_proyectado": monto_nomina_estimado,
                "total_vales_pendientes": total_vales,
                "neto_nomina_estimado": max(0.0, monto_nomina_estimado - total_vales)
            },
            "estados": {
                "creados_pendientes": ord_stats.creados_pendientes or 0,
                "en_bodega": ord_stats.en_bodega or 0,
                "en_ruta": en_ruta,
                "entregados": entregados,
                "novedades": novedades,
                "fuera_de_zona": ord_stats.fuera_de_zona or 0
            },
            "precision_catastral": {
                "rooftop_exacto": ord_stats.precision_rooftop or 0,
                "aproximada": ord_stats.precision_aproximada or 0,
                "ambigua": ord_stats.precision_ambigua or 0
            },
            "zonas_distribucion": zonas_list,
            "top_flota": drivers_list
        }







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


def parse_local_timestamp(raw_val: Optional[str]) -> Optional[datetime]:
    """
    Parsea fechas/horas entregadas respetando estrictamente la zona horaria local de Colombia (-05:00).
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
                c.tarifa_paquete,
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
                     c.fecha_nacimiento, c.jefe_zona, c.tipo_contrato, c.tarifa_paquete,
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
                tipo_contrato, tarifa_paquete, banco, cuenta, tipo_cuenta, cc_titular,
                cuentas_bancarias, plataformas, foto, doc_cedula_frontal, doc_cedula_trasera,
                doc_servicios, doc_certificado_bancario, docs_rut, alias_nombres, activo
            ) VALUES (
                :tenant_id, :nombre, :cedula, :nombres, :apellidos, :telefono, :fecha_nacimiento, :jefe_zona,
                :contrato, :tarifa, :banco, :cuenta, :tipo_cuenta, :cc_titular,
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




# GeoFull V4 — 05. Especificación del Frontend React, 6 Módulos Core & UI

> **Propósito**: Definir la estructura exacta de interfaz de usuario de GeoFull V4 en Frontend React, basada en los **6 Módulos Centrales**, sin bodegas, con sectorización multizona simultánea, conciliación diaria y liquidación de nómina quincenal.
>
> **Nota**: el **Normalizador** de direcciones no es un módulo: es un componente del backend sin vista propia. Actúa durante la importación de pedidos; sus resultados (`direccion_limpia`, `estado_normalizacion`, `advertencias_normalizacion`...) llegan al frontend en `OrderResponse`. Ver [normalizador/README.md](./normalizador/README.md).

---

## 1. Menú Principal de GeoFull V4 (6 Módulos Estrictos)

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MENÚ PRINCIPAL DE GEOFULL V4                         │
├────────────────────────────────────────────────────────────────────────┤
│  1. 📊 Dashboard               ├── Métricas operativas y KPIs          │
│  2. 🗺️ Sectorización           ├── Gestión de Zonas GeoJSON de empresa │
│                                │   y asignación (Modal discreto import)│
│  3. 🗺️ Mapa & Consola          ├── Mapa Leaflet completo + Consola por │
│                                │   Lote (Mensaje Proveedor) y QR Code  │
│  4. 📦 Control y Conciliación  ├── Entregas diarias + Nómina quincenal │
│  5. 👥 Personal                ├── Conductores, operarios y vales      │
│  6. 🔍 Historial / Rastreo     ├── Trazabilidad unificada de guías     │
│  7. ⚙️ Configuración           ├── Gestión del Equipo (Acceso Web)     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sistema de Diseño Visual (Apple Minimalist Dark Mode)

GeoFull V4 adopta una interfaz de usuario **estilo Apple Card / Dark Minimalist**, enfocada en la elegancia, pulcritud, legibilidad extrema y micro-interacciones sutiles:

### 2.1 Paleta de Colores & Tokens
- **Fondo Principal**: Dark Canvas ultra-profundo (`#0B0F17` / `slate-950`).
- **Tarjetas & Modales (Apple Card Style)**: Superficies semitransparentes con efecto espejo/cristal (`bg-slate-900/60` con `backdrop-blur-xl` y bordes sutiles `border-white/10`).
- **Tipografía**: Font-stack moderno de alta definición (`Inter`, `system-ui`, `-apple-system`, `sans-serif`), con jerarquía clara y espaciado limpio (`tracking-tight`).
- **Colores de Acento**:
  - 🔵 **Azul Titanio**: `#3B82F6` (Acciones primarias, botones de navegación).
  - 🟢 **Verde Esmeralda**: `#10B981` (Entregados, exactitud 100%, estado activo).
  - 🟡 **Ámbar Refinado**: `#F59E0B` (Geocodificación cercana, revisiones pendientes).
  - 🔴 **Rojo Carmesí**: `#EF4444` (Fuera de zona, errores, discrepancias).

### 2.2 Micro-Interacciones & Componentes de UI
- **Border Radius**: Bordes redondeados amplios (`rounded-2xl`, `rounded-3xl` en contenedores principales).
- **Sombras Difusas**: Shadows profundas pero sutiles (`shadow-2xl shadow-black/50`).
- **Efectos Hover**: Elevación ligera (`hover:-translate-y-0.5 transition-all duration-300`) y destellos de borde sutiles.
- **Toasts Flotantes**: Esquina superior derecha con animación suave de entrada (`slide-in`).
- **Modales de Confirmación**: Fondo oscurecido con desenfoque Gaussian (`backdrop-blur-md`).
- **Skeleton Loaders**: Efecto Shimmer animado para tablas y tarjetas en estado de carga.

---

## 3. Detalle de los 6 Módulos Core

### 3.1 📊 1. Dashboard
- **Métricas Clave**: Total pedidos del día, % geocodificados (por nivel de precisión), pedidos en inventario, pedidos `FUERA_DE_ZONA`, total conciliados vs. novedades.
- **Filtros por Fecha**: Sin filtro de bodega (no existen bodegas en V4).

### 2.2 🗺️ 2. Sectorización (Zonas Personalizadas Simultáneas)
- **NO se sectoriza por códigos postales ni barrios estándar**. Solo **Zonas Personalizadas GeoJSON** importadas por la empresa.
- **Importación de Zonas**: Cada empresa sube sus propios GeoJSONs de zonas. La API valida programáticamente que los polígonos no se sobrepongan (usando `ST_Intersects` excluyendo `ST_Touches`).
- **Todas las zonas activas al mismo tiempo**: Sin cambio manual entre capas de sectores.
- **Validación de Rangos Lógicos**: Segunda validación para prevenir errores de asignación.
- **Mapa Leaflet con Capas GeoJSON**:
  - 🟢 **Verde**: Geocodificación `EXACT_MATCH` (±2m, score 100).
  - 🟡 **Amarillo**: Geocodificación niveles intermedios (score 25-85).
  - 🔴 **Rojo**: `FUERA_DE_ZONA` o `REQUIERE_REVISIÓN`.
  - **Popup interactivo**: Muestra guía, dirección, nivel de precisión, zona asignada y botón *"Recalcular con Google Maps"*.

### 2.3 📦 3. Control y Conciliación (Unificado con Nómina)
Este módulo tiene **dos flujos complementarios**:

#### Flujo 1: Control Diario de Entregas
- Se sube un archivo Excel/CSV **diariamente** con las guías entregadas por cada domiciliario.
- El sistema compara las guías entregadas contra las que tenía asignadas.
- Los pedidos confirmados pasan a estado `ENTREGADO` y se retiran del inventario.
- Se genera un registro de `conciliacion_diaria` con el resumen (total sistema, total entregados, novedades).

#### Flujo 2: Liquidación de Nómina (Quincena o Período Personalizado)
- Al final de la quincena (o período personalizado), se puede **re-subir el documento completo** para detectar discrepancias acumuladas u olvidos.
- El sistema consolida todas las conciliaciones diarias del período.
- Calcula: `monto_bruto = total_paquetes × tarifa_paquete - adelantos_descontados`.
- Estado de la liquidación: `BORRADOR` → `REVISADA` → `PAGADA`.

### 2.4 👥 4. Personal
- Gestión operativa de conductores domiciliarios y personal operativo.
- Registro de cédulas, tipos de contrato (Prestación de servicios / Destajo), tarifas por paquete.
- Solicitudes de adelantos/vales de nómina.

### 2.5 🔍 5. Historial / Rastreo (Trazabilidad Unificada de Guías)
- **Eliminados**: Componentes *Casos Ambiguos* y *Auditoría Visual*.
- **Línea de Tiempo de Guía (Guide Trace Timeline)**:
  Al buscar cualquier guía (ej: `G-100234`), se despliega:
  1. Texto de dirección original importado.
  2. Resultado de la normalización: `via_db`, `placa_db`.
  3. Resultado de la geocodificación: nivel de precisión (ej: `EXACT_MATCH ±2m, score 100`), coordenadas.
  4. Zona asignada (o `FUERA_DE_ZONA`) y resultado de Rangos Lógicos.
  5. Historial de escaneos QR (si aplica) y estado de entrega.
  6. Botón *"Recalcular con Google Maps"* si la ubicación requiere ajuste manual.

### 2.6 ⚙️ 6. Configuración & Gestión del Equipo
- **Gestión del Equipo**: Control **exclusivo** de usuarios con acceso a la plataforma web (`admin_empresa`, `operario`).
- **NO** incluye a los domiciliarios (pertenecen al módulo **Personal**).
- Configuración de rangos lógicos por zona.

---

## 3. Consola SaaS (`SaaSConsole.jsx` — Super Admin, Fuera del Menú Tenant)

Herramienta institucional para el Super Admin con 5 secciones:
1. **Dashboard Global SaaS**: Métricas de consumo por tenant y ahorro en API.
2. **Gestión de Empresas Tenants**: Altas, cuotas y asignación de ciudades habilitadas.
3. **Gestor de Datasets Multiciudad**: Drag-and-Drop de GPKGs para nuevas ciudades.
4. **Gestor Espacial**: Visualización de polígonos y datasets cargados.
5. **Auditoría Global**: Logs de actividad institucional.

---

## 4. App Móvil Utilitaria (`MobileAppSuite.jsx`)

> **NO es app de entregas ni ruteador**. Es utilidad administrativa para domiciliarios.

- **Conteo del Día**: Lista de guías asignadas para validar conteo físico.
- **Panel de Discrepancias**: Notificar en un clic paquetes faltantes/sobrantes.
- **Carga de Documentos**: Fotografiar comprobantes y solicitar vales/adelantos.

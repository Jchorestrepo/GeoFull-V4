# GeoFull V4 — 08. Especificación Detallada Página por Página y Mapeo de Esencia V3 ➔ V4

> **Propósito**: Especificar de manera exhaustiva y funcional cada una de las páginas/vistas del menú lateral de **GeoFull V4**, demostrando cómo se **preserva, potencia y consolida la esencia operativa y utilidad actual de GeoFull V3** en el nuevo diseño simplificado.

---

## 📌 Tabla de Navegación del Menú V4

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MÓDULOS PRINCIPALES DE GEOFULL V4                    │
├────────────────────────────────────────────────────────────────────────┤
│  1. 📊 Dashboard (KPIs)         ├── Métricas globales y control operativo│
│  2. 🗺️ Sectorización (Zonas)    ├── Zonas GeoJSON simultáneas y Rangos   │
│  3. 🗺️ Mapa & Consola (Lote+QR) ├── Inspección cartográfica, Lotes y QR │
│  4. 📦 Control & Conciliación   ├── Inventario QR, Entregas y Nómina     │
│  5. 👥 Personal & Vales         ├── Conductores, Tarifas y Adelantos     │
│  6. 🔍 Historial / Rastreo      ├── Trazabilidad unificada y Timeline    │
│  7. ⚙️ Configuración            ├── Gestión del Equipo Web y Parámetros  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🗺️ Matriz de Mapeo de Vistas: GeoFull V3 ➔ GeoFull V4

Para garantizar que **ninguna funcionalidad ni utilidad actual se pierda**, el siguiente cuadro ilustra cómo los componentes actuales de V3 se redistribuyen en la nueva estructura de V4:

| Componente en GeoFull V3 | Ubicación en GeoFull V4 | ¿Cómo se preserva su esencia operativa? |
|---|---|---|
| `Dashboard.jsx` | **1. Dashboard (KPIs)** | Mantiene todas las métricas operativas, gráficas de precisión catastral y estado de envíos, eliminando la complejidad de bodegas múltiples. |
| `Sectorizacion.jsx`<br>`ConfiguracionSectores.jsx`<br>`ConfiguracionRangos.jsx` | **2. Sectorización (Zonas)** | Consolida la carga de polígonos GeoJSON por empresa y ajuste de Rangos Lógicos. Ahora todas las zonas están **activas simultáneamente** sin sobreponerse. |
| `MapExplorer.jsx`<br>`Map.jsx`<br>`CasosAmbiguos.jsx`<br>`AuditoriaVisual.jsx` | **3. Mapa & Consola (Lote + QR)** | Integra la inspección en mapa Leaflet con la lista interactiva de guías importadas por lote, consola de mensajes para proveedores y ajuste manual/Google. |
| `Inventario.jsx`<br>`ConciliacionEntregas.jsx`<br>`ControlConciliacion.jsx` | **4. Control & Conciliación** | Unifica el control de paquetes por lectura QR en bodega, el cruce diario de planillas entregadas y el precálculo de nómina quincenal. |
| `AdminConductores.jsx`<br>`PersonalNomina.jsx` | **5. Personal & Vales** | Mantiene el catálogo completo de domiciliarios/operarios, asignación de tarifas por paquete y gestión de vales/adelantos de nómina. |
| `BuscadorGuia.jsx` | **6. Historial / Rastreo** | Evoluciona a una **Línea de Tiempo Unificada (Timeline)** por guía que muestra todo el recorrido: importación, geocodificación, zona, QR y entrega. |
| `Configuraciones.jsx`<br>`AdminEquipo.jsx`<br>`MantenimientoSistema.jsx` | **7. Configuración** | Separa claramente los usuarios con acceso web a la plataforma (**Gestión del Equipo**) de los conductores/operarios de campo. |

---

## 📄 Especificación Detallada Página por Página

---

### 1. 📊 Dashboard (Insignia: `KPIs`)

#### 🎯 Propósito y Esencia Operativa
El **Dashboard** es el centro de control ejecutivo y operacional en tiempo real de la empresa. Su esencia es ofrecer en un solo vistazo el estado de la operación del día sin requerir navegación profunda.

#### 🎨 Componentes y Paneles de la Pantalla
1. **Fila de Tarjetas KPI Primarias (Apple Card Style)**:
   - **Total Pedidos Importados**: Contador del día con porcentaje de variación respecto al día anterior.
   - **Tasa de Geocodificación Catastral**: Porcentaje de direcciones resueltas a nivel **Rooftop ±2m** (Verde), **Aproximado** (Amarillo) y **Sin Coincidencia** (Rojo).
   - **Paquetes en Inventario**: Guías leídas por QR activas en bodega pendientes de entrega.
   - **Novedades / Fuera de Zona**: Pedidos que requieren ajuste o atención del operario.
2. **Gráfico de Distribución por Precisión Catastral**:
   - Barra visual de calidad de geocodificación (`Nivel 1 Rooftop`, `Nivel 2 Vía/Esquina`, `Nivel 3 Centroide`).
3. **Resumen de Pedidos por Zona Personalizada**:
   - Lista con el desglose de guías asignadas a cada Zona Personalizada de la empresa activa en ese momento.
4. **Alerta de Rendimiento del Motor Local**:
   - Indicador de estado del motor catastral `geocoding-medellin` (tiempo medio de respuesta <15ms).

---

### 2. 🗺️ Sectorización (Insignia: `Zonas`)

#### 🎯 Propósito y Esencia Operativa
Administrar las **Zonas Personalizadas GeoJSON** de la empresa y garantizar que cada dirección se asigne automáticamente a su polígono y rango lógico correspondiente.

#### 🎨 Componentes y Paneles de la Pantalla
1. **Panel Superior de Gestión de Zonas**:
   - Botón *"Importar Nueva Zona GeoJSON"*: Permite subir archivos GeoJSON creados en Google My Maps, QGIS o GeoJSON.io.
   - **Validación Automática Anti-Sobreposición**: El sistema rechaza polígonos que se traslapen espacialmente con zonas existentes de la misma empresa.
   - Tabla de zonas activas: Nombre de zona, color asignado, cantidad de predios/coordenadas contenidas y estado (Activa / Inactiva).
2. **Mapa Interactivo de Zonas (Leaflet + PostGIS)**:
   - Renderizado en tiempo real de todos los polígonos GeoJSON cargados.
   - Al pasar el cursor o hacer clic sobre una zona, se destacan sus límites y se muestra un resumen con la cantidad de guías asignadas hoy.
3. **Pestaña / Modal de Rangos Lógicos de Vía**:
   - Preserva la esencia de `ConfiguracionRangos.jsx`: permite definir y verificar rangos numerados por calle/carrera dentro de cada zona para evitar asignaciones erróneas.

---

### 3. 🗺️ Mapa & Consola (Insignia: `Lote + QR`)

#### 🎯 Propósito y Esencia Operativa
Esta pantalla es el **corazón operacional cartográfico y de solución de casos**. Conserva y eleva la esencia de *MapExplorer*, *Casos Ambiguos*, *Auditoria Visual* y *Consola por Lote*. Permite visualizar los pedidos en el mapa, escanear etiquetas físicas con QR y enviar informes consolidados a los proveedores.

#### 🎨 Componentes y Paneles de la Pantalla
1. **Filtro de Selección por Lote / Importación**:
   - Selector superior para filtrar por archivo importado (ej: `Batch_2026_09_15_ClienteX.xlsx`), por fecha o por proveedor.
2. **Mapa Geotemporal de Pedidos (Leaflet)**:
   - Muestra todos los puntos geocodificados sobre la ciudad con codificación de color:
     - 🟢 **Verde**: Rooftop exacto (±2m) y zona asignada correctamente.
     - 🟡 **Amarillo**: Coincidencia aproximada o cercana.
     - 🔴 **Rojo**: `FUERA_DE_ZONA` o `DIRECCION_AMBIGUA`.
   - **Popups Interactivos en Mapa**: Al hacer clic en un pin, muestra la guía, cliente, dirección normalizada, zona asignada y el botón *"Recalcular con Google Maps"*.
3. **Consola Lateral de Lote & Mensajes al Proveedor**:
   - Lista desplegable con los pedidos del lote seleccionado.
   - **Botón "Copiar Consola para Proveedor"**: Genera automáticamente un texto formateado para WhatsApp/Correo con el listado de guías problemáticas, guías fuera de zona y sus observaciones, facilitando la comunicación directa con el cliente.
4. **Buscador / Lector QR Integrado**:
   - Campo para escanear el código QR o código de barras de la etiqueta. Al escanear, el mapa hace zoom automático al pin del paquete y abre su ficha detallada.

---

### 4. 📦 Control & Conciliación

#### 🎯 Propósito y Esencia Operativa
Unificar el ciclo de vida del paquete desde su ingreso físico a bodega mediante lectura QR hasta la conciliación final de entregas y la pre-liquidación de nómina. Consolida la utilidad de *Inventario*, *ConciliacionEntregas* y *ControlConciliacion*.

#### 🎨 Componentes y Paneles de la Pantalla (Sub-pestanas Limpias)
1. **Pestaña 1: Control de Inventario & Lectura QR**:
   - Lector directo de códigos QR / Códigos de barras (mediante cámara o lector físico PDA/USB).
   - Tabla de inventario activo en bodega: Estado (`EN_BODEGA`, `EN_RUTA`, `ENTREGADO`, `NOVEDAD`), fecha de ingreso, ubicante y domiciliario asignado.
2. **Pestaña 2: Conciliación Diaria de Entregas**:
   - Zona de arrastrar y sueltar (Drag & Drop) para subir el reporte de entregas diario (Excel/CSV de planillas).
   - **Cruce Automático**: Compara las guías reportadas contra el inventario del sistema.
   - Matriz de resultados:
     - 🟢 Pedidos marcados automáticamente como `ENTREGADO`.
     - 🔴 Pedidos en `NOVEDAD` o no reportados.
3. **Pestaña 3: Liquidación de Nómina (Quincena / Período)**:
   - Mantiene la capacidad de consolidar las conciliaciones diarias del período.
   - Cálculo automático por domiciliario: `Total Paquetes Entregados × Tarifa por Paquete - Vales/Adelantos = Total a Pagar`.

---

### 5. 👥 Personal & Vales

#### 🎯 Propósito y Esencia Operativa
Administrar exclusivamente a los **conductores domiciliarios y operarios de campo**, sus esquemas tarifarios por entrega y el registro estricto de vales/adelantos de dinero.

#### 🎨 Componentes y Paneles de la Pantalla
1. **Tabla de Domiciliarios y Operarios de Campo**:
   - Nombre completo, número de cédula, teléfono, tipo de vehículo (Moto, Carro, Van) y estado (Activo / Inactivo).
2. **Configuración de Tarifas por Paquete**:
   - Asignación de tarifas personalizadas por domiciliario o tarifa estándar general de la empresa (ej: \$3.500 COP por entrega efectiva).
3. **Módulo de Registro y Control de Vales / Adelantos**:
   - Formulario rápido: Domiciliario, Monto del vale (\$), Fecha, Motivo y Medio de pago (Efectivo / Transferencia).
   - Historial de vales pendientes por descontar en la próxima liquidación de nómina.

---

### 6. 🔍 Historial / Rastreo

#### 🎯 Propósito y Esencia Operativa
Ofrecer la **Línea de Tiempo Unificada de Guía (End-to-End Tracking Timeline)**. Reemplaza la necesidad de pantallas dispersas (*BuscadorGuia*, *CasosAmbiguos*) proporcionando la radiografía completa e inmutable de cualquier envío.

#### 🎨 Componentes y Paneles de la Pantalla
1. **Buscador Multicriterio Prominente**:
   - Búsqueda en tiempo real por: Número de Guía, Nombre del Destinatario, Teléfono, Dirección o Código del Proveedor.
2. **Ficha de Resultados & Línea de Tiempo (Timeline Visual)**:
   - **Datos de la Guía**: Dirección original vs. Dirección normalizada (`vía` + `placa`), Coordenadas Lat/Lng, Nivel de precisión catastral.
   - **Eventos Históricos Registrados**:
     - ⏱️ `1. Importación`: Fecha, lote y usuario que cargó el archivo.
     - ⏱️ `2. Geocodificación`: Resultado del motor catastral local `geocoding-medellin`.
     - ⏱️ `3. Sectorización`: Zona asignada y verificación por Rangos Lógicos.
     - ⏱️ `4. Ingreso a Bodega (QR)`: Timestamp del escaneo físico y operario responsable.
     - ⏱️ `5. Despacho & Conciliación`: Domiciliario asignado y estado final de entrega.
3. **Panel de Acciones de Corrección**:
   - Si la dirección requiere ajuste, dispone del botón *"Recalcular con Google Maps"* o edición directa de coordenadas con actualización inmediata en PostGIS.

---

### 7. ⚙️ Configuración (Gestión del Equipo)

#### 🎯 Propósito y Esencia Operativa
Administrar los parámetros generales del tenant y gestionar las cuentas de los usuarios con acceso a la interfaz web.

#### 🎨 Componentes y Paneles de la Pantalla
1. **Gestión del Equipo (Usuarios Web con Credenciales)**:
   - Diferenciado del Módulo 5 (Personal). Aquí solo se gestionan los usuarios que inician sesión en GeoFull Web: `admin_empresa`, `admin_bodega`, `operario`.
   - Creación de usuarios, asignación de roles y restablecimiento de contraseñas.
2. **Parámetros Generales de la Empresa**:
   - Nombre de la empresa, nit, ciudad principal catastral asignada.
   - Parámetros de tolerancia en geocodificación (distancia máxima en metros para coincidencias aproximadas).
3. **Logs de Auditoría y Mantenimiento**:
   - Registro de actividad del sistema para trazabilidad administrativa.

---

## 🛠️ Conclusión de la Evolución V3 ➔ V4

Con este diseño, **ninguna utilidad, dato o flujo de trabajo existente en GeoFull V3 se descarta**. Al contrario, las pantallas dispersas de V3 se integran de forma natural en **7 opciones de menú coherentes**, eliminando la duplicidad de pasos y reduciendo significativamente la curva de aprendizaje para el operador.

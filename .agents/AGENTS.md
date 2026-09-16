# GeoFull V4 — Workspace Agent Rules & Guidelines (Apple Dark Minimalist & Iterative Screen Spec)

> **Propósito**: Definir las reglas de desarrollo, estándar de código, diseño UI/UX (Apple Minimalist Dark Mode), arquitectura multi-tenant y protocolo de interacción pantalla por pantalla para **GeoFull V4-Clean**.

---

## 🚨 Reglas de Oro Obligatorias (Strict Enforcement)

1. **Desarrollo Modular por Pantalla (Screen-Driven Alignment)**:
   - Se construye módulo por módulo. Antes de codificar cada pantalla, Antigravity DEBE hacer preguntas concisas de alineación funcional al usuario para no asumir comportamientos.
2. **Etapa 1 — Importación + Geocodificación + Sectorización**:
   - Al importar el archivo Excel/CSV, el sistema ejecuta automáticamente el pipeline: `sanitizer.py` (V3) -> `normalizer.py` -> `geocoder.py` (PostGIS 7 niveles) -> `sectorizador` (`ST_Contains` contra zonas GeoJSON).
3. **Backend Único FastAPI (Python 3.11+) + PostgreSQL/PostGIS (RLS)**:
   - Todo código de servidor se escribe en FastAPI. Consultas a datos operativos usan Row-Level Security (RLS) `app.current_tenant_id`.
4. **Script `./iniciar.sh` Obligatorio**:
   - El entorno se inicia y administra con `./iniciar.sh`. Antigravity verificará que el script esté actualizado.
5. **Comunicación Concreta & Sección Final de Pruebas**:
   - Las respuestas de Antigravity deben ser **concretas, directas y sin rodeos**.
   - **OBLIGATORIO AL FINAL DE CADA TURNO**: Incluir siempre una sección titulada `🧪 Pasos de Prueba para el Usuario` especificando exactamente qué debe probar el usuario en el navegador o terminal.

---

## 🎨 Sistema de Diseño Visual: Apple Minimalist Dark Mode

El Frontend de GeoFull V4 se diseña siguiendo principios de **Apple Card & Minimalismo Moderno**:

- **Fondo Principal**: Dark Canvas ultra-profundo (`#0B0F17` / `slate-950`).
- **Tarjetas & Modales (Apple Card Style)**: Superficies semitransparentes con efecto espejo/cristal (`bg-slate-900/60` con `backdrop-blur-xl`, bordes suaves `rounded-3xl` y delicados `border-white/10`).
- **Tipografía**: Inter / SF Pro font-stack, jerarquía impecable, legibilidad alta y espaciado ajustado (`tracking-tight`).
- **Colores de Acento**:
  - 🔵 **Azul Titanio**: `#3B82F6` (Acciones principales, navegación).
  - 🟢 **Verde Esmeralda**: `#10B981` (Entregados, 100% exactitud, activo).
  - 🟡 **Ámbar Refinado**: `#F59E0B` (Geocodificación cercana, pendiente).
  - 🔴 **Rojo Carmesí**: `#EF4444` (Fuera de zona, errores, novedades).
- **Feedback Visual Obligatorio**:
  - **Toasts Flotantes**: Notificaciones elegantes tras cada acción.
  - **Modales de Confirmación**: Con desenfoque Gaussian para acciones destructivas.
  - **Skeleton Loaders**: Efecto Shimmer en tablas y tarjetas durante descargas.

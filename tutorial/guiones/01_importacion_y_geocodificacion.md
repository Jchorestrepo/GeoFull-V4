# 🎬 Guion 01: Importación Masiva & Geocodificación Automática
> **Formato**: Micro-píldora audiovisual (2:15 min)  
> **Motor de Voz Recomendado**: VoiceStudio (Voz en español neutro, ritmo dinámico y profesional)  
> **Archivo de Práctica**: `tutorial/recursos/pedidos_demo_medellin.xlsx`

---

## 🎙️ Guía Fonética y Pautas de Locución para VoiceStudio
- **GeoFull V4**: Pronunciar *"Geo-Ful versión cuatro"*.
- **PostGIS**: Pronunciar *"Post-Gis"*.
- **Rooftop**: Pronunciar *"Rooftop"* o *"nivel techo"*.
- **Excel / CSV**: Pronunciar *"Excel o archivo C-S-V"*.
- **Puntuación**: Las comas (,) marcan micro-pausas naturales de respiración (300 ms). Los puntos (.) generan cierres de idea contundentes (600 ms).

---

## ⏱️ Escaleta Técnica Audiovisual (Paso a Paso)

| Tiempo | Segmento | Acción en Pantalla (Grabación / UI) | Efecto Visual / Zoom | Locución para VoiceStudio |
|---|---|---|---|---|
| **00:00 - 00:15** | Gancho | Pantalla principal en Dark Canvas (`#0B0F17`). Cursor entra suave hacia el botón azul **"Importar Guías"**. | Zoom sutil a la esquina superior derecha. | ¿Te toma horas clasificar y ubicar cientos de pedidos a mano? Con GeoFull V4, puedes importar tu archivo diario y geocodificar todas tus direcciones en cuestión de segundos. |
| **00:15 - 00:40** | Carga del Archivo | Se abre el modal Apple Card (`bg-slate-900/60`). Arrastrar `pedidos_demo_medellin.xlsx` al área punteada. | Resaltado esmeralda al soltar el archivo. | Para comenzar, haz clic en Importar Guías o arrastra tu archivo Excel o CSV directamente a la zona de carga. El sistema detecta automáticamente columnas como Guía, Dirección, Cliente y Teléfono. |
| **00:40 - 01:10** | Procesamiento Pipeline | Barra de progreso Shimmer. Se muestran los 3 pasos: Sanitizado, Normalizado y Geocodificación Catastral. | Transición de iconos: Limpieza ➔ PostGIS. | Al soltar el archivo, nuestro motor catastral entra en acción. Limpia errores de digitación, valida la nomenclatura urbana y consulta más de medio millón de predios mediante siete niveles de precisión catastral. |
| **01:10 - 01:40** | Análisis de Resultados | Aparece la tarjeta de métricas con el resumen del lote. Se observan tarjetas verdes, amarillas y rojas. | Zoom a los badges: Verde (Rooftop), Amarillo (Aproximado), Rojo (Novedad). | En segundos tienes el balance del lote. Los pines en verde representan direcciones con precisión milimétrica a nivel Rooftop. Los pines amarillos y rojos indican aproximaciones o zonas que requieren tu revisión. |
| **01:40 - 02:15** | Llamado a la Acción | Clic en el botón **"Ver en Mapa"**. Transición fluida a la pantalla cartográfica con los pines cargados. | Panorámica del mapa con los sectores y pines. | Con un solo clic, pasas al Mapa Interactivo para inspeccionar tus pedidos sobre la ciudad y asignarlos a ruta. En nuestro próximo video, aprenderás a gestionar los sectores y polígonos GeoJSON. |

---

## 📋 Texto Limpio para Pegar en VoiceStudio (Batch TTS)

```text
¿Te toma horas clasificar y ubicar cientos de pedidos a mano? Con GeoFull versión cuatro, puedes importar tu archivo diario y geocodificar todas tus direcciones en cuestión de segundos.

Para comenzar, haz clic en Importar Guías o arrastra tu archivo Excel o CSV directamente a la zona de carga. El sistema detecta automáticamente columnas clave como Guía, Dirección, Cliente y Teléfono.

Al soltar el archivo, nuestro motor catastral entra en acción. Limpia errores de digitación, valida la nomenclatura urbana y consulta más de medio millón de predios mediante siete niveles de precisión catastral.

En segundos tienes el balance del lote. Los registros en verde representan direcciones con precisión milimétrica a nivel Rooftop. Los registros amarillos y rojos indican aproximaciones o zonas que requieren tu revisión.

Con un solo clic, pasas al Mapa Interactivo para inspeccionar tus pedidos sobre la ciudad y asignarlos a ruta. En nuestro próximo video, aprenderás a gestionar los sectores y polígonos GeoJSON.
```

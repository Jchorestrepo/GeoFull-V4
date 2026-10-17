# 🎬 Guion 02: Sectorización y Gestión de Zonas GeoJSON
> **Formato**: Micro-píldora audiovisual (2:30 min)  
> **Motor de Voz Recomendado**: VoiceStudio (Voz en español neutro, ritmo didáctico y seguro)  
> **Archivo de Práctica**: `tutorial/recursos/zonas_medellin_demo.geojson`

---

## 🎙️ Guía Fonética y Pautas de Locución para VoiceStudio
- **GeoJSON**: Pronunciar *"Geo-Jeison"*.
- **PostGIS**: Pronunciar *"Post-Gis"*.
- **ST_Contains**: Pronunciar *"algoritmo de contención espacial"*.
- **Comunas / Barrios**: Pronunciar claramente *"Aranjuez, Manrique, Campo Valdés, Moravia"*.
- **Puntuación**: Marcar pausas claras antes de las demostraciones en pantalla.

---

## ⏱️ Escaleta Técnica Audiovisual (Paso a Paso)

| Tiempo | Segmento | Acción en Pantalla (Grabación / UI) | Efecto Visual / Zoom | Locución para VoiceStudio |
|---|---|---|---|---|
| **00:00 - 00:15** | Gancho | Entrar a la sección **"Sectorización"** en el menú lateral. El mapa Leaflet muestra polígonos translúcidos de colores. | Zoom suave a la vista satelital/dark del mapa de Medellín. | Organizar el reparto de tu flota nunca fue tan fácil. En GeoFull V4, puedes definir polígonos de reparto exactos y asegurar que cada paquete llegue al mensajero correcto. |
| **00:15 - 00:45** | Cargar GeoJSON | Clic en el botón **"Importar Nueva Zona GeoJSON"**. Seleccionar `zonas_medellin_demo.geojson`. | Tooltip flotante: "Validación Anti-Sobreposición". | Puedes crear tus zonas en Google My Maps, QGIS o GeoJSON.io, y subirlas directamente. Nuestro sistema valida automáticamente que las zonas no se sobrepongan entre sí, evitando conflictos de territorio entre tus conductores. |
| **00:45 - 01:15** | Interacción con el Mapa | El cursor se mueve sobre las zonas: *Manrique*, *Campo Valdés*, *Aranjuez*. Los polígonos se iluminan. | Resaltado con glow azul y tooltip con métricas de la zona. | Cada zona cuenta con su propio color y estadísticas en tiempo real. Al pasar el cursor sobre cualquier sector, puedes ver la cantidad de predios catastrales contenidos y el volumen de pedidos asignados hoy. |
| **01:15 - 01:50** | Rangos Lógicos de Vía | Clic en la pestaña **"Rangos Lógicos"**. Mostrar cómo se especifica calle inicial y final para evitar bordes confusos. | Zoom a la tabla de rangos de vía por zona. | Para avenidas limítrofes o zonas densas, puedes activar los Rangos Lógicos. Esto te permite afinar la asignación de números de calle o carrera, asegurando que ni un solo pedido se quede sin asignar. |
| **01:50 - 02:30** | Conclusión & Siguiente Paso | Vista general de todos los sectores activos simultáneamente. Toast de confirmación: *"Zonas actualizadas con éxito"*. | Fade out suave hacia el logo. | Con tus zonas configuradas, cada nuevo archivo importado se sectorizará automáticamente. En el próximo video, aprenderemos a resolver pedidos fuera de zona y generar mensajes automáticos para WhatsApp. |

---

## 📋 Texto Limpio para Pegar en VoiceStudio (Batch TTS)

```text
Organizar el reparto de tu flota nunca fue tan fácil. En GeoFull versión cuatro, puedes definir polígonos de reparto exactos y asegurar que cada paquete llegue al mensajero correcto.

Puedes crear tus zonas en Google My Maps, Q-Gis o Geo-Jeison punto i-o, y subirlas directamente. Nuestro sistema valida automáticamente que las zonas no se sobrepongan entre sí, evitando conflictos de territorio entre tus conductores.

Cada zona cuenta con su propio color y estadísticas en tiempo real. Al pasar el cursor sobre cualquier sector, puedes ver la cantidad de predios catastrales contenidos y el volumen de pedidos asignados hoy.

Para avenidas limítrofes o zonas densas, puedes activar los Rangos Lógicos. Esto te permite afinar la asignación de números de calle o carrera, asegurando que ni un solo pedido se quede sin asignar.

Con tus zonas configuradas, cada nuevo archivo importado se sectorizará automáticamente. En el próximo video, aprenderemos a resolver pedidos fuera de zona y generar mensajes automáticos para WhatsApp.
```

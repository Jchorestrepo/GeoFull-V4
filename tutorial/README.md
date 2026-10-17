# 📚 Centro de Recursos y Guiones Tutoriales — GeoFull V4

Bienvenido a la carpeta de producción audiovisual de **GeoFull V4**. Aquí encontrarás todos los recursos necesarios para producir videos tutoriales cortos (micro-píldoras de 2 a 3 minutos), con locuciones listas para **VoiceStudio** y archivos de datos reales de prueba.

---

## 📁 Estructura del Directorio

```
tutorial/
├── GUIA_PRODUCCION_VOICESTUDIO.md    # Instrucciones técnicas de síntesis TTS, captura y edición
├── guiones/                          # Guiones segundo a segundo con textos limpios para TTS
│   ├── 01_importacion_y_geocodificacion.md
│   ├── 02_sectorizacion_y_zonas.md
│   ├── 03_mapa_novedades_y_consola.md
│   ├── 04_bodega_qr_e_inventario.md
│   ├── 05_conciliacion_y_nomina.md
│   └── 06_historial_y_trazabilidad.md
└── recursos/                         # Archivos de datos listos para demostraciones en pantalla
    ├── pedidos_demo_medellin.xlsx    # Lote de 22 pedidos reales en Medellín (Excel)
    ├── pedidos_demo_medellin.csv     # Lote de 22 pedidos reales en Medellín (CSV)
    ├── zonas_medellin_demo.geojson   # 15 polígonos GeoJSON de zonas urbanas en Medellín
    └── rutas_conciliacion_demo.xlsx  # Reporte de entregas para conciliación y liquidación
```

---

## 🚀 Resumen de los 6 Módulos

| Módulo | Título | Duración | Archivo de Práctica |
|---|---|---|---|
| **01** | [Importación Masiva & Geocodificación](guiones/01_importacion_y_geocodificacion.md) | 2:15 min | `pedidos_demo_medellin.xlsx` |
| **02** | [Sectorización y Gestión de Zonas GeoJSON](guiones/02_sectorizacion_y_zonas.md) | 2:30 min | `zonas_medellin_demo.geojson` |
| **03** | [Mapa Interactivo, Novedades y Consola WhatsApp](guiones/03_mapa_novedades_y_consola.md) | 2:45 min | `pedidos_demo_medellin.xlsx` |
| **04** | [Operación de Bodega, Escaneo QR e Inventario](guiones/04_bodega_qr_e_inventario.md) | 2:20 min | Lector QR / Códigos de prueba |
| **05** | [Conciliación de Entregas y Liquidación de Nómina](guiones/05_conciliacion_y_nomina.md) | 2:45 min | `rutas_conciliacion_demo.xlsx` |
| **06** | [Historial Unificado y Trazabilidad 360°](guiones/06_historial_y_trazabilidad.md) | 2:10 min | Buscador universal de guías |

---

## 💡 ¿Cómo comenzar a grabar tu primer video?

1. Lee la [Guía de Producción con VoiceStudio](GUIA_PRODUCCION_VOICESTUDIO.md).
2. Abre [01_importacion_y_geocodificacion.md](guiones/01_importacion_y_geocodificacion.md) y copia el texto del bloque de locución en **VoiceStudio**.
3. Inicia la app con `./iniciar.sh` e ingresa al frontend en tu navegador.
4. Graba tu pantalla siguiendo la tabla de escaleta segundo a segundo usando el archivo `pedidos_demo_medellin.xlsx`.

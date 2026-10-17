# 🎙️ Guía de Producción Audiovisual con VoiceStudio & Grabación de Pantalla

Esta guía contiene el procedimiento paso a paso para generar la locución con **VoiceStudio** y sincronizarla con la grabación de pantalla de **GeoFull V4**.

---

## 1. 🎧 Flujo de Generación de Audio en VoiceStudio

### A. Configuración de Voz Recomendada
- **Idioma**: Español (Latinoamérica / Neutro).
- **Tono / Estilo**: Dinámico, seguro, profesional, ritmo constante (~140 a 150 palabras por minuto).
- **Modelo Sugerido**: Modelo de clonación o voz neuronal con soporte de pausas por puntuación (F5-TTS, StyleTTS2, Kokoro o Edge Neural).
- **Tasa de Muestreo (Sample Rate)**: 44.1 kHz o 48 kHz (estándar para edición de video).

### B. Procedimiento de Generación
1. Abre tu aplicación **VoiceStudio** (`/home/pc/Documentos/Codigo/Voz`).
2. Ve a la carpeta `tutorial/guiones/` y abre el guion que vas a producir.
3. Copia el bloque de la sección **"📋 Texto Limpio para Pegar en VoiceStudio"**.
4. Pega el texto en la caja de síntesis de VoiceStudio.
5. *(Opcional)*: Si deseas mayor control de ritmo en la edición, genera el audio párrafo por párrafo o por párrafos de 30-40 segundos.
6. Exporta el archivo de audio resultante en la carpeta:
   `tutorial/audio/01_importacion_y_geocodificacion.wav`

---

## 2. 🖥️ Grabación de Pantalla (Screen Capture)

### A. Configuración del Entorno de Grabación
- **Resolución**: 1920 × 1080 (Full HD) a 60 fps.
- **Navegador**: Google Chrome o Edge en pantalla completa (`F11`), con zoom al 100% o 110% para que las fuentes SF Pro / Inter se vean ultra nítidas.
- **Herramienta Sugerida**:
  - **Screen Studio** (macOS / Linux / Windows): Aplica zooms suaves y automáticos siguiendo el cursor, ideal para el estilo Apple Minimalist.
  - **OBS Studio**: Modo captura de ventana con tasa de bits de 10,000 kbps y fondo limpio.
- **Cursor**: Activar realce de clics suaves (efecto onda o halo sutil).

### B. Preparación de Datos Demo
Antes de grabar, asegúrate de tener listos en tu escritorio o carpeta de descargas los archivos de práctica incluidos en `tutorial/recursos/`:
1. `pedidos_demo_medellin.xlsx`: Para las pruebas de importación y mapa.
2. `zonas_medellin_demo.geojson`: Para la pantalla de sectorización.
3. `rutas_conciliacion_demo.xlsx`: Para el cruce de entregas y nómina.

---

## 3. 🎬 Sincronización y Edición Final

1. **Importar Activos**: En tu editor de video (DaVinci Resolve, Premiere, CapCut o Remotion en `Videos/`), importa el video grabado y el audio de VoiceStudio.
2. **Ajuste de Velocidad de Pantalla**: Si una acción en pantalla dura más que la locución (por ejemplo, esperar la carga de un archivo), corta el tiempo muerto o acelera la pantalla al 150% con aceleración suave (speed ramp).
3. **Música de Fondo (Background Bed)**:
   - Utilizar música ambiental tecnológica suave (Tech Ambient / Corporate Lo-Fi).
   - Nivel de audio: `-24 dB` a `-26 dB` relativo a la voz (`-1 dB` a `-2 dB` para la locución).
4. **Subtítulos Cinéticos**:
   - Generar subtítulos automáticos sincronizados (estilo 1 a 3 palabras por pantalla o líneas cortas) para que el video pueda entenderse incluso sin sonido.

---

## 📌 Checklist de Entrega por Video

- [ ] Audio generado en VoiceStudio sin chasquidos ni cortes abruptos.
- [ ] Datos de prueba realistas visibles en pantalla (evitar pruebas con textos "asdasd" o "prueba 123").
- [ ] Tarjetas Apple Card y modales con efectos de desenfoque (`backdrop-blur`) visibles.
- [ ] Verificación de nombres de zonas y barrios reales de Medellín.
- [ ] Exportación final en MP4 (H.264), 1080p, 60fps, audio estéreo a 320 kbps.

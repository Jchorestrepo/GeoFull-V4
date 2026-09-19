# Normalizador de direcciones

Motor que convierte direcciones urbanas del Valle de Aburrá escritas a mano en un formato estándar, una clave de deduplicación y un estado de calidad. No geolocaliza: su salida alimenta al geocodificador PostGIS de GeoFull.

- Código: `backend/normalizador/`
- Integración: `backend/app/geocoder/normalizer.py` (adaptador) y `backend/app/api/orders.py` (endpoint de importación)
- Pruebas: `backend/tests/`
- Versión del motor: `normalizador.VERSION_MOTOR` (1.0.0)

```
"Carrera Carrera52#109-20 Primer piso"  ->  CR 52 # 109 - 20        OK
"Calle 104b #5077 apto 201"             ->  CL 104B # 50 - 77       OK (confianza 0.92)
"Cra 43A #1 Sur-50"                     ->  CR 43A # 1 SUR - 50     OK
"Calle 44 Bis # 20-30"                  ->  CL 44 BIS # 20 - 30     PARCIAL (BIS no existe en el catastro)
"CALLE 52 CON CRA 50A"                  ->  CL 52 X CR 50A          PARCIAL (cruce sin placa)
"Via Las Palmas km 5"                   ->  sin dirección           FALLO / RURAL
```

---

## 1. Lugar en el flujo de importación

Al importar el Excel de pedidos, el frontend (`ExcelUploader.jsx`) envía cada fila a `POST /api/v1/orders/process-single`. El backend procesa la dirección así:

```
direccion_original (texto crudo)
      │
      ▼
normalizar(texto)                      backend/normalizador/motor.py
      │  Resultado: direccion, clave, componentes, estado, confianza, advertencias
      ▼
desde_resultado(resultado)             backend/app/geocoder/normalizer.py
      │  NormalizedAddress: via_db='CR 34', placa_db='18AA SUR-160', ...
      ▼
geocode_address(session, normalized)   backend/app/geocoder/geocoder.py (niveles 1 a 5)
      ▼
sectorize_point(...)                   backend/app/geocoder/sectorizer.py
      ▼
UPSERT en pedidos
```

Toda la limpieza e interpretación del texto ocurre dentro del motor. El adaptador y el geocodificador no aplican regex sobre la dirección: el adaptador solo da formato a los componentes ya resueltos y el geocodificador solo ejecuta consultas SQL con ellos.

---

## 2. Pipeline interno del motor

Punto de entrada: `normalizar(texto, cfg)` en `motor.py`.

### 2.1 Limpieza (`limpieza.py`)

Función `limpiar(texto) -> (texto_limpio, descartes)`:

1. Normaliza Unicode (NFKC).
2. Formularios tipo `Antioquia~~~Medellin~~~<dirección>`: conserva solo el último tramo.
3. Quita correos, URLs y teléfonos (celulares `3xx`, fijos `60x`, con o sin `+57`) y los guarda en `descartes`.
4. Quita el contenido entre paréntesis y lo guarda en `descartes`.
5. Convierte `N°`, `º`, `°` en `#`.
6. Quita tildes y pasa a minúsculas.
7. Corrige la `o` usada como cero (`5o` -> `50`), une `c-l` como `cl` y colapsa guiones y espacios repetidos.

`es_vacia()` detecta textos sin dirección (`sin registro`, `n/a`, `null`, `---`). En ese caso el resultado es `FALLO` con motivo `VACIA`.

### 2.2 Tokenización (`tokenizador.py`)

Divide el texto limpio en números, palabras y los símbolos `#` y `-`. Cada token marca si está pegado al anterior (`pegado`), dato que usan las reglas y el CRF.

```
"cll45#23-15"  ->  cll 45 # 23 - 15
"85a10"        ->  85 a 10
"103bcra50"    ->  103 b cra 50
"76asur"       ->  76 a sur
```

### 2.3 Léxico (`lexico.py`)

Vocabulario que comparten reglas, CRF y ensamblado:

- `TIPOS_VIA`: variantes y errores de escritura de calle, carrera, transversal, diagonal, circular, avenida y autopista. Tipos finales válidos: `CL`, `CR`, `TV`, `DG`, `CQ`.
- `MARCADORES_NUMERO`: `#`, `no`, `nro`, `num`, `numero`, etc.
- `CONECTORES_CRUCE`: `x`, `con`, `por`, `entre`, `esquina`, `cruce`.
- `CUADRANTES`: `sur`, `este` (y variantes). `S` suelta junto a un número se interpreta como SUR.
- `BIS`.
- `PALABRAS_RURALES` (`km`, `vereda`, `finca`...), `PALABRAS_REFERENCIA` (`cerca`, `frente`, `detras`...) y `CUADRANTES_AJENOS` (`norte`, `oeste`...), que generan alertas.

### 2.4 Reglas (`reglas.py`)

Etiquetador principal. Recorre los tokens buscando **anclas** (tipo de vía seguido de número, o un alias de vía) y, desde cada ancla, aplica la gramática:

```
VÍA [letras] [BIS] [SUR|ESTE]  #  CRUCE [letras] [BIS] [SUR|ESTE]  -  PLACA
```

Cada token recibe una etiqueta de `etiquetas.py` (`VIA_TIPO`, `VIA_NUM`, `VIA_LETRA`, `VIA_BIS`, `VIA_CUAD`, `SEP`, `CONECTOR`, `CRUCE_*`, `PLACA`, `RUIDO`...). Todo lo que no encaja en la gramática es `RUIDO` (apto, piso, barrio, etc.).

Si hay varios candidatos, gana el más completo (placa > cruce de vías > sin placa > solo vía). Entre los igual de completos gana el primero, salvo que otro tenga claramente menos penalización. Si el texto contiene otra dirección completa distinta, se agrega la alerta "el texto contiene varias direcciones".

Las reglas aplican penalizaciones de confianza por señales dudosas, por ejemplo:

| Señal | Penalización |
|---|---|
| Marcador `#` antes de la placa | 0.20 |
| El cruce tiene el mismo tipo de vía | 0.15 |
| `S` pegada al número interpretada como letra | 0.10 |
| Guion o texto entre la vía y el cruce | 0.05 |
| Placa sin guion | 0.03 |
| Texto antes de la dirección | 0.02 |

### 2.5 CRF de respaldo (`crf.py`)

Modelo CRF (python-crfsuite) que asigna las mismas etiquetas que las reglas. Archivo: `backend/normalizador/modelos/crf.crfsuite`.

Solo se usa cuando las reglas no encuentran ninguna dirección. Un resultado `PARCIAL` de las reglas nunca se reemplaza por el CRF: esa ambigüedad se detectó a propósito y debe revisarla una persona. La incertidumbre del modelo resta confianza, y el CRF solo puede dar `OK` si la dirección es un bloque limpio, sin texto ignorado en medio ni placas extra al final.

### 2.6 Ensamblado (`ensamblar.py`)

Convierte los tokens etiquetados en `Componentes` y aplica penalizaciones estructurales:

- Resuelve el tipo de vía (errores de escritura, tipos repetidos o distintos, avenida o autopista sin tipo calle/carrera).
- Traduce alias de vía (`la 80` -> `CR 80`) desde `datos/alias_medellin.yaml`. Los alias sin `validado: true` restan 0.05 extra; los ambiguos dejan el resultado en `PARCIAL`.
- Separa números pegados: `5077` -> `50-77` (penaliza 0.08 si tiene 4 dígitos y 0.25 si es ambiguo).
- Completa placas de un dígito con cero (`5` -> `05`) y marca placas de más de 3 dígitos.
- Marca BIS (no existe en el catastro de Medellín), cuadrantes contradictorios, letras demasiado largas y números de vía fuera de rango.
- **Regla de seguridad**: ningún número de vía o cruce de la salida puede faltar en la entrada. Si falta, el resultado queda `PARCIAL`.
- Guarda los tramos de ruido como `descartado`.

### 2.7 Estado y confianza (`motor.py`)

```
confianza = max(0, 1 - suma de penalizaciones)
```

| Estado | Condición |
|---|---|
| `OK` | Dirección completa (vía + cruce + placa), sin alertas y confianza ≥ umbral (0.85 por defecto) |
| `PARCIAL` | Hay vía, pero algo requiere revisión humana: cruce sin placa, BIS, alias ambiguo, confianza baja, referencia aproximada, indicios rurales, varias direcciones... |
| `FALLO` | No hay dirección. Motivo `VACIA`, `RURAL` o `SIN_NOMENCLATURA` |

Alertas de contexto adicionales (`_alertas_de_contexto`): indicios rurales, palabras de referencia dentro de la dirección, cuadrantes que no existen en el Valle de Aburrá y BIS ignorado.

### 2.8 Formato de salida (`formato.py`)

- `legible()`: `CL 20B SUR # 38 - 06`, `CL 52 X CR 50A` (cruce sin placa), `CL 10` (solo vía).
- `clave()`: el texto legible sin espacios, `#` ni `-`: `CL20BSUR3806`. Dos escrituras distintas de la misma dirección dan la misma clave.

---

## 3. Esquema de salida (`esquema.py`)

```python
class Componentes(BaseModel):
    via_tipo: str | None        # CL, CR, TV, DG, CQ
    via_numero: int | None
    via_letra: str | None       # A, B, AA...
    via_bis: bool
    via_cuadrante: str | None   # SUR, ESTE
    cruce_tipo: str | None      # solo en cruces sin placa ("CL 52 X CR 50A")
    cruce_numero: int | None
    cruce_letra: str | None
    cruce_bis: bool
    cruce_cuadrante: str | None
    placa: str | None           # mínimo 2 dígitos: "06", "160"

class Resultado(BaseModel):
    entrada: str
    direccion: str | None       # formato legible
    clave: str | None           # clave de deduplicación
    componentes: Componentes
    estado: Estado              # OK | PARCIAL | FALLO
    motivo: Motivo | None       # RURAL | SIN_NOMENCLATURA | VACIA (solo FALLO)
    confianza: float            # 0.0 - 1.0
    metodo: str | None          # "reglas" | "crf"
    advertencias: list[str]     # alertas, penalizaciones y "descartado: '...'"
    version_motor: str
```

---

## 4. Integración con GeoFull

### 4.1 Adaptador al catastro (`app/geocoder/normalizer.py`)

`desde_resultado(resultado)` convierte los `Componentes` en `NormalizedAddress`, con el mismo formato de las columnas `via` y `placa` de `public.nomenclatura_domiciliaria`:

| Componentes | `via_db` | `placa_db` |
|---|---|---|
| CL 20B SUR # 38 - 06 | `CL 20B SUR` | `38-06` |
| CR 34 # 18AA SUR - 160 | `CR 34` | `18AA SUR-160` |
| CL 52 X CR 50A | `CL 52` | `None` |

- Si el estado es `FALLO`, devuelve `None` y el pedido no se geocodifica (`NO_GEOLOCALIZADO`).
- El adaptador usa siempre `CR` para carrera, aunque `NORMALIZADOR_TIPO_CARRERA=KR`, porque el catastro usa `CR`.
- También llena `codigo_via`, `numero_via`, `via_generadora` y `numero_casa`, que usa el geocodificador en los niveles 2 a 5.

### 4.2 Campos guardados en `pedidos`

| Columna | Origen |
|---|---|
| `direccion_limpia` | `resultado.direccion` (formato legible) |
| `observaciones_entrega` | Advertencias `descartado: '...'` unidas con ` \| ` (apto, teléfono, paréntesis...) |
| `estado_normalizacion` | `resultado.estado` |
| `clave_direccion` | `resultado.clave` (índice `(tenant_id, clave_direccion)`) |
| `confianza_normalizacion` | `resultado.confianza` |
| `advertencias_normalizacion` | `resultado.advertencias` (JSONB) |

Las cuatro últimas columnas se crean en `backend/migrations/05_add_normalizacion_fields.sql` y se exponen en `OrderResponse`.

### 4.3 Estado del pedido

- Normalizador `OK`: el estado del pedido lo decide el sectorizador (`SECTORIZADO`, `FUERA_DE_ZONA`, `REQUIERE_REVISIÓN`).
- Normalizador `PARCIAL`: se geocodifica igual, pero el pedido queda `REQUIERE_REVISIÓN`.
- Normalizador `FALLO`: no se geocodifica y el pedido queda `REQUIERE_REVISIÓN`.

---

## 5. Configuración

Variables de entorno (`config.py`):

| Variable | Defecto | Uso |
|---|---|---|
| `NORMALIZADOR_TIPO_CARRERA` | `CR` | Tipo de carrera en `direccion` y `clave` (`CR` o `KR`) |
| `NORMALIZADOR_UMBRAL_OK` | `0.85` | Confianza mínima para `OK` |
| `NORMALIZADOR_ALIAS` | `normalizador/datos/alias_medellin.yaml` | Diccionario de alias de vías |
| `NORMALIZADOR_MODELO_CRF` | `normalizador/modelos/crf.crfsuite` | Modelo CRF de respaldo |

Dependencias (en `backend/requirements.txt`): `pydantic`, `pyyaml`, `sklearn-crfsuite` (trae `python-crfsuite`) y `typer` (solo para la CLI).

---

## 6. Alias de vías (`datos/alias_medellin.yaml`)

Traduce nombres populares a nomenclatura oficial (`la 80` -> `CR 80`, `la 33` -> `CL 33`).

```yaml
- nombres: ["80"]
  prefijos: [la, avenida, av, avda]
  via: {tipo: CR, numero: 80}
  validado: true
```

- `prefijos` evita falsos positivos: el nombre solo cuenta si va después de uno de ellos.
- `ambiguo: true` marca nombres sin una única vía equivalente; el resultado queda `PARCIAL`.
- Cambie `validado: true` al revisar cada entrada. Las no validadas funcionan, pero con menos confianza.

---

## 7. Pruebas

Desde `backend/`:

```bash
python -m pytest tests
```

- `tests/casos_reglas.yaml`: casos tabulares `entrada -> direccion, estado, motivo`. Cuando una corrección humana revele un error del motor, agregue el caso aquí.
- `tests/test_casos.py`: ejecuta los casos tabulares, verifica que la clave ignore el formato y la regla de seguridad de números.
- `tests/test_formato.py`: formato legible y clave.
- `tests/test_corruptor.py`: generador sintético. La parte que usa el catastro se salta si no existe `data/preparado`.

`pytest` no está en `requirements.txt`; instálelo aparte en el entorno de desarrollo.

---

## 8. CLI y reentrenamiento

El modelo incluido ya está entrenado. **No hace falta reentrenar** para usar el motor. Reentrene solo si cambia etiquetas o features del CRF, el corruptor sintético, o quiere aprovechar nuevas correcciones del set real.

Comandos desde `backend/`:

```bash
python -m normalizador.cli texto "cll 45a sur #23b-5 apto 301"
python -m normalizador.cli normalizar archivo.csv --columna direccion --salida salidas/
#   -> salidas/salida.csv (todo) y salidas/revision.csv (PARCIAL y SIN_NOMENCLATURA)
python -m normalizador.cli importar-correcciones salidas/revision.csv
#   -> agrega a samples/golden_real.csv las filas con direccion_corregida ("-" = no es dirección)
python -m normalizador.cli preparar-catastro   # requiere data/nomenclatura_domiciliaria.gpkg
python -m normalizador.cli entrenar            # escribe normalizador/modelos/crf.crfsuite
python -m normalizador.cli evaluar             # precisión y cobertura sobre samples/golden_real.csv
```

- `preparar-catastro` limpia el catastro de Medellín (GeoPackage) y lo divide por comuna: prueba 05, 14, 80; validación 09, 60; el resto, entrenamiento. El `.gpkg` no está en el repositorio: consérvelo aparte.
- `entrenar` genera direcciones sucias sintéticas a partir del catastro (`entrenamiento/corruptor.py`) y entrena el CRF.
- `evaluar` usa solo las filas con `revisado=si` de `samples/golden_real.csv`.
- `preparar-golden` necesita `samples/raw.csv` y `samples/valle_aburra_datos_abiertos.csv`, que no están en el repositorio.

Meta de aceptación: precisión de `OK` ≥ 99 % y cobertura ≥ 90 % sobre el set real revisado.

---

## 9. Limitaciones conocidas

- No geolocaliza direcciones rurales (km, veredas, fincas): resultado `FALLO / RURAL`.
- Avenidas y autopistas sin alias ni tipo calle/carrera quedan `PARCIAL` o `FALLO / SIN_NOMENCLATURA`.
- BIS se conserva en la dirección, pero el catastro de Medellín no lo usa: el geocodificador puede no encontrar coincidencia exacta.
- El nivel 2 del geocodificador (`PLACA_APROX`) arma el prefijo de cuadra sin cuadrante (`1-%` en vez de `1 SUR-%`). El nivel 1 sí usa la placa completa con SUR/ESTE.
- `alias_medellin.yaml` está pendiente de validación completa.

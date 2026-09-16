# Estructura de Datos - Geocodificación Medellín

> Verificado consultando directamente los GeoPackage en `data/gpkg/`.
> Reproducible con `python3 tests/test_normalizer_corpus.py`.

## 1. nomenclatura_domiciliaria.gpkg
**Tipo:** POINT (puntos exactos de domicilios) · **Registros:** 518.116 · **SRS:** EPSG:9377

`direccion = via || ' ' || placa` en 518.049 de 518.116 filas (las 67 restantes tienen
`via` o `placa` en NULL). Basta acertar `via` y `placa` para dar con la fila.

### Gramática
```
via   := TIPO ' ' NUMERO [APENDICE] [' ' ORIENTACION]
placa := GEN [APENDICE] [' ' ORIENTACION] '-' CASA [' (' INTERIOR ')'] [' LOTE']
```

| elemento | valores reales | nota |
|---|---|---|
| `TIPO` | `CL` 261.754 · `CR` 247.849 · `TV` 3.551 · `DG` 3.490 · `CQ` 1.353 · `SR` 113 · `Vda` 6 | **abreviado**, nunca `CALLE` |
| `NUMERO` | 1-3 dígitos, sin ceros a la izquierda | |
| `APENDICE` | 1-2 letras **pegadas** al número (79 valores: `A`…`H`, `AA`, `DA`, `DD`…) | `CL 39`, `CL 39A`, `CL 39DA` son **calles distintas** |
| `ORIENTACION` | token aparte: `SUR` 22.643 · `ESTE` 3.541 | también dentro de la placa (`18AA SUR-160`) |
| `GEN` | 1-3 dígitos + apéndice, sin ceros a la izquierda | vía generadora |
| `CASA` | **siempre ≥ 2 dígitos, con cero a la izquierda** | 44.971 filas con cero inicial; ninguna casa de 1 dígito |
| `INTERIOR` | ` (0103)` — 64.114 filas | **no** es la columna `numero_mejora` (vale 0 en esas filas) |
| sufijo | ` LOTE` — 10.185 filas | |

Cobertura de la gramática: `via` 99,9988 % · `placa` 96,56 %.
El resto son direcciones por lote, con forma propia:
```
'X ' TIPO ' ' NUMERO[APENDICE][' ' ORIENTACION] '  LT ' NNNN [' MJ ' NNN]   -- 17.752 filas
'MZ ' NNN ' LT ' NNNN [' MJ ' NNN]                                          --     70 filas
via = 'Vda ' <nombre de vereda>                                             --      6 filas
```
(El doble espacio antes de `LT` es el del dato original.)

### Columnas
`OBJECTID`, `Shape` (POINT), `direccion`, `via`, `placa`, `cbml` TEXT(11),
`numero_mejora` SMALLINT, `direccionencasillada` (forma de ancho fijo),
`direccioncodificada`, `x_origen_nacional`, `y_origen_nacional`.

## 2. eje_de_nomenclatura.gpkg
**Tipo:** MULTILINESTRING (ejes viales) · **Registros:** 42.696 · **SRS:** EPSG:9377

Clave estructurada: **`(tipo_via, numero_via, apendice_via, orientacion_via)`**.

- `tipo_via`: `CR` 21.321 · `CL` 20.359 · `DG` 476 · `TV` 295 · `SR` 135 · `CQ` 95 · `VR` 1 — **abreviado**
- `numero_via` SMALLINT (1..270)
- `apendice_via`: NULL, `A`, `B`, `C`, `D`, `E`, `AA`, `F`, `BB`, `DA`…
- `orientacion_via`: NULL 39.915 · `S` 2.060 · `E` 719 — **una sola letra**, no `SUR`
- `label`: forma legible (`CL 56B`, `CR 89D SUR`) — **es la columna a mostrar**
- `via_principal`: **no es un nombre de calle**; vale `56B`, `104-27`. No usarla.
- `nombre_comun`: nombre popular (`BOMBONA`, `TARRAGONA`) o `' '`
- Otras: `apendice_via`, `orientacion_cruce`, `jerarquia_via`, `grupo_via`, `comuna`,
  `municipio`, `longitud`, `label_big`, `version`, `fecha_actualizacion`

---

## Ejemplo de búsqueda
- **Entrada:** `"Calle 39 # 35-3"`
- **Normalización:** `via_db = 'CL 39'`, `placa_db = '35-03'` (relleno del cero)
- **Nivel 1 (exacto):** `via = 'CL 39' AND placa ~ '^(35\-03)( |$)'` → ±2 m
- **Nivel flexible:** si esa placa no existe, `placa ~ '^35([^0-9-][^-]*)?-'` devuelve
  la misma cuadra (`35-01`, `35A-07`, `35-09`…) ordenada por cercanía → ±50 m
- **Nivel 2 (intersección):** `a.tipo_via='CL' AND a.numero_via=39` × `b.tipo_via='CR' AND b.numero_via=35` → ±30 m
- **Nivel 3 (centroide):** `ST_Centroid(ST_Union(shape))` de todos los tramos de `CL 39` → ±100 m

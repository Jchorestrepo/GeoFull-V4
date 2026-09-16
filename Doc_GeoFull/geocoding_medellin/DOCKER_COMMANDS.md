# Comandos Docker - Ejecuta estos con `sudo`

## 🚀 Inicio Rápido (Ejecuta en orden)

### 1️⃣ Preparar datos (SOLO LA PRIMERA VEZ)
```bash
cd ~/Documentos/IA/geocoding-medellin
mkdir -p data/gpkg
unzip gpkg_eje_de_nomenclatura.zip -d data/gpkg/
unzip gpkg_nomenclatura_domiciliaria.zip -d data/gpkg/
ls -lh data/gpkg/
```

### 2️⃣ Construir las imágenes Docker
```bash
sudo docker-compose build
```

**Esto tardará 2-3 minutos la primera vez. Espera a que termine.**

### 3️⃣ Iniciar los servicios
```bash
sudo docker-compose up -d
```

**Esto inicia PostgreSQL y la API en segundo plano.**

### 4️⃣ Esperar a que esté listo (observar logs)
```bash
sudo docker-compose logs -f api
```

**Busca este mensaje:**
```
✓ Database initialization completed successfully!
✓ API ready!
```

**Presiona CTRL+C para salir de los logs (los servicios siguen ejecutándose)**

---

## ✅ Verificación

### Test 1: Health Check
```bash
curl http://localhost:8000/health
```

**Respuesta esperada:**
```json
{"status":"ok","database":"connected"}
```

### Test 2: Estadísticas
```bash
curl http://localhost:8000/stats
```

**Respuesta esperada:**
```json
{"eje_de_nomenclatura":12345,"nomenclatura_domiciliaria":234567}
```

### Test 3: Geocodificar una dirección
```bash
curl -X POST http://localhost:8000/api/v1/geocode \
  -H "Content-Type: application/json" \
  -d '{"direccion":"Calle 39 # 35-35"}'
```

### Test 4: Interfaz web (Swagger UI)
```
http://localhost:8000/docs
```

---

## 🛠️ Operación

### Ver logs de la API (en vivo)
```bash
sudo docker-compose logs -f api
```

### Ver logs de PostgreSQL
```bash
sudo docker-compose logs -f postgres
```

### Ver estado de contenedores
```bash
sudo docker-compose ps
```

### Reiniciar servicios
```bash
sudo docker-compose restart
```

### Detener servicios
```bash
sudo docker-compose down
```

### Detener y BORRAR datos (limpia todo)
```bash
sudo docker-compose down -v
```

---

## 🔧 Troubleshooting

### ❌ "Permission denied" 
→ Todos los comandos Docker necesitan `sudo`

### ❌ Puerto 8000 ya en uso
```bash
# Ver qué usa el puerto
sudo lsof -i :8000

# O cambiar puerto en docker-compose.yml:
#   ports:
#     - "8001:8000"  # Cambiar 8000 a 8001
```

### ❌ Puerto 5432 ya en uso
```bash
# Lo mismo con puerto 5432
sudo lsof -i :5432
```

### ❌ "Database not ready"
→ Espera más tiempo con: `sudo docker-compose logs -f postgres`

### ❌ Ver si la API cargó datos
```bash
sudo docker-compose exec postgres psql -U postgres -d geocodificador_medellin -c "SELECT COUNT(*) FROM eje_de_nomenclatura;"
```

---

## 📊 Comandos SQL Útiles

### Conectarse a PostgreSQL dentro del contenedor
```bash
sudo docker-compose exec postgres psql -U postgres -d geocodificador_medellin
```

### Dentro de psql (comandos útiles)
```sql
-- Ver número de registros
SELECT COUNT(*) FROM eje_de_nomenclatura;
SELECT COUNT(*) FROM nomenclatura_domiciliaria;

-- Ver estructura de tabla
\d eje_de_nomenclatura
\d nomenclatura_domiciliaria

-- Buscar una dirección específica
SELECT * FROM nomenclatura_domiciliaria 
WHERE direccion ILIKE '%CALLE 39%' LIMIT 5;

-- Salir de psql
\q
```

---

## 🚪 Acceso a la API

### Local (en la máquina)
```
http://localhost:8000
http://localhost:8000/docs
```

### Si necesitas acceder desde otra máquina en la red
```
http://<tu-ip>:8000
```

**Para saber tu IP:**
```bash
hostname -I
```

---

## 📝 Ejemplo de Uso Completo

```bash
# 1. Iniciar
sudo docker-compose up -d

# 2. Esperar
sleep 30

# 3. Verificar salud
curl http://localhost:8000/health

# 4. Geocodificar
curl -X POST http://localhost:8000/api/v1/geocode \
  -H "Content-Type: application/json" \
  -d '{
    "direccion": "Carrera 33A 36B-20"
  }' | python -m json.tool

# 5. Normalizar
curl -X POST http://localhost:8000/api/v1/normalize \
  -H "Content-Type: application/json" \
  -d '{
    "direccion": "CL 39 #35-35"
  }' | python -m json.tool

# 6. Batch (múltiples)
curl -X POST http://localhost:8000/api/v1/geocode/batch \
  -H "Content-Type: application/json" \
  -d '{
    "direcciones": [
      "Calle 39 # 35-35",
      "CR 33A 36B-20",
      "Avenida Paseo Peatonal # 1-1"
    ]
  }' | python -m json.tool

# 7. Detener
sudo docker-compose down
```

---

## 🔄 Workflow Desarrollo

```bash
# Hacer cambios en el código (python files)

# Rebuild y restart
sudo docker-compose up -d --build

# Ver logs
sudo docker-compose logs -f api

# Probar
curl http://localhost:8000/...
```

---

**¡Listo! Si todo funciona, tienes una API de geocodificación corriendo en Docker. 🎉**

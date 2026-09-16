#!/usr/bin/env bash

# ==============================================================================
# GeoFull V4 — Linux & macOS Startup Service (Limpieza Estricta de Puertos)
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}    GeoFull V4 — Servicio de Inicio y Entorno      ${NC}"
echo -e "${BLUE}====================================================${NC}\n"

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Limpieza estricta previa de procesos colgados en puertos 8000, 8080, 8081, 5173
echo -e "      Liberando puertos (8000, 8080, 8081, 5173)..."
fuser -k 8000/tcp 8080/tcp 8081/tcp 5173/tcp 2>/dev/null || true
pkill -f "uvicorn app.main" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Cargar variables de entorno si existe .env
if [ -f .env ]; then
    echo -e "      Cargando variables de entorno desde .env..."
    set -a
    source .env
    set +a
fi

# ── 1. Verificar Requisitos ────────────────────────────────────────────────
echo -e "${GREEN}[1/5] Verificando requisitos del sistema...${NC}"

# Python Check
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "${RED}[ERROR] Python 3.11+ no encontrado.${NC}"
    exit 1
fi
echo -e "      Python: $($PYTHON_CMD --version)"

# Node.js Check
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js no encontrado.${NC}"
    exit 1
fi
echo -e "      Node.js: $(node --version)"

# Docker Check
DOCKER_CMD=""
DOCKER_COMPOSE_CMD=""
if command -v docker &> /dev/null; then
    DOCKER_CMD="docker"
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    fi
fi

# ── 2. Base de Datos PostgreSQL + PostGIS ─────────────────────────────────
echo -e "\n${GREEN}[2/5] Verificando PostgreSQL + PostGIS (Docker)...${NC}"
if [ -n "$DOCKER_COMPOSE_CMD" ]; then
    echo -e "      Iniciando PostgreSQL + PostGIS contenedor (puerto 5433)..."
    $DOCKER_COMPOSE_CMD up -d db 2>/dev/null || docker-compose up -d db 2>/dev/null
    echo -e "      [OK] PostgreSQL PostGIS en ejecución (puerto 5433)"
else
    echo -e "${YELLOW}      [AVISO] Docker Compose no detectado. Asumiendo PostGIS local en puerto 5433.${NC}"
fi

# ── 3. Entorno Virtual Python & Dependencias Backend ──────────────────────
echo -e "\n${GREEN}[3/5] Configurando Backend FastAPI (Python)...${NC}"
cd "$SCRIPT_DIR/backend"
if [ ! -d ".venv" ]; then
    echo -e "      Creando entorno virtual (.venv)..."
    $PYTHON_CMD -m venv .venv
fi

source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null
if [ -f "requirements.txt" ]; then
    echo -e "      Instalando/Actualizando dependencias Python..."
    pip install -q -r requirements.txt 2>/dev/null || echo -e "${YELLOW}      Dependencias backend listas.${NC}"
fi
cd "$SCRIPT_DIR"

# ── 4. Dependencias Frontend React ─────────────────────────────────────────
echo -e "\n${GREEN}[4/5] Configurando Frontend React (Vite)...${NC}"
cd "$SCRIPT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo -e "      Instalando dependencias de npm..."
    npm install --silent
else
    echo -e "      [OK] node_modules listo."
fi
cd "$SCRIPT_DIR"

# ── 5. Iniciar Servicios en Desarrollo ────────────────────────────────────
echo -e "\n${GREEN}[5/5] Iniciando GeoFull V4...${NC}"
echo -e "${PURPLE}----------------------------------------------------${NC}"
echo -e " 🚀 Frontend React:  ${GREEN}http://localhost:8080${NC}"
echo -e " ⚡ Backend FastAPI: ${GREEN}http://localhost:8000/docs${NC}"
echo -e " 🗄️  PostgreSQL RLS: ${GREEN}localhost:5433${NC}"
echo -e "${PURPLE}----------------------------------------------------${NC}\n"

# Manejador de apagado limpio al presionar Ctrl+C o salir
cleanup() {
    echo -e "\n${YELLOW}Deteniendo GeoFull V4 y liberando procesos/puertos...${NC}"
    fuser -k 8000/tcp 8080/tcp 8081/tcp 5173/tcp 2>/dev/null || true
    pkill -f "uvicorn app.main" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    pkill -P $$ 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Iniciar Backend y Frontend en paralelo
cd "$SCRIPT_DIR/backend"
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null
if [ -f "app/main.py" ]; then
    uvicorn app.main:app --reload --port 8000 &
fi

cd "$SCRIPT_DIR/frontend"
npm run dev -- --port 8080 &

wait

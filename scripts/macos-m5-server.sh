#!/usr/bin/env bash
# ==============================================================================
# FiberOps FTTH Management System - macOS Apple Silicon M5 Server Orchestrator
# Target: 13-inch MacBook Air (Apple M5, 10-core CPU, 10-core GPU, 24GB Unified Memory)
# Architecture: Hybrid On-Premise (Native Ollama on Metal + OrbStack/Docker Stack)
# ==============================================================================

set -euo pipefail

# --- Environment Setup (Homebrew & Standard Paths) ---
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${CYAN}   FIBEROPS ON-PREMISE SERVER ORCHESTRATOR — APPLE SILICON M5 (24GB)         ${NC}"
echo -e "${CYAN}==============================================================================${NC}"

# ------------------------------------------------------------------------------
# STEP 1: Thermal & Memory Protection Controls for Native Ollama (Metal GPU)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/5] Setting thermal & concurrency safeguards for fanless M5 chassis...${NC}"
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_KEEP_ALIVE="10m"

echo -e "  ✔ OLLAMA_HOST:            ${OLLAMA_HOST}"
echo -e "  ✔ OLLAMA_NUM_PARALLEL:    1 (Sequential query execution avoids thermal spike)"
echo -e "  ✔ OLLAMA_MAX_LOADED_MODELS: 1 (Locks single model in Metal GPU unified memory)"
echo -e "  ✔ OLLAMA_KEEP_ALIVE:      10m (Releases VRAM after idle period)"

# ------------------------------------------------------------------------------
# STEP 2: Check & Start Native macOS Ollama Engine
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/5] Verifying Native macOS Ollama daemon on port 11434...${NC}"
if ! curl -s --connect-timeout 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo -e "  ℹ Native Ollama is not active. Attempting to start in background..."
    if command -v ollama >/dev/null 2>&1; then
        ollama serve >/dev/null 2>&1 &
        sleep 3
        if curl -s --connect-timeout 5 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
            echo -e "  ${GREEN}✔ Native Ollama started successfully on port 11434.${NC}"
        else
            echo -e "  ${RED}✖ Failed to start Ollama automatically. Please open Ollama.app or run 'ollama serve'.${NC}"
        fi
    else
        echo -e "  ${RED}✖ 'ollama' CLI not found. Install via: brew install ollama${NC}"
    fi
else
    echo -e "  ${GREEN}✔ Native Ollama daemon is active and listening on port 11434.${NC}"
fi

# Check qwen2.5:7b model presence
if command -v ollama >/dev/null 2>&1 && curl -s --connect-timeout 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    if ollama list 2>/dev/null | grep -q "qwen2.5:7b"; then
        echo -e "  ${GREEN}✔ Model 'qwen2.5:7b' is installed and ready for Metal acceleration.${NC}"
    else
        echo -e "  ${YELLOW}ℹ Model 'qwen2.5:7b' not detected. Pulling model now...${NC}"
        ollama pull qwen2.5:7b || echo -e "  ${RED}⚠ Could not pull model immediately. Run 'ollama pull qwen2.5:7b' manually.${NC}"
    fi
fi

# ------------------------------------------------------------------------------
# STEP 3: macOS Power & Disk Permission Check
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/5] Checking macOS power management & disk readiness...${NC}"

# Check lid/sleep configuration reminder
echo -e "  ℹ Power Management Reminder for Continuous Server Operation:"
echo -e "    Run once to allow clamshell/lid-closed 24/7 server mode:"
echo -e "    ${CYAN}sudo pmset -a disablesleep 1 autorestart 1${NC}"

# Check External SSD HW-02 (/Volumes/FiberOpsBackup)
if [ -d "/Volumes/FiberOpsBackup" ]; then
    echo -e "  ${GREEN}✔ External Backup SSD (HW-02) detected at /Volumes/FiberOpsBackup.${NC}"
else
    echo -e "  ${YELLOW}ℹ External Backup SSD not mounted at /Volumes/FiberOpsBackup.${NC}"
    echo -e "    Backups will automatically use internal storage fallback: ./backups"
fi
echo -e "    Ensure Terminal/Docker/OrbStack has ${CYAN}Full Disk Access${NC} in System Settings -> Privacy & Security."

# ------------------------------------------------------------------------------
# STEP 4: Start Docker Compose Stack (OrbStack / Docker Engine)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/5] Starting Docker containers (PostgreSQL, Redis, MinIO, Next.js, Nginx)...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.yml"

if ! docker info >/dev/null 2>&1; then
    echo -e "  ${RED}✖ Docker daemon is not running! Please start OrbStack or Docker Desktop.${NC}"
    exit 1
fi

# Note: Service 'ollama' in docker-compose.yml has profile 'linux-docker-ai',
# so it is excluded on macOS to avoid duplicate memory allocation!
docker compose -f "${COMPOSE_FILE}" up -d nginx nextjs-web postgres redis minio

echo -e "  ${GREEN}✔ Docker services started successfully with M5-optimized memory limits:${NC}"
echo -e "    - postgres:    2048 MB limit"
echo -e "    - nextjs-web:  2048 MB limit (bridged to host.docker.internal:11434)"
echo -e "    - minio:       1536 MB limit"
echo -e "    - redis:        512 MB limit"
echo -e "    - nginx:        256 MB limit"
echo -e "    - Reserved for macOS & Native Metal GPU: ~17.5 GB"

# ------------------------------------------------------------------------------
# STEP 5: Keep Alive with Caffeinate & Monitor Stack
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[5/5] Activating caffeinate assertion (preventing sleep during server uptime)...${NC}"
echo -e "${GREEN}Server is running at http://localhost:80 (HTTPS port 443 active).${NC}"
echo -e "Press [Ctrl+C] to gracefully stop server containers.\n"

cleanup() {
    echo -e "\n${YELLOW}Stopping FiberOps Docker containers...${NC}"
    docker compose -f "${COMPOSE_FILE}" down
    echo -e "${GREEN}Containers stopped cleanly. Goodbye!${NC}"
    exit 0
}
trap cleanup INT TERM

if command -v caffeinate >/dev/null 2>&1; then
    # -d: prevent display sleep
    # -i: prevent idle sleep
    # -m: prevent disk idle sleep
    # -s: prevent system sleep on AC power
    # -u: declare user is active
    caffeinate -dimsu docker compose -f "${COMPOSE_FILE}" logs -f
else
    docker compose -f "${COMPOSE_FILE}" logs -f
fi


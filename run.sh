#!/usr/bin/env bash
# ==============================================================================
# Jademd - Lanzador Universal para Linux / Ubuntu Desktop
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

VAULT_DIR="${1:-$DIR/demo_vault}"

echo "=================================================="
echo "           Iniciando JADEMD Knowledge Base        "
echo "=================================================="
echo "Bóveda objetivo: $VAULT_DIR"
echo "Directorio de trabajo: $DIR"

# Verificar si el binario existe, si no compilarlo
if [ ! -f "$DIR/target/debug/jademd" ]; then
    echo "Compilando binario de Rust jademd..."
    cargo build --bin jademd
fi

# Verificar si el frontend dist existe, si no construirlo
if [ ! -d "$DIR/frontend/dist" ]; then
    echo "Construyendo frontend estático..."
    (cd "$DIR/frontend" && npm run build)
fi

echo "Iniciando servidor de Rust en http://127.0.0.1:3030..."
# Iniciar en segundo plano y abrir navegador
"$DIR/target/debug/jademd" "$VAULT_DIR" &
SERVER_PID=$!

# Esperar a que el servidor responda
for i in {1..20}; do
    if curl -s http://127.0.0.1:3030/api/vault/info > /dev/null 2>&1; then
        break
    fi
    sleep 0.2
done

# Abrir el navegador por defecto
if command -v xdg-open > /dev/null; then
    xdg-open "http://127.0.0.1:3030" > /dev/null 2>&1 &
fi

echo "Jademd está ejecutándose con PID $SERVER_PID."
echo "Presiona Ctrl+C para detener el servidor."

wait $SERVER_PID

#!/bin/bash
# Script para arrancar el backend de By Jers automáticamente

cd "$(dirname "$0")/backend"

# Verificar si ya está corriendo
if curl -s http://localhost:3001/api/products/featured > /dev/null 2>&1; then
    echo "El backend ya está corriendo en http://localhost:3001"
    exit 0
fi

echo "Arrancando backend..."
nohup node src/app.js > /tmp/byjers-backend.log 2>&1 &
echo $! > /tmp/byjers-backend.pid

# Esperar a que esté listo
for i in {1..30}; do
    if curl -s http://localhost:3001/api/products/featured > /dev/null 2>&1; then
        echo "Backend corriendo en http://localhost:3001 (PID: $(cat /tmp/byjers-backend.pid))"
        exit 0
    fi
    sleep 1
done

echo "Error: el backend no arrancó correctamente"
cat /tmp/byjers-backend.log
exit 1

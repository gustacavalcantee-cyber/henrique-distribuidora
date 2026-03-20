#!/bin/bash

# Instalador do Henrique Vendas
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SOURCE="${SCRIPT_DIR}/Henrique Vendas.app"
APP_DEST="/Applications/Henrique Vendas.app"

echo "========================================"
echo "  Instalando Henrique Vendas..."
echo "========================================"

# Remove versao antiga se existir
if [ -d "$APP_DEST" ]; then
  echo "Removendo versao anterior..."
  rm -rf "$APP_DEST"
fi

# Copia o app para Applications
echo "Copiando para Applications..."
cp -r "$APP_SOURCE" "$APP_DEST"

# Remove bloqueio de seguranca do macOS
echo "Configurando permissoes..."
xattr -cr "$APP_DEST"

echo ""
echo "Instalado com sucesso!"
echo "Abrindo o programa..."
sleep 1
open "$APP_DEST"

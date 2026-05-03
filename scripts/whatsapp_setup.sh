#!/usr/bin/env bash
#
# Cria a estrutura de pastas persistentes para o relatorio semanal de WhatsApp.
#
# Uso:
#   ./scripts/whatsapp_setup.sh
#
# Cria:
#   inputs/whatsapp/
#     ceo/_export/                    <- aqui descompactas o export completo do WhatsApp
#     claude-code/_export/
#     financeiro/_export/
#     t2-condeixa/_export/
#     predio-lajes/_export/
#     comercial-investidores/_export/
#     comercial-imoveis/_export/
#     caep/_export/
#
# Cada subpasta `_export/` recebe o export INTEIRO da conversa (cresce com o tempo).
# Para gerar o relatorio de uma semana, corre depois:
#   python scripts/whatsapp_filter_week.py YYYY-MM-DD
# que cria <chat>/YYYY-Www/ com apenas as mensagens de Segunda a Domingo.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT_DIR/inputs/whatsapp"

CHATS=(ceo claude-code financeiro t2-condeixa predio-lajes comercial-investidores comercial-imoveis caep)

mkdir -p "$DEST"
for chat in "${CHATS[@]}"; do
  mkdir -p "$DEST/$chat/_export"
done

echo "Pastas criadas em: $DEST"
echo
echo "Estrutura:"
for chat in "${CHATS[@]}"; do
  echo "  $chat/_export/"
done
echo
echo "Em cada subpasta _export/ descompacta o export do WhatsApp (com media):"
echo "  - _chat.txt"
echo "  - AUD-*.opus / *.m4a / *.mp3"
echo "  - IMG-*.jpg / *.png / *.heic"
echo
echo "A pasta inputs/whatsapp/ esta no .gitignore (nada vai para git)."
echo
echo "Para gerar o relatorio da semana actual:"
echo "  python scripts/whatsapp_filter_week.py        # semana de hoje"
echo "  python scripts/whatsapp_filter_week.py 2026-04-29   # semana que contem essa data"

# Abrir no Finder
open "$DEST" 2>/dev/null || true

#!/bin/bash
# Regenera PDFs após cada commit
cd "$(git rev-parse --show-toplevel)/.."
npx md-to-pdf "DISASTER-RECOVERY.md" --pdf-options '{"format":"A4","margin":{"top":"15mm","bottom":"15mm","left":"12mm","right":"12mm"}}' 2>/dev/null
npx md-to-pdf "relatorio-crm-somnium.md" --pdf-options '{"format":"A4","margin":{"top":"20mm","bottom":"20mm","left":"15mm","right":"15mm"}}' 2>/dev/null
echo "[hook] PDFs atualizados"

#!/usr/bin/env bash
# Stop hook: build-gate + auto commit/push para main.
# Em vez de falhar em silêncio, escreve um aviso bem visível em AUTO_PUSH_FALHOU.txt
# na raiz do repo e devolve um systemMessage JSON quando o build ou o push falham.
# Toda a saída de git/npm vai para o log; o ÚNICO stdout é o JSON final (para o
# Claude Code o conseguir parsear).

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 0

LOG="/tmp/somnium-build.log"
MARK="$REPO/AUTO_PUSH_FALHOU.txt"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Limpa qualquer aviso anterior — partimos de um estado limpo.
rm -f "$MARK"

git add -A >>"$LOG" 2>&1

# Nada para gravar → sair sem ruído.
if git diff --cached --quiet; then
  exit 0
fi

falhar() {
  # $1 = título curto; $2 = detalhe para o ficheiro/log
  {
    echo "⚠️  AUTO-PUSH FALHOU — $STAMP"
    echo ""
    echo "$1"
    echo ""
    echo "As tuas alterações NÃO foram para produção (continuam só no working tree)."
    echo "Detalhe: $2"
    echo "Log completo: $LOG"
    echo ""
    echo "Resolve manualmente e depois: git add -A && git commit && git push origin main"
    echo "(apaga este ficheiro quando estiver resolvido — o próximo push fá-lo automaticamente)"
  } > "$MARK"
  printf '{"systemMessage":"⚠️ AUTO-PUSH FALHOU (%s): %s — alterações NÃO foram para produção. Ver AUTO_PUSH_FALHOU.txt e %s"}\n' "$1" "$2" "$LOG"
  exit 0
}

# 1) Build é o gate.
if ! npm run build >"$LOG" 2>&1; then
  falhar "BUILD FALHOU" "o build de produção rebentou; nada foi commited"
fi

# 2) Commit + sincronizar + push.
if ! git commit -m "auto: update from Claude Code" >>"$LOG" 2>&1; then
  falhar "COMMIT FALHOU" "git commit devolveu erro"
fi
if ! git pull origin main --rebase --no-edit >>"$LOG" 2>&1; then
  falhar "REBASE FALHOU" "conflito ao sincronizar com origin/main; o commit ficou local"
fi
if ! git push origin main >>"$LOG" 2>&1; then
  falhar "PUSH FALHOU" "o commit existe localmente mas não chegou ao GitHub"
fi

# Sucesso.
printf '{"systemMessage":"✅ Build OK + push para main (%s) — deploy disparado"}\n' "$STAMP"
exit 0

#!/usr/bin/env bash
# Stop hook: build-gate + auto commit/push para main.
#
# Comita APENAS os ficheiros que o Claude editou nesta sessão — registados pelo
# PostToolUse hook (record-touched.cjs) em .claude/.touched/<session_id>.
# A WIP do utilizador noutros ficheiros NUNCA é tocada (nem staged, nem stashed,
# nem rebased). Sem manifesto => não comita nada.
#
# Em vez de falhar em silêncio, escreve um aviso em AUTO_PUSH_FALHOU.txt na raiz
# e devolve um systemMessage JSON quando o build ou o push falham. O ÚNICO stdout
# é o JSON final (para o Claude Code o parsear).

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 0

LOG="/tmp/somnium-build.log"
MARK="$REPO/AUTO_PUSH_FALHOU.txt"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Limpa qualquer aviso anterior — partimos de um estado limpo.
rm -f "$MARK"

# 0) Descobrir a sessão (stdin = JSON do hook) e o manifesto de ficheiros tocados.
INPUT="$(cat)"
SESSION="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).session_id||""))}catch{process.stdout.write("")}})' 2>/dev/null)"
MANIFEST="$REPO/.claude/.touched/$SESSION"

# Sem sessão ou sem manifesto => o Claude não editou ficheiros; sair em silêncio.
if [ -z "$SESSION" ] || [ ! -s "$MANIFEST" ]; then
  exit 0
fi

falhar() {
  # $1 = título curto; $2 = detalhe para o ficheiro/log
  {
    echo "⚠️  AUTO-PUSH FALHOU — $STAMP"
    echo ""
    echo "$1"
    echo ""
    echo "As alterações do Claude NÃO foram para produção (continuam no working tree)."
    echo "Detalhe: $2"
    echo "Log completo: $LOG"
    echo ""
    echo "Resolve manualmente e depois: git commit && git push origin main"
    echo "(apaga este ficheiro quando estiver resolvido)"
  } > "$MARK"
  printf '{"systemMessage":"⚠️ AUTO-PUSH FALHOU (%s): %s — alterações NÃO foram para produção. Ver AUTO_PUSH_FALHOU.txt e %s"}\n' "$1" "$2" "$LOG"
  exit 0
}

# 1) Stage APENAS os ficheiros que o Claude tocou (dedup). git add trata
#    modificações, criações e remoções. Ficheiros fora do repo são ignorados.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  git add -- "$f" >>"$LOG" 2>&1 || true
done < <(sort -u "$MANIFEST")

# Nada efectivamente staged (ex.: edição revertida) => sair sem ruído.
if git diff --cached --quiet; then
  rm -f "$MANIFEST"
  exit 0
fi

# 2) Guard: KPIs/agregados sobre `negocios` têm de filtrar deleted_at.
if ! GUARD_OUT="$(node "$REPO/.claude/guard-deleted-at.cjs" 2>&1)"; then
  echo "$GUARD_OUT" >>"$LOG"
  falhar "GUARD deleted_at FALHOU" "uma query de KPIs/agregados sobre negocios não filtra deleted_at — $(echo "$GUARD_OUT" | tail -1)"
fi

# 3) Build é o gate.
if ! npm run build >"$LOG" 2>&1; then
  falhar "BUILD FALHOU" "o build de produção rebentou; nada foi commited"
fi

# 4) Commit dos ficheiros staged + push. Sem pull/rebase aqui: não mexemos no
#    working tree (a WIP do utilizador fica intacta). O SessionStart já faz pull;
#    se o remote tiver avançado e o push for rejeitado, avisamos.
if ! git commit -m "auto: update from Claude Code" >>"$LOG" 2>&1; then
  falhar "COMMIT FALHOU" "git commit devolveu erro"
fi
if ! git push origin main >>"$LOG" 2>&1; then
  falhar "PUSH FALHOU" "o commit existe localmente mas não chegou ao GitHub (talvez o remote tenha avançado — faz git pull --rebase)"
fi

# Sucesso: o manifesto já foi consumido.
rm -f "$MANIFEST"
printf '{"systemMessage":"✅ Build OK + push para main (%s) — só ficheiros editados pelo Claude; deploy disparado"}\n' "$STAMP"
exit 0
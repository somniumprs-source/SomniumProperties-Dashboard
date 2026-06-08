#!/usr/bin/env node
/*
 * Guard: KPIs/portfolio/métricas/agregados sobre `negocios` TÊM de filtrar
 * negócios apagados (deleted_at IS NULL). Sem isto, somas e contagens incluem
 * negócios na lixeira — foi o bug que inflou o "Lucro esperado" do Wholesalling
 * (102 500 € em vez de 53 000 €, somando 2 negócios apagados).
 *
 * Heurística POR-QUERY (não por-handler — a versão antiga deixava passar uma tab
 * sem filtro só porque outra tab do mesmo handler mencionava deleted_at):
 * para CADA `FROM negocios` com agregação (SUM/COUNT/AVG), tem de filtrar
 * deleted_at — diretamente na janela da query, OU via uma cláusula WHERE
 * interpolada (${var}) cuja definição seja deleted_at-aware.
 *
 * Não-violações reconhecidas automaticamente:
 *  - lookups escalares por id/chave (`FROM negocios WHERE id = ...`): não é métrica.
 *  - `WHERE ${var}`/`FROM negocios ${var}` em que `var` (ou o array de condições
 *    de que deriva) é definido com deleted_at — ex. wRegNeg, filterNegocio/conds.
 *
 * Escape manual: comentar `guard:deleted-at-ok` junto da query (com justificação),
 * para casos legítimos que contam linhas físicas incluindo a lixeira (ex. restore).
 *
 * Sai com código 1 e lista as violações. 0 = tudo bem.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const FILES = [
  'src/db/routes.js',
  'supabase/functions/crm/index.ts',
]

const TEM_AGREGADO = /\bSUM\s*\(|\bCOUNT\s*\(|\bAVG\s*\(/i
const FROM_NEGOCIOS = /FROM\s+negocios\b/gi
const ANTES = 700
const DEPOIS = 280

// Recolhe os nomes de variáveis "deleted_at-aware" do ficheiro:
//  1) qualquer `const/let X = ... deleted_at ...` (ex. wRegNeg, e arrays de conds)
//  2) `Y = ... X.join(...)` quando X é aware (ex. filterNegocio = conds.join(' AND '))
function awareVars(text) {
  const aware = new Set()
  const lines = text.split('\n')
  // `(?::[^=]+)?` tolera anotação de tipo TS (ex. const conds: string[] = [...])
  for (const l of lines) {
    const m = l.match(/(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=/)
    if (m && /deleted_at/.test(l)) aware.add(m[1])
  }
  // arrays inicializados/empurrados com deleted_at (ex. const conds = ['n.deleted_at IS NULL'])
  for (const l of lines) {
    const m = l.match(/(\w+)\s*(?::[^=]+)?(?:=|\.push\()\s*[^\n]*deleted_at/)
    if (m) aware.add(m[1])
  }
  // propagação: Y = ...<aware>.join(...)
  let changed = true
  while (changed) {
    changed = false
    for (const l of lines) {
      const m = l.match(/(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=([^\n]*)/)
      if (!m || aware.has(m[1])) continue
      for (const a of aware) {
        if (new RegExp(`\\b${a}\\b`).test(m[2])) { aware.add(m[1]); changed = true; break }
      }
    }
  }
  return aware
}

const violations = []

for (const rel of FILES) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) continue
  const text = fs.readFileSync(abs, 'utf8')
  const aware = awareVars(text)

  let m
  FROM_NEGOCIOS.lastIndex = 0
  while ((m = FROM_NEGOCIOS.exec(text)) !== null) {
    const from = m.index
    const janela = text.slice(Math.max(0, from - ANTES), from + DEPOIS)
    const depois = text.slice(from, from + 160)

    if (!TEM_AGREGADO.test(janela)) continue          // não é agregado → ignora
    if (/deleted_at/.test(janela)) continue            // já filtra na janela → ok
    if (/guard:deleted-at-ok/.test(janela)) continue   // escape explícito

    // lookup escalar por id/chave → não é métrica
    if (/FROM\s+negocios(?:\s+\w+)?\s+WHERE\s+[\w.]*\bid\b\s*=/i.test(depois)) continue

    // cláusula WHERE interpolada cuja variável é deleted_at-aware
    const interp = depois.match(/\$\{(\w+)\}/)
    if (interp && aware.has(interp[1])) continue

    const line = text.slice(0, from).split('\n').length
    violations.push({ file: rel, line })
  }
}

if (violations.length) {
  console.error('GUARD deleted_at — agregado (SUM/COUNT/AVG) sobre `negocios` sem filtro de apagados:')
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line}  — agrega negocios mas não filtra deleted_at IS NULL`)
  }
  console.error('Adiciona `deleted_at IS NULL` à query (ou ao filtro de condições), ou comenta `guard:deleted-at-ok` se for intencional (ex. contar linhas físicas num restore).')
  process.exit(1)
}

console.log('GUARD deleted_at — OK')
process.exit(0)

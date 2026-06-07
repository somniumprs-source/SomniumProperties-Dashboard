#!/usr/bin/env node
/*
 * Guard: KPIs/portfolio/métricas/agregados sobre `negocios` TÊM de filtrar
 * negócios apagados (deleted_at IS NULL). Sem isto, somas e contagens incluem
 * negócios na lixeira — foi o bug que inflou o "Lucro esperado" do Wholesalling
 * (102 500 € em vez de 53 000 €, somando 2 negócios apagados).
 *
 * Heurística (baixo falso-positivo): em cada handler de rota cujo caminho seja
 * de KPIs/portfolio/métricas/agregados, se houver uma query a `negocios` com
 * agregação (SUM/COUNT), o corpo do handler tem de mencionar `deleted_at`.
 *
 * Escape válido: comentar `guard:deleted-at-ok` no handler (com a justificação).
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

// Rotas onde somar/contar negócios apagados é um bug.
const ROTA_SENSIVEL = /(portfolio|kpis?|metricas?|resumo|agregad|dashboard)/i
const ROUTE_DECL = /(?:router|app)\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g
const TEM_AGREGADO = /\bSUM\s*\(|\bCOUNT\s*\(/i

const violations = []

for (const rel of FILES) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) continue
  const text = fs.readFileSync(abs, 'utf8')

  // Posições de cada declaração de rota → fatiar o ficheiro em handlers.
  const marks = []
  let m
  ROUTE_DECL.lastIndex = 0
  while ((m = ROUTE_DECL.exec(text)) !== null) marks.push({ idx: m.index, route: m[1] })

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx
    const end = i + 1 < marks.length ? marks[i + 1].idx : text.length
    const chunk = text.slice(start, end)
    const route = marks[i].route

    if (!ROTA_SENSIVEL.test(route)) continue
    if (!/\bnegocios\b/.test(chunk)) continue
    if (!TEM_AGREGADO.test(chunk)) continue
    if (/guard:deleted-at-ok/.test(chunk)) continue
    if (/deleted_at/.test(chunk)) continue

    const line = text.slice(0, start).split('\n').length
    violations.push({ file: rel, route, line })
  }
}

if (violations.length) {
  console.error('GUARD deleted_at — query de KPIs/agregados sobre `negocios` sem filtro de apagados:')
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line}  rota "${v.route}" — agrega negocios mas não filtra deleted_at IS NULL`)
  }
  console.error('Adiciona `n.deleted_at IS NULL` à query (ou ao filtro de condições), ou comenta `guard:deleted-at-ok` se for intencional.')
  process.exit(1)
}

console.log('GUARD deleted_at — OK')
process.exit(0)

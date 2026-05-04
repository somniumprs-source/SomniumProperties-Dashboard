#!/usr/bin/env node
/**
 * Importa um PDF de relatório semanal já gerado externamente para a aba
 * "Relatórios Administração", sem reanalisar via Claude.
 *
 * O PDF original fica guardado em Relatorios/RelatoriosSemanais/<semana>.pdf
 * e a coluna pdf_original_path da tabela relatorios_semanais aponta para ele.
 * O endpoint GET /api/crm/relatorios-semanais/:id/pdf serve este ficheiro
 * directamente (em vez de gerar via template), preservando layout exacto.
 *
 * Uso:
 *   node scripts/import-relatorio-semanal.js \
 *     --semana 2026-W14 \
 *     --pdf "/caminho/para/relatorio.pdf" \
 *     --data-inicio 2026-03-30 \
 *     --data-fim 2026-04-05 \
 *     [--titulo "Relatório de Reunião Semanal"] \
 *     [--subtitulo "Estratégia Comercial e Captação de Capital"] \
 *     [--substituir]
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import pool from '../src/db/pg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DEST_DIR = path.join(ROOT, 'Relatorios', 'RelatoriosSemanais')

const args = process.argv.slice(2)
const get = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const flag = (n) => args.includes(n)

const semana = get('--semana')
const pdfSrc = get('--pdf')
const dataInicio = get('--data-inicio')
const dataFim = get('--data-fim')
const titulo = get('--titulo') || 'Relatório de Reunião Semanal'
const subtitulo = get('--subtitulo') || 'Estratégia Comercial e Captação de Capital'
const substituir = flag('--substituir')

if (!semana || !pdfSrc || !dataInicio || !dataFim) {
  console.error('Uso: node scripts/import-relatorio-semanal.js --semana 2026-W14 --pdf <path> --data-inicio 2026-03-30 --data-fim 2026-04-05 [--titulo ...] [--substituir]')
  process.exit(1)
}

if (!fs.existsSync(pdfSrc)) {
  console.error(`PDF nao encontrado: ${pdfSrc}`)
  process.exit(1)
}

fs.mkdirSync(DEST_DIR, { recursive: true })
const destFname = `${semana}.pdf`
const destAbs = path.join(DEST_DIR, destFname)
const destRel = path.relative(ROOT, destAbs)

fs.copyFileSync(pdfSrc, destAbs)
console.log(`✓ Copiado para ${destRel} (${(fs.statSync(destAbs).size / 1024).toFixed(1)} KB)`)

const { rows: [existing] } = await pool.query(
  'SELECT id FROM relatorios_semanais WHERE semana_iso = $1', [semana]
)

const now = new Date().toISOString()
let id

if (existing) {
  if (!substituir) {
    console.error(`Ja existe relatorio para ${semana} (id=${existing.id}). Usar --substituir para sobrepor.`)
    process.exit(1)
  }
  id = existing.id
  await pool.query(
    `UPDATE relatorios_semanais
     SET titulo=$1, subtitulo=$2, data_inicio=$3, data_fim=$4,
         pdf_original_path=$5, updated_at=$6
     WHERE id=$7`,
    [titulo, subtitulo, dataInicio, dataFim, destRel, now, existing.id]
  )
  console.log(`✓ Actualizado relatorio existente (id=${id})`)
} else {
  id = randomUUID()
  await pool.query(
    `INSERT INTO relatorios_semanais
     (id, semana_iso, data_inicio, data_fim, titulo, subtitulo, pdf_original_path, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, semana, dataInicio, dataFim, titulo, subtitulo, destRel, now, now]
  )
  console.log(`✓ Criado novo relatorio (id=${id})`)
}

console.log(`\n✓ Disponivel em /relatorios-admin (semana ${semana})`)
console.log(`  PDF servido directamente de ${destRel}`)

await pool.end()

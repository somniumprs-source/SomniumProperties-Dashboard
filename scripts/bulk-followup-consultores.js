#!/usr/bin/env node
/**
 * Bulk follow-up: marca em todos os consultores um follow-up efectuado a 2026-04-27
 * com proximo follow-up a 2026-05-17 e motivo de reinicio de classificacao.
 *
 * Replica o comportamento do endpoint POST /api/crm/consultores/:id/followups:
 * cria entrada em consultor_followups e sincroniza os campos legados em consultores.
 *
 * Uso: node scripts/bulk-followup-consultores.js [--dry-run]
 */
import 'dotenv/config'
import { randomUUID } from 'crypto'
import pool from '../src/db/pg.js'

const DRY_RUN = process.argv.includes('--dry-run')
const DATA_FOLLOWUP = '2026-04-27'
const PROXIMO_FOLLOWUP = '2026-05-17'
const MOTIVO = 'Follow up geral para iniciar nova classificação'

async function main() {
  const { rows: consultores } = await pool.query(
    'SELECT id, nome FROM consultores ORDER BY nome'
  )
  console.log(
    `Encontrados ${consultores.length} consultores. ${DRY_RUN ? '[DRY-RUN]' : '[LIVE]'}`
  )

  let ok = 0
  let fail = 0
  for (const c of consultores) {
    if (DRY_RUN) {
      console.log(`  - ${c.nome} (${c.id})`)
      ok++
      continue
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO consultor_followups (id, consultor_id, data, motivo, proximo_follow_up, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [randomUUID(), c.id, DATA_FOLLOWUP, MOTIVO, PROXIMO_FOLLOWUP]
      )
      await client.query(
        `UPDATE consultores
         SET data_follow_up = $1, motivo_follow_up = $2, data_proximo_follow_up = $3
         WHERE id = $4`,
        [DATA_FOLLOWUP, MOTIVO, PROXIMO_FOLLOWUP, c.id]
      )
      await client.query('COMMIT')
      ok++
      console.log(`  OK ${c.nome}`)
    } catch (e) {
      await client.query('ROLLBACK')
      fail++
      console.error(`  FAIL ${c.nome}: ${e.message}`)
    } finally {
      client.release()
    }
  }
  console.log(`\nResultado: ${ok} ok, ${fail} fail.`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

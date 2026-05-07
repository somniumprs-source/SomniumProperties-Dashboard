#!/usr/bin/env node
/**
 * One-shot: limpa origem='Google Forms' nos investidores (passa para NULL).
 * Razão: "Google Forms" era um placeholder de canal de captura, não a origem real
 * da lead. Agora o sync lê a pergunta "Como nos conheceu?" do próprio Form.
 *
 * Uso:
 *   node scripts/migrate-origem-google-forms.js --dry-run
 *   node scripts/migrate-origem-google-forms.js
 */
import 'dotenv/config'
import pool from '../src/db/pg.js'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { rows } = await pool.query(
    `SELECT id, nome FROM investidores WHERE origem = 'Google Forms' ORDER BY nome`
  )

  console.log(
    `Encontrados ${rows.length} investidores com origem='Google Forms'. ${DRY_RUN ? '[DRY-RUN]' : '[LIVE]'}`
  )
  for (const r of rows) console.log(`  - ${r.nome} (${r.id})`)

  if (DRY_RUN || rows.length === 0) {
    await pool.end()
    return
  }

  const result = await pool.query(
    `UPDATE investidores SET origem = NULL, updated_at = NOW()::TEXT WHERE origem = 'Google Forms'`
  )
  console.log(`\nActualizados ${result.rowCount} registos.`)
  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

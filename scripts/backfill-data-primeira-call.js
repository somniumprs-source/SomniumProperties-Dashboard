#!/usr/bin/env node
/**
 * Backfill data_primeira_call: para cada consultor que tenha follow-ups registados
 * mas nao tenha data_primeira_call preenchida, define data_primeira_call = MIN(data)
 * dos seus follow-ups (i.e. data do primeiro contacto efectuado).
 *
 * Uso: node scripts/backfill-data-primeira-call.js [--dry-run]
 */
import 'dotenv/config'
import pool from '../src/db/pg.js'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { rows: candidatos } = await pool.query(`
    SELECT c.id, c.nome, MIN(f.data) AS min_data
    FROM consultores c
    JOIN consultor_followups f ON f.consultor_id = c.id
    WHERE c.data_primeira_call IS NULL OR c.data_primeira_call = ''
    GROUP BY c.id, c.nome
    HAVING MIN(f.data) IS NOT NULL
    ORDER BY c.nome
  `)

  console.log(
    `Encontrados ${candidatos.length} consultores para backfill. ${DRY_RUN ? '[DRY-RUN]' : '[LIVE]'}`
  )
  for (const c of candidatos) {
    console.log(`  - ${c.nome} (${c.id}) -> ${c.min_data}`)
  }

  if (DRY_RUN || candidatos.length === 0) {
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(`
      UPDATE consultores
      SET data_primeira_call = sub.min_data,
          updated_at = NOW()::text
      FROM (
        SELECT consultor_id, MIN(data) AS min_data
        FROM consultor_followups
        GROUP BY consultor_id
      ) sub
      WHERE consultores.id = sub.consultor_id
        AND (consultores.data_primeira_call IS NULL OR consultores.data_primeira_call = '')
        AND sub.min_data IS NOT NULL
    `)
    await client.query('COMMIT')
    console.log(`\nResultado: ${result.rowCount} consultores actualizados.`)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(`FAIL: ${e.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * Acesso direto à BD (DATABASE_URL do .env) para consultas e migrações.
 *
 * Uso:
 *   node scripts/db.mjs query "SELECT ..."          — imprime as linhas em JSON
 *   node scripts/db.mjs apply supabase/migrations/0063_x.sql
 *                                                    — corre o ficheiro numa transação
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'

const [cmd, arg] = process.argv.slice(2)
if (!process.env.DATABASE_URL) { console.error('ERRO: DATABASE_URL não definido no .env'); process.exit(1) }
if (!['query', 'apply'].includes(cmd) || !arg) {
  console.error('Uso: node scripts/db.mjs query "<sql>" | apply <ficheiro.sql>')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const client = await pool.connect()
try {
  if (cmd === 'query') {
    const { rows } = await client.query(arg)
    console.log(JSON.stringify(rows, null, 2))
  } else {
    const sql = readFileSync(arg, 'utf8')
    await client.query('BEGIN')
    const res = await client.query(sql)
    await client.query('COMMIT')
    for (const r of [].concat(res)) console.log(`${r.command} ${r.rowCount ?? ''}`.trim())
    console.log(`OK: ${arg} aplicado.`)
  }
} catch (e) {
  if (cmd === 'apply') await client.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

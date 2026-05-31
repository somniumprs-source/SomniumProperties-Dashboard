/**
 * Runner da migration 0014_historico_user_nome.sql.
 *
 * Adiciona user_nome a historico_alteracoes para distinguir utilizadores que
 * partilham a mesma sessao Supabase. Idempotente.
 *
 * Uso:  node scripts/run-migration-0014.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0014_historico_user_nome.sql')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERRO: DATABASE_URL nao definido no .env')
    process.exitCode = 1
    return
  }
  const sql = readFileSync(SQL_PATH, 'utf8')
  console.log(`A aplicar ${SQL_PATH} ...`)
  await pool.query(sql)
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='historico_alteracoes' AND column_name='user_nome'`
  )
  console.log(`\nColuna user_nome: ${rows[0] ? 'OK' : 'FALTA'}`)
  console.log('Migracao aplicada com sucesso.')
}

main()
  .catch(e => { console.error('Falhou:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())

/**
 * Runner da migration 0015_users_share_email.sql.
 *
 * Remove UNIQUE de users.email e cria o registo Alexandre Mendes (admin)
 * partilhando o mesmo email do Joao Abreu (somniumprs@gmail.com).
 *
 * Uso:  node scripts/run-migration-0015.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0015_users_share_email.sql')

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
    `SELECT id, nome, email, role, ativo FROM users WHERE LOWER(email) = LOWER('somniumprs@gmail.com') ORDER BY nome`
  )
  console.log('\nAdministradores com somniumprs@gmail.com:')
  for (const r of rows) console.log(`  - ${r.nome} (id=${r.id}, role=${r.role}, ativo=${r.ativo})`)
  console.log('\nMigracao aplicada com sucesso.')
}

main()
  .catch(e => { console.error('Falhou:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())

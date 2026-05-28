/**
 * Runner da migration 006 (foreign keys).
 *
 * Le scripts/migrations/006_foreign_keys.sql e executa-o no DATABASE_URL.
 * A 006 e segura: normaliza '' -> NULL nas colunas FK nullable e adiciona
 * as FKs como NOT VALID (sem scan, sem falhar por orfaos, sem apagar nada).
 * Idempotente: pode correr varias vezes.
 *
 * Recomendado correr ANTES: node scripts/audit-foreign-keys.mjs
 *
 * Uso:  node scripts/run-migration-006.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, 'migrations', '006_foreign_keys.sql')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function countFks() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
  )
  return rows[0].n
}

async function main() {
  const sql = readFileSync(SQL_PATH, 'utf8')
  const before = await countFks()
  console.log(`FKs antes: ${before}`)
  console.log(`A aplicar ${SQL_PATH} ...`)
  await pool.query(sql)
  const after = await countFks()
  console.log(`FKs depois: ${after}  (+${after - before})`)
  console.log('\nOK. FKs criadas como NOT VALID (escritas futuras validadas; dados antigos intactos).')
  console.log('Proximo passo opcional: node scripts/audit-foreign-keys.mjs  +  006b_validate_fks.sql nas relacoes limpas.')
}

main()
  .catch(e => { console.error('Falhou:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())

/**
 * Runner da migration 0046_investidores_dados_empresa.sql.
 *
 * Adiciona a coluna dados_empresa (JSONB) a tabela investidores, para
 * guardar dados legais de empresa (firma, NIPC, NISS, capital social,
 * sede, IBAN, socios) na ficha de investidores que sejam pessoas colectivas.
 *
 * Uso:  node scripts/run-migration-0046.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0046_investidores_dados_empresa.sql')

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
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'investidores' AND column_name = 'dados_empresa'`,
  )
  console.log(rows.length ? 'OK: coluna dados_empresa presente.' : 'AVISO: coluna nao encontrada apos migration.')
  await pool.end()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

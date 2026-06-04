/**
 * Runner da migration 0018_imoveis_tipo_operacao.sql.
 *
 * Adiciona a coluna tipo_operacao (TEXT) a tabela imoveis, para gravar a
 * estrategia de saida ("Fix & Flip" ou "Arrendamento") da ficha do imovel.
 *
 * Uso:  node scripts/run-migration-0018.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0018_imoveis_tipo_operacao.sql')

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
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'imoveis' AND column_name = 'tipo_operacao'`,
  )
  console.log(rows.length ? 'OK: coluna tipo_operacao presente.' : 'AVISO: coluna nao encontrada apos migration.')
  await pool.end()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

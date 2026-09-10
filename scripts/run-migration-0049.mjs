/**
 * Runner da migration 0049_orcamentos_obra_recebidos.sql.
 *
 * Cria a tabela orcamentos_obra_recebidos, para guardar os orçamentos reais
 * recebidos de fornecedores/empreiteiros por imóvel (fornecedor, valor,
 * ficheiro), distinta de orcamentos_obra (estimativa de custo planeada).
 *
 * Uso:  node scripts/run-migration-0049.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0049_orcamentos_obra_recebidos.sql')

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
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'orcamentos_obra_recebidos'`,
  )
  console.log(rows.length ? 'OK: tabela orcamentos_obra_recebidos presente.' : 'AVISO: tabela nao encontrada apos migration.')
  await pool.end()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

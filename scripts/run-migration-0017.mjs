/**
 * Runner da migration 0017_imoveis_valor_com_cedencia.sql.
 *
 * Adiciona a coluna valor_com_cedencia (REAL) a tabela imoveis, para que o
 * campo "Valor ja com Cedencia" na ficha do imovel passe a gravar.
 *
 * Uso:  node scripts/run-migration-0017.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0017_imoveis_valor_com_cedencia.sql')

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
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'imoveis' AND column_name = 'valor_com_cedencia'`
  )
  if (rows.length) {
    console.log(`\nColuna confirmada: imoveis.${rows[0].column_name} (${rows[0].data_type})`)
    console.log('Migracao aplicada com sucesso.')
  } else {
    console.error('\nERRO: coluna nao encontrada apos ALTER TABLE.')
    process.exitCode = 1
  }
}

main()
  .catch(e => { console.error('Falhou:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())

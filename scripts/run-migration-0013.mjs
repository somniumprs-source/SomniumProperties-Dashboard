/**
 * Runner da migration 0013_audit_log.sql (tabela audit_log + triggers em
 * imoveis, investidores, negocios).
 *
 * Le supabase/migrations/0013_audit_log.sql e executa-o no DATABASE_URL.
 * Idempotente: pode correr varias vezes (usa CREATE TABLE IF NOT EXISTS,
 * CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER).
 *
 * Uso:  node scripts/run-migration-0013.mjs
 *
 * Precisa de DATABASE_URL no .env (mesma BD que o servidor usa).
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '0013_audit_log.sql')

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

  // Verificar
  const { rows: [t] } = await pool.query(
    `SELECT to_regclass('public.historico_alteracoes') AS tbl`
  )
  const { rows: triggers } = await pool.query(
    `SELECT tgname FROM pg_trigger WHERE tgname IN ('historico_imoveis','historico_investidores','historico_negocios') ORDER BY tgname`
  )
  console.log(`\nTabela historico_alteracoes: ${t.tbl ? 'OK' : 'FALTA'}`)
  console.log(`Triggers instalados: ${triggers.map(r => r.tgname).join(', ') || 'NENHUM'}`)
  console.log('\nMigracao aplicada com sucesso.')
}

main()
  .catch(e => { console.error('Falhou:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())

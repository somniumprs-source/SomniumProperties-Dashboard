// Backfill one-off: para projectos (negocios) já existentes sem analise_snapshot,
// recupera a análise financeira activa do imóvel ligado e congela-a (inputs +
// calculados), tal como passa a acontecer automaticamente na criação de novos
// projectos (routes.js/autoCriarNegocioDeImovel).
import 'dotenv/config'
import pg from 'pg'
import { calcAnalise } from '../src/db/calcEngine.js'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function main() {
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS analise_snapshot JSONB`)
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS orcamento_obra_snapshot JSONB`)

  const { rows: negocios } = await pool.query(
    `SELECT id, movimento, imovel_id FROM negocios
     WHERE analise_snapshot IS NULL AND imovel_id IS NOT NULL AND deleted_at IS NULL`
  )
  console.log(`[backfill] ${negocios.length} projecto(s) sem analise_snapshot.`)

  let feitos = 0, semAnalise = 0, falhas = 0
  for (const neg of negocios) {
    try {
      const { rows: [analiseAtiva] } = await pool.query(
        'SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [neg.imovel_id]
      )
      if (!analiseAtiva) { semAnalise++; continue }
      const snapshot = { ...analiseAtiva, ...calcAnalise(analiseAtiva), _capturado_em: new Date().toISOString(), _origem: 'backfill' }
      await pool.query('UPDATE negocios SET analise_snapshot = $1 WHERE id = $2', [JSON.stringify(snapshot), neg.id])
      feitos++
      console.log(`  ok: ${neg.movimento || neg.id}`)
    } catch (e) {
      falhas++
      console.error(`  falhou: ${neg.movimento || neg.id} —`, e.message)
    }
  }
  console.log(`[backfill] concluído — ${feitos} preenchidos, ${semAnalise} sem análise activa, ${falhas} falhas.`)
  await pool.end()
}

main().catch(e => { console.error('[backfill] erro fatal:', e); process.exit(1) })

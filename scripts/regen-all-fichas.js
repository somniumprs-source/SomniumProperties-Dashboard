// Regenera a Ficha do Imóvel para TODOS os imóveis existentes.
// Aplica a nova política (substituir + nome com slug) e o novo logo preto.
import 'dotenv/config'
import pg from 'pg'
import { persistDocumento } from '../src/db/documentLifecycle.js'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const r = await pool.query(`SELECT id, nome FROM imoveis ORDER BY data_adicionado DESC NULLS LAST`)
  console.log(`A regenerar Ficha do Imóvel para ${r.rows.length} imóveis...`)
  let ok = 0, fail = 0
  for (const row of r.rows) {
    try {
      const im = (await pool.query(`SELECT * FROM imoveis WHERE id = $1`, [row.id])).rows[0]
      const out = await persistDocumento(im, 'ficha_imovel', {
        trigger: 'manual:regen-all-fichas',
        generatedBy: 'script',
      })
      ok++
      console.log(`  ✓ ${(im.nome || row.id).padEnd(40)}  v${out.version}  ${(out.sizeBytes / 1024).toFixed(1)} KB`)
    } catch (e) {
      fail++
      console.error(`  ✗ ${(row.nome || row.id).padEnd(40)}  ${e.message}`)
    }
  }
  console.log(`\nDone. OK=${ok}  FAIL=${fail}`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })

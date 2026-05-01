import { readFileSync } from 'fs'
import pg from 'pg'

// Manual .env parse
const envText = readFileSync('/tmp/somnium.env', 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const r1 = await pool.query(
  `SELECT id, nome, zona, tipologia, estado, valor_proposta, ask_price, custo_estimado_obra, valor_venda_remodelado, roi, roi_anualizado,
          (fotos IS NOT NULL) as tem_fotos,
          jsonb_array_length(COALESCE(fotos::jsonb, '[]'::jsonb)) as n_fotos
   FROM imoveis
   WHERE nome ILIKE '%cave%lages%' OR nome ILIKE '%lages%'`
)
console.log('=== IMÓVEIS encontrados ===')
console.table(r1.rows)

for (const im of r1.rows) {
  const r2 = await pool.query(
    `SELECT id, activa, compra, obra_com_iva, vvr, lucro_liquido, retorno_anualizado, capital_necessario, regime_fiscal, created_at
     FROM analises WHERE imovel_id = $1 ORDER BY created_at DESC`,
    [im.id]
  )
  console.log(`\n=== ANALISES de "${im.nome}" (${im.id}) ===`)
  console.table(r2.rows)
}

await pool.end()

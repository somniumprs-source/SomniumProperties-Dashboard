// One-off: sincroniza o fee de cedência para fonte única (imoveis.fee_cedencia)
// nos projetos Wholesalling existentes.
//   - Candal/Santo Varão: análise tem fee mas o imóvel está null → copiar análise→imóvel
//   - T2 Condeixa: sem fee mas com tranches → definir fee = Σtranches (imóvel + análise)
// Dry-run por defeito; --apply para gravar.
import 'dotenv/config'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const { rows } = await pool.query(`
  SELECT i.id AS imovel_id, i.nome, i.fee_cedencia AS imv_fee,
         a.id AS analise_id, a.fee_cedencia AS an_fee,
         n.id AS negocio_id, n.lucro_estimado, n.pagamentos_faseados
  FROM negocios n
  JOIN imoveis i ON i.id = n.imovel_id
  LEFT JOIN analises a ON a.imovel_id = i.id AND a.activa = true
  WHERE n.categoria = 'Wholesalling' AND n.deleted_at IS NULL
  ORDER BY i.nome`)

console.log(`\n=== ${rows.length} projeto(s) Wholesalling ===`)
console.log(APPLY ? '>>> MODO APPLY\n' : '>>> DRY-RUN (usar --apply)\n')

const client = await pool.connect()
try {
  await client.query('BEGIN')
  for (const r of rows) {
    const imvFee = Number(r.imv_fee)
    const anFee = Number(r.an_fee)
    let pags = []
    try { pags = typeof r.pagamentos_faseados === 'string' ? JSON.parse(r.pagamentos_faseados || '[]') : (r.pagamentos_faseados || []) } catch {}
    const somaTranches = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)

    // Fee alvo: o que estiver definido (imóvel > análise), senão Σtranches
    let feeAlvo = null
    if (Number.isFinite(imvFee) && imvFee > 0) feeAlvo = imvFee
    else if (Number.isFinite(anFee) && anFee > 0) feeAlvo = anFee
    else if (somaTranches > 0) feeAlvo = Math.round(somaTranches * 100) / 100

    if (feeAlvo == null) { console.log(`•  ${r.nome}: sem fee nem tranches — nada a fazer`); continue }

    const precisaImovel = !(Number.isFinite(imvFee) && imvFee === feeAlvo)
    const precisaAnalise = r.analise_id && !(Number.isFinite(anFee) && anFee === feeAlvo)
    if (!precisaImovel && !precisaAnalise) { console.log(`✓  ${r.nome}: já coerente (fee=${feeAlvo})`); continue }

    console.log(`🔧 ${r.nome}: fee=${feeAlvo}${somaTranches > 0 ? ` (Σtranches=${somaTranches})` : ''}` +
      `${precisaImovel ? ` · imóvel ${JSON.stringify(r.imv_fee)}→${feeAlvo}` : ''}` +
      `${precisaAnalise ? ` · análise ${JSON.stringify(r.an_fee)}→${feeAlvo}` : ''}`)

    if (APPLY) {
      if (precisaImovel) await client.query('UPDATE imoveis SET fee_cedencia = $1 WHERE id = $2', [feeAlvo, r.imovel_id])
      if (precisaAnalise) await client.query('UPDATE analises SET fee_cedencia = $1 WHERE id = $2', [feeAlvo, r.analise_id])
    }
  }
  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK')
  console.log(APPLY ? '\n✅ Aplicado.' : '\nℹ️  Dry-run — correr com --apply para gravar.')
} catch (e) {
  await client.query('ROLLBACK'); console.error('❌ rollback:', e.message); process.exitCode = 1
} finally {
  client.release(); await pool.end()
}

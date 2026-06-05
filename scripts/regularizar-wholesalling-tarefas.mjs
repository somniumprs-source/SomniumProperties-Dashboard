// One-off: regulariza as tarefas de projetos Wholesalling já criados para
// alinhar com o template novo (src/db/fasesFixFlip.js):
//   • Fases 1-3 (prospecao, analise_oferta, cpcv_compra) → SEM tarefas (apagar)
//   • Fase 4 (procurar_investidor): renomear "Preparar dossier do deal"
//   • Fase 5 (negociacao_investidor): fundir as 2 tarefas de fee numa + acordo de intenção
//   • Fase 6 (cpcv_cedencia): clarificar "Pagamento do investidor"
//   • Fase 7 (fee_recebido): clarificar "Confirmar recebimento"
//
// Idempotente: renomeações só batem na descrição antiga; apagar fases 1-3 fica no-op
// depois da 1ª passagem. Dry-run por defeito; passar --apply para gravar.
import 'dotenv/config'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const FASES_SEM_TAREFAS = ['prospecao', 'analise_oferta', 'cpcv_compra']

// fase_key → [ [descricao_antiga, descricao_nova], ... ]
const RENOMEAR = {
  procurar_investidor: [
    ['Preparar dossier do deal', 'Preparar dossier do deal (compra c/ fee + análise completa)'],
  ],
  negociacao_investidor: [
    ['Negociar valor de cedência', 'Negociar/definir fee de cedência (Somnium)'],
    ['Definir fee Somnium', 'Formalizar acordo de intenção/reserva'],
  ],
  cpcv_cedencia: [
    ['Pagamento do investidor', 'Recebimento do investidor (reembolso de sinal + fee)'],
  ],
  fee_recebido: [
    ['Confirmar recebimento', 'Confirmar recebimento do fee'],
  ],
}

// Fases de Wholesalling em negócios não apagados
const SQL_FASES = `
  SELECT pf.id AS fase_id, pf.fase_key, pf.negocio_id, n.movimento
  FROM projeto_fases pf
  JOIN negocios n ON n.id = pf.negocio_id
  WHERE n.categoria = 'Wholesalling' AND n.deleted_at IS NULL
`

const client = await pool.connect()
try {
  const { rows: fases } = await client.query(SQL_FASES)
  const negocios = new Set(fases.map(f => f.negocio_id))
  console.log(`\n=== ${negocios.size} negócio(s) Wholesalling · ${fases.length} fase(s) ===`)
  console.log(APPLY ? '>>> MODO APPLY (vai gravar)\n' : '>>> DRY-RUN (nada gravado; usar --apply)\n')

  let apagar = 0, renomear = 0
  await client.query('BEGIN')

  for (const f of fases) {
    if (FASES_SEM_TAREFAS.includes(f.fase_key)) {
      const { rows } = await client.query(
        `SELECT descricao, concluida FROM projeto_tarefas WHERE fase_id = $1 ORDER BY ordem`, [f.fase_id]
      )
      if (rows.length === 0) continue
      const concl = rows.filter(r => r.concluida).length
      console.log(`🗑️  [${f.fase_key}] "${f.movimento}" — apagar ${rows.length} tarefa(s)${concl ? ` (${concl} concluída(s))` : ''}`)
      apagar += rows.length
      if (APPLY) await client.query(`DELETE FROM projeto_tarefas WHERE fase_id = $1`, [f.fase_id])
      continue
    }
    const mapa = RENOMEAR[f.fase_key]
    if (!mapa) continue
    for (const [antiga, nova] of mapa) {
      const { rows } = await client.query(
        `SELECT id FROM projeto_tarefas WHERE fase_id = $1 AND descricao = $2`, [f.fase_id, antiga]
      )
      if (rows.length === 0) continue
      console.log(`✏️  [${f.fase_key}] "${f.movimento}" — "${antiga}" → "${nova}"`)
      renomear += rows.length
      if (APPLY) await client.query(
        `UPDATE projeto_tarefas SET descricao = $1 WHERE fase_id = $2 AND descricao = $3`,
        [nova, f.fase_id, antiga]
      )
    }
  }

  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK')
  console.log(`\n=== Resumo: ${apagar} a apagar · ${renomear} a renomear ===`)
  console.log(APPLY ? '✅ Aplicado.' : 'ℹ️  Dry-run — correr com --apply para gravar.')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('❌ rollback:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

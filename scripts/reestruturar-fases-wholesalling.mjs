// One-off: reestrutura as fases dos projetos Wholesalling já criados para a nova
// ordem (sem Prospecção/Análise & Oferta; CPCV de Compra entre Negociação e Cedência):
//   procurar_investidor → negociacao_investidor → cpcv_compra → cpcv_cedencia → fee_recebido
// - Apaga as fases prospecao e analise_oferta (CASCADE apaga as suas tarefas)
// - Reordena as 5 fases restantes
// - Restaura as 4 tarefas do CPCV de Compra (concluídas se a fase já estiver concluída)
// Idempotente. Dry-run por defeito; --apply para gravar.
import 'dotenv/config'
import pg from 'pg'
import { randomUUID } from 'crypto'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const APAGAR = ['prospecao', 'analise_oferta']
const ORDEM = { procurar_investidor: 0, negociacao_investidor: 1, cpcv_compra: 2, cpcv_cedencia: 3, fee_recebido: 4 }
const CPCV_TAREFAS = ['Redigir CPCV', 'Validar cláusulas (prazo, sinal, cessão)', 'Pagamento de sinal', 'Assinatura CPCV com vendedor']

const client = await pool.connect()
try {
  const { rows: negs } = await client.query(
    `SELECT id, movimento FROM negocios WHERE categoria='Wholesalling' AND deleted_at IS NULL ORDER BY movimento`
  )
  console.log(`\n=== ${negs.length} projeto(s) Wholesalling ===`)
  console.log(APPLY ? '>>> MODO APPLY\n' : '>>> DRY-RUN (usar --apply)\n')

  await client.query('BEGIN')
  for (const n of negs) {
    const { rows: fases } = await client.query(
      `SELECT id, fase_key, ordem, estado FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`, [n.id]
    )
    // 1. Apagar fases exploratórias
    for (const f of fases.filter(f => APAGAR.includes(f.fase_key))) {
      console.log(`🗑️  [${n.movimento}] apagar fase ${f.fase_key} (estado=${f.estado})`)
      if (APPLY) await client.query(`DELETE FROM projeto_fases WHERE id = $1`, [f.id]) // CASCADE → tarefas
    }
    // 2. Reordenar restantes + 3. restaurar tarefas do cpcv_compra
    for (const f of fases.filter(f => f.fase_key in ORDEM)) {
      const novaOrdem = ORDEM[f.fase_key]
      if (f.ordem !== novaOrdem) {
        console.log(`↕️  [${n.movimento}] ${f.fase_key}: ordem ${f.ordem} → ${novaOrdem}`)
        if (APPLY) await client.query(`UPDATE projeto_fases SET ordem = $1 WHERE id = $2`, [novaOrdem, f.id])
      }
      if (f.fase_key === 'cpcv_compra') {
        const { rows: [{ c }] } = await client.query(
          `SELECT COUNT(*)::int AS c FROM projeto_tarefas WHERE fase_id = $1`, [f.id]
        )
        if (c === 0) {
          const concl = f.estado === 'concluida'
          console.log(`➕ [${n.movimento}] cpcv_compra: restaurar ${CPCV_TAREFAS.length} tarefa(s)${concl ? ' (concluídas)' : ''}`)
          if (APPLY) {
            for (let j = 0; j < CPCV_TAREFAS.length; j++) {
              await client.query(
                `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem, concluida, concluida_em)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [randomUUID(), f.id, CPCV_TAREFAS[j], j, concl ? 1 : 0, concl ? new Date().toISOString() : null]
              )
            }
          }
        } else {
          console.log(`✓  [${n.movimento}] cpcv_compra já tem ${c} tarefa(s) — não toco`)
        }
      }
    }
  }
  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK')
  console.log(APPLY ? '\n✅ Aplicado.' : '\nℹ️  Dry-run — correr com --apply para gravar.')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('❌ rollback:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

/**
 * Arquivamento de tarefas concluídas há mais de 90 dias.
 *
 * Estratégia: marcar arquivada=TRUE em vez de apagar (reversível).
 * - /api/tarefas filtra arquivada=FALSE por defeito
 * - Métricas/KPI usam getTarefas() directamente → continuam a contar tudo
 * - Desarquivamento: UPDATE tarefas SET arquivada=FALSE WHERE id=$1
 */
import pool from './pg.js'

const STATUS_CONCLUIDOS = ['Concluida', 'Concluída', 'Concluído', 'Concluido']

export async function arquivarTarefasAntigas(diasLimite = 90) {
  const limiteIso = new Date(Date.now() - diasLimite * 86400000).toISOString()
  const { rows } = await pool.query(
    `UPDATE tarefas
       SET arquivada = TRUE, arquivada_em = NOW()::TEXT
     WHERE arquivada = FALSE
       AND status = ANY($1::text[])
       AND COALESCE(fim, updated_at) < $2
     RETURNING id`,
    [STATUS_CONCLUIDOS, limiteIso]
  )
  return rows.length
}

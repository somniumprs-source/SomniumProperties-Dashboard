/**
 * Follow-up de imóvel pedido na ficha (bloco "Próximos passos").
 *
 * Ao contrário da geração semanal da agenda (desligada em agendaEngine), isto
 * corre sempre: é o utilizador que regista a data, por isso a tarefa 'A fazer'
 * é criada na hora (inicio = data sem hora → evento de dia inteiro no Google
 * Calendar). Mesma origem de sempre (imovel/data_follow_up).
 *
 * Mantido sem Express/Hono para ser portado 1:1 para
 * supabase/functions/_shared/followUpImovel.ts.
 */
import { randomUUID } from 'crypto'

const hojeLisboa = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())

// Follow-up feito hoje: fica no histórico do imóvel, com ou sem sucesso.
export async function registarFollowUpFeito(pool, imovelId, { resultado, motivo = null, proximaData = null, user = null }) {
  await pool.query(
    `INSERT INTO imovel_follow_ups (id, imovel_id, data, resultado, motivo, proxima_data, autor)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), imovelId, hojeLisboa(), resultado, (motivo || '').trim() || null, proximaData, user?.nome || user?.email || null]
  )
}

// Agenda o follow-up para imoveis.data_follow_up (já gravada pela rota).
// semSucesso: o follow-up de hoje foi tentado e falhou — fica registado, a
// tarefa que estava por fazer é concluída e nasce uma nova para a nova data.
// Sem isso, a tarefa por fazer (se houver) é só movida para a nova data.
export async function agendarFollowUpImovelManual(pool, imovelId, { semSucesso = false, motivo = null, user = null } = {}) {
  const { rows: [im] } = await pool.query(
    'SELECT id, nome, regiao, data_follow_up FROM imoveis WHERE id = $1',
    [imovelId]
  )
  if (!im?.data_follow_up) return null
  const data = String(im.data_follow_up).slice(0, 10)
  const titulo = `Follow-up imóvel — ${im.nome || 'Imóvel'}`
  if (semSucesso) {
    await registarFollowUpFeito(pool, imovelId, { resultado: 'Sem sucesso', motivo, proximaData: data, user })
    await pool.query(
      `UPDATE tarefas SET status = 'Concluída', updated_at = NOW()
       WHERE origem_tipo = 'imovel' AND origem_id = $1 AND origem_campo = 'data_follow_up' AND status != 'Concluída'`,
      [imovelId]
    )
  }
  const { rows: abertas } = await pool.query(
    `SELECT id FROM tarefas
     WHERE origem_tipo = 'imovel' AND origem_id = $1 AND origem_campo = 'data_follow_up' AND status != 'Concluída'
     ORDER BY created_at DESC LIMIT 1`,
    [imovelId]
  )
  if (abertas.length) {
    await pool.query(
      `UPDATE tarefas SET tarefa = $1, data_limite = $2, inicio = $2, fim = $2, regiao = $3, updated_at = NOW()
       WHERE id = $4`,
      [titulo, data, im.regiao || null, abertas[0].id]
    )
    return abertas[0].id
  }
  const id = randomUUID()
  await pool.query(
    `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, inicio, fim, user_id, funcionario,
                          tempo_horas, regiao, origem_tipo, origem_id, origem_campo)
     VALUES ($1,$2,'Follow Up Consultores','A fazer','alta',$3,$3,$3,$4,$5,0.5,$6,'imovel',$7,'data_follow_up')`,
    [id, titulo, data, user?.id || null, user?.nome || null, im.regiao || null, imovelId]
  )
  return id
}

// Follow-up de imóvel pedido na ficha (bloco "Próximos passos").
// Porta 1:1 de src/db/followUpImovel.js (Node -> Deno). Ver esse ficheiro
// para os comentários completos de desenho.
import pool from "./pg.ts";

type User = { id?: string; nome?: string; email?: string } | null;

const hojeLisboa = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())

// Follow-up feito hoje: fica no histórico do imóvel, com ou sem sucesso.
export async function registarFollowUpFeito(imovelId: string, { resultado, motivo = null, proximaData = null, user = null }: { resultado: string; motivo?: string | null; proximaData?: string | null; user?: User }) {
  await pool.query(
    `INSERT INTO imovel_follow_ups (id, imovel_id, data, resultado, motivo, proxima_data, autor)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), imovelId, hojeLisboa(), resultado, (motivo || '').trim() || null, proximaData, user?.nome || user?.email || null]
  )
}

// Agenda o follow-up para imoveis.data_follow_up (já gravada pela rota).
// semSucesso: o follow-up de hoje foi tentado e falhou — fica registado, a
// tarefa que estava por fazer é concluída e nasce uma nova para a nova data.
// Sem isso, a tarefa por fazer (se houver) é só movida para a nova data.
export async function agendarFollowUpImovelManual(imovelId: string, { semSucesso = false, motivo = null, user = null }: { semSucesso?: boolean; motivo?: string | null; user?: User } = {}) {
  const { rows: [im] } = await pool.query(
    'SELECT id, nome, regiao, data_follow_up FROM imoveis WHERE id = $1',
    [imovelId]
  )
  if (!im?.data_follow_up) return null
  const data = String(im.data_follow_up).slice(0, 10)
  const titulo = `Follow-up imóvel — ${im.nome || 'Imóvel'}`
  if (semSucesso) {
    await registarFollowUpFeito(imovelId, { resultado: 'Sem sucesso', motivo, proximaData: data, user })
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
  const id = crypto.randomUUID()
  await pool.query(
    `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, inicio, fim, user_id, funcionario,
                          tempo_horas, regiao, origem_tipo, origem_id, origem_campo)
     VALUES ($1,$2,'Follow Up Consultores','A fazer','alta',$3,$3,$3,$4,$5,0.5,$6,'imovel',$7,'data_follow_up')`,
    [id, titulo, data, user?.id || null, user?.nome || null, im.regiao || null, imovelId]
  )
  return id
}

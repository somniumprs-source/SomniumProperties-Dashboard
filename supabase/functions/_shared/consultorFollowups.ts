// Extraído para módulo partilhado (em vez de viver só em crm/index.ts) para
// ser reutilizável por PATCH /gravacoes/:id/registo (follow-up automático
// por desfecho de chamada, ver C2 da auditoria) e por autoFillConsultor
// (meetingAnalysis.ts) sem criar um ciclo de import entre os dois — ambos
// devem criar uma entrada real em consultor_followups, nunca escrever os
// campos legados directamente.
import pool from "./pg.ts";
import { ConsultorFollowups, Consultores } from "./crud.ts";

let _imovelColumnEnsured = false;
async function ensureFollowupImovelColumn() {
  if (_imovelColumnEnsured) return;
  await pool.query(`ALTER TABLE consultor_followups ADD COLUMN IF NOT EXISTS imovel_id TEXT;`);
  _imovelColumnEnsured = true;
}

export async function criarFollowUpConsultor(consultorId: string, body: any) {
  await ensureFollowupImovelColumn();
  const { data, motivo, proximo_follow_up, imovel_id } = body;
  if (!data) throw new Error("Data do follow-up é obrigatória");

  const item = await ConsultorFollowups.create({
    consultor_id: consultorId,
    imovel_id: imovel_id || null,
    data,
    motivo: motivo || null,
    proximo_follow_up: proximo_follow_up || null,
  });

  const { rows } = await pool.query(
    `SELECT data, motivo, proximo_follow_up FROM consultor_followups
     WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC LIMIT 1`,
    [consultorId],
  );
  if (rows[0]) {
    await Consultores.update(consultorId, {
      data_follow_up: rows[0].data,
      motivo_follow_up: rows[0].motivo,
      data_proximo_follow_up: rows[0].proximo_follow_up,
    });
  }

  const { rows: cur } = await pool.query(
    `SELECT data_primeira_call FROM consultores WHERE id = $1`,
    [consultorId],
  );
  if (cur[0] && (cur[0].data_primeira_call == null || cur[0].data_primeira_call === "")) {
    const { rows: oldest } = await pool.query(
      `SELECT data FROM consultor_followups
       WHERE consultor_id = $1 ORDER BY data ASC, created_at ASC LIMIT 1`,
      [consultorId],
    );
    if (oldest[0]?.data) {
      await Consultores.update(consultorId, { data_primeira_call: oldest[0].data });
    }
  }

  return item;
}

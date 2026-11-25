// @ts-nocheck
// Regras das tarefas gerais (Agenda), iguais em todo o lado (auditoria D11).
// Espelho de src/constants/regrasTarefas.js (manter em sync).
//
// • «Atrasada» não é um estado que se escreve: é calculado (tarefa aberta com
//   o prazo ultrapassado). Um «Atrasada» que chegue é gravado como «A fazer».
// • Prazo = data limite (até ao fim desse dia) ou, sem ela, o início marcado.
// • Uma tarefa aberta criada ou editada por uma pessoa tem responsável e prazo.

export const ESTADOS_TAREFA = ['A fazer', 'Em andamento', 'Concluída']

export const tarefaConcluida = t => t?.status === 'Concluída' || t?.status === 'Concluida'

export const normalizarEstadoTarefa = s => (s === 'Atrasada' ? 'A fazer' : s)

export function prazoTarefa(t) {
  const dl = String(t?.data_limite ?? '').trim()
  if (dl) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dl) ? `${dl}T23:59:59` : dl)
    return isNaN(d) ? null : d
  }
  // Início só com o dia (evento de dia inteiro): o prazo é o fim desse dia.
  const ini = String(t?.inicio ?? '').trim()
  if (!ini) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(ini) ? `${ini}T23:59:59` : ini)
  return isNaN(d) ? null : d
}

export function tarefaAtrasada(t, agora = new Date()) {
  // Por aprovar ainda não é tarefa da Agenda: não conta como atrasada.
  if (!t || tarefaConcluida(t) || t.arquivada || t.por_aprovar) return false
  const p = prazoTarefa(t)
  return !!p && p < agora
}

// O que falta a uma tarefa aberta (null = está completa).
export function faltaNaTarefa(t) {
  if (!t || tarefaConcluida(t)) return null
  const falta = []
  if (!String(t.funcionario ?? '').trim()) falta.push('o responsável')
  if (!prazoTarefa(t)) falta.push('a data ou o prazo')
  return falta.length ? `Indica ${falta.join(' e ')} da tarefa` : null
}

// Call ou reunião com investidor só fica concluída com prova na ficha (25/11/2026):
// a tarefa tem de estar ligada ao investidor e haver, desde 3 dias antes do
// início, um contacto (sem ser nota), uma gravação ou uma reunião registados.
export const CATEGORIAS_CONTACTO_INVESTIDOR = ['Cold Call a Investidores', 'Discovery Call a Investidores', 'Follow-up de Investidores', 'Follow Up Investidores', 'Reunião com Investidores', 'Reunião Investidores']

export async function faltaRegistoInvestidor(pool, atual, final) {
  if (!tarefaConcluida(final) || tarefaConcluida(atual)) return null
  if (!CATEGORIAS_CONTACTO_INVESTIDOR.includes(final.categoria)) return null
  if (final.origem_tipo !== 'investidor' || !final.origem_id) return 'Liga a tarefa a um investidor e regista o contacto na ficha antes de a concluir'
  const desde = String(final.inicio || '').slice(0, 10) || '0000-00-00'
  const { rows: [r] } = await pool.query(
    `SELECT (EXISTS (SELECT 1 FROM investidor_interacoes x WHERE x.investidor_id = $1 AND x.canal IS DISTINCT FROM 'Nota'
               AND (x.origem_ref = 'tarefa:' || $2 OR substr(x.data_hora, 1, 10) >= to_char($3::date - 3, 'YYYY-MM-DD')))
         OR EXISTS (SELECT 1 FROM investidor_gravacoes g WHERE g.investidor_id = $1
               AND (g.tarefa_id = $2 OR substr(g.data_chamada, 1, 10) >= to_char($3::date - 3, 'YYYY-MM-DD')))) AS ok`,
    [final.origem_id, final.id, desde === '0000-00-00' ? '1970-01-01' : desde])
  return r?.ok ? null : 'Regista o contacto na ficha do investidor antes de concluir a tarefa'
}

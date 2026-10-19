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
  const ini = String(t?.inicio ?? '').trim()
  if (!ini) return null
  const d = new Date(ini)
  return isNaN(d) ? null : d
}

export function tarefaAtrasada(t, agora = new Date()) {
  if (!t || tarefaConcluida(t) || t.arquivada) return false
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

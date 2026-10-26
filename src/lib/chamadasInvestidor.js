// Labels das chamadas gravadas com investidores (SOP 4). Espelho dos valores
// aceites em src/db/chamadasInvestidor.js (e no gémeo Deno).

export const TIPO_CHAMADA_INV_LABEL = { cold_call: 'Cold Call', follow_up: 'Follow-up' }
export const RESULTADO_INV_LABEL = { atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', recusou: 'Recusou', numero_errado: 'Número errado' }
export const PROXIMO_PASSO_INV_LABEL = {
  entrevista_marcada: 'Entrevista marcada',
  follow_up_agendado: 'Follow-up agendado',
  enviar_forms: 'Enviar Forms',
  sem_interesse: 'Sem interesse',
  nao_elegivel: 'Não elegível',
}
export const TEMPERATURA_INV_LABEL = { quente: 'Quente (30 dias)', intermedio: 'Intermédio (60 dias)', frio: 'Frio (90 dias)' }

export const PASSOS_INV_LABEL = {
  abertura: 'Abertura e apresentação',
  perfil: 'Tipo de investidor e experiência',
  capital: 'Capacidade financeira',
  retorno: 'Retorno esperado e risco',
  alinhamento: 'Alinhamento estratégico',
  compromisso: 'Disponibilidade e timing',
  objeccoes: 'Gestão de objecções',
  fecho: 'Fecho e próximo passo',
  retoma: 'Retoma de contexto',
  valor: 'Valor novo',
  actualizacao: 'Actualização da situação',
  dados_em_falta: 'Recolha de dados em falta',
}

export const CRITERIOS_CLASSIFICACAO_LABEL = {
  capacidade_financeira: 'Capacidade financeira',
  experiencia: 'Experiência imobiliária',
  alinhamento: 'Alinhamento estratégico',
  credibilidade: 'Estabilidade e credibilidade',
  compromisso: 'Disponibilidade e compromisso',
}

// Classes SOP 4 (5.4): soma dos 5 critérios, máximo 25.
export function classeSop4(total) {
  if (total == null) return null
  if (total >= 22) return 'A · Prioritário'
  if (total >= 18) return 'B · Elegível'
  if (total >= 14) return 'C · Observação'
  return 'D · Não elegível'
}

export function corNota(nota) {
  if (nota == null) return 'bg-surface-muted text-ink-muted'
  if (nota >= 75) return 'bg-success/15 text-success'
  if (nota >= 50) return 'bg-warning/15 text-warning'
  return 'bg-danger/15 text-danger'
}

export function corBarra(pct) {
  if (pct == null) return 'bg-line'
  if (pct >= 75) return 'bg-success'
  if (pct >= 50) return 'bg-warning'
  return 'bg-danger'
}

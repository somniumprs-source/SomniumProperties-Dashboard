// Labels das chamadas gravadas com investidores (SOP 23 v2.1). Espelho dos valores
// aceites em src/db/chamadasInvestidor.js (e no gémeo Deno).

export const TIPO_CHAMADA_INV_LABEL = { cold_call: 'Chamada 1 (Cold Call)', follow_up: 'Recontacto (Follow-up)', discovery: 'Discovery Call' }
export const RESULTADO_INV_LABEL = { atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', recusou: 'Recusou', numero_errado: 'Número errado' }
export const PROXIMO_PASSO_INV_LABEL = {
  entrevista_marcada: 'Discovery/apresentação marcada',
  follow_up_agendado: 'Follow-up agendado',
  enviar_forms: 'Chamada 1 remarcada',
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
  // SOP 23 v2.1
  gravacao: 'Permissão para gravar',
  experiencia: 'Experiência',
  montante: 'Montante',
  disponibilidade: 'Disponibilidade do capital',
  decisor: 'Decisor',
  sem_retornos: 'Sem oportunidades nem retornos',
  qualifica_falta: 'Qualifica só o que faltava',
  objetivo: 'Bloco 1: Objetivo',
  porque: 'Bloco 2: Porquê e urgência',
  dor: 'Bloco 3: Desafios (a dor)',
  bifurcacao: 'Bifurcação',
  criterios_ativa: 'Critérios de compra (ativa)',
  confirmacao: 'Confirmar antes de terminar',
  regra_70_30: 'Regra 70/30',
}

export const CRITERIOS_CLASSIFICACAO_LABEL = {
  capacidade_financeira: 'Capacidade financeira',
  experiencia: 'Experiência imobiliária',
  alinhamento: 'Alinhamento estratégico',
  credibilidade: 'Estabilidade e credibilidade',
  compromisso: 'Disponibilidade e compromisso',
}

// A conversão para classe A–D vive só em supabase/functions/_shared/classeInvestidor.js
// (scorecard da discovery, SOP 23). A pré-classificação de 5 critérios das cold
// calls é só indicativa e já não se converte em classe.

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
